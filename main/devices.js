import { WebUSB } from 'usb'
import { FtdiBridge } from './ftdi'
import { Bme280 } from './bme280'

const vendorId = 0x0403
const productId = 0x6014

const BME280_ADDR = 0x76

const webusb = new WebUSB({
  allowAllDevices: true,
})

export class Publisher {
  appWindow = null

  latestData = {}

  connect(appWindow) {
    if (this.appWindow !== null) {
      throw new Error('Application window already registered')
    }

    this.appWindow = appWindow
    this.republish()
  }

  disconnect(appWindow) {
    if (this.appWindow !== appWindow) {
      throw new Error('Unexpected application window disconnect')
    }

    this.appWindow = null
  }

  publish(channel, data) {
    this.latestData[channel] = data
    if (this.appWindow !== null) {
      this.appWindow.webContents.send(channel, data)
    }
  }

  republish() {
    if (this.appWindow === null) {
      return
    }

    for (let channel in this.latestData) {
      this.appWindow.webContents.send(channel, this.latestData[channel])
    }
  }
}

const DeviceTypes = Object.freeze({
  INSIDE: 'INSIDE',
  OUTSIDE: 'OUTSIDE',
})

class Device {
  constructor(usb) {
    this.usb = usb
  }

  get type() {
    throw new Error('Device type not implemented!')
  }

  async sense() {}

  async react() {}

  async close() {}
}

class SensorDevice extends Device {
  constructor(usb, bridge, sensor, publisher, sensorChannel) {
    super(usb)

    this.bridge = bridge
    this.sensor = sensor
    this.publisher = publisher
    this.sensorChannel = sensorChannel
  }

  async sense() {
    let temperature, pressure, humidity
    try {
      ;[temperature, pressure, humidity] = await this.sensor.readTempPressHum()
    } finally {
      this.publish(temperature, pressure, humidity)
    }
  }

  async close() {
    this.publish(undefined, undefined, undefined)

    if (this.bridge !== null) {
      try {
        await this.bridge.close()
      } catch (e) {}
      this.bridge = null
    }
  }

  publish(temperature, pressure, humidity) {
    this.publisher.publish(this.sensorChannel, { temperature, pressure, humidity })
  }
}

class InsideDevice extends SensorDevice {
  constructor(usb, bridge, sensor, publisher) {
    super(usb, bridge, sensor, publisher, 'inside')
  }

  get type() {
    return DeviceTypes.INSIDE
  }
}

class StickyTrigger {
  constructor(normalValue, triggerDuration) {
    this.normalValue = normalValue
    this.triggerDuration = triggerDuration
    this.value = normalValue
    this.triggeredUntil = null
  }

  trigger() {
    this.value = !this.normalValue
    this.triggeredUntil = Date.now().valueOf() + this.triggerDuration
  }

  update() {
    if (this.triggeredUntil === null) {
      this.value = this.normalValue
    } else if (Date.now().valueOf() < this.triggeredUntil) {
      this.value = !this.normalValue
    } else {
      this.value = this.normalValue
      this.triggeredUntil = null
    }
  }
}

class OutsideDevice extends SensorDevice {
  freezerTrigger = new StickyTrigger(false, 10 * 60 * 1000)
  machineTrigger = new StickyTrigger(true, 24 * 60 * 60 * 1000)

  constructor(usb, bridge, sensor, publisher) {
    super(usb, bridge, sensor, publisher, 'outside')
  }

  get type() {
    return DeviceTypes.OUTSIDE
  }

  async react() {
    const insideTemperature = this.publisher.latestData.inside && this.publisher.latestData.inside.temperature
    const outsideTemperature = this.publisher.latestData.outside && this.publisher.latestData.outside.temperature

    if (insideTemperature !== undefined && outsideTemperature !== undefined) {
      if (insideTemperature - outsideTemperature > 3) {
        this.freezerTrigger.trigger()
      }
    } else if (insideTemperature !== undefined) {
      if (insideTemperature > 32) {
        this.freezerTrigger.trigger()
      }
    }

    if (insideTemperature !== undefined) {
      if (insideTemperature > 50) {
        this.machineTrigger.trigger()
      }
    } else if (outsideTemperature !== undefined) {
      if (outsideTemperature > 50) {
        this.machineTrigger.trigger()
      }
    }

    this.freezerTrigger.update()
    this.machineTrigger.update()

    let freezer = this.freezerTrigger.value
    let machine = this.machineTrigger.value

    try {
      await this.bridge.mpsseSetAC([undefined, undefined, undefined, freezer ? 0 : undefined, machine ? 0 : undefined])
    } catch (e) {
      freezer = undefined
      machine = undefined
    }

    this.publisher.publish('switch', { freezer, machine })
  }

  async close() {
    await super.close()

    this.publisher.publish('switch', { freezer: undefined, machine: undefined })
  }
}

// sensor.calibrationHash
const deviceTypeBySensorHash = Object.freeze({
  4890670046: DeviceTypes.OUTSIDE,
  5145062515: DeviceTypes.INSIDE,
  31775428: DeviceTypes.INSIDE, // prototype
})

const createDevice = (type, usb, bridge, sensor, publisher) => {
  switch (type) {
    case DeviceTypes.INSIDE:
      return new InsideDevice(usb, bridge, sensor, publisher)

    case DeviceTypes.OUTSIDE:
      return new OutsideDevice(usb, bridge, sensor, publisher)
  }
}

export class DeviceManager {
  devices = []

  updateTimeout = null

  disconnectedUsbs = []

  stopRequested = false
  onStopped = null

  constructor(publisher) {
    this.publisher = publisher
  }

  async start() {
    webusb.addEventListener('connect', this.onConnect)
    webusb.addEventListener('disconnect', this.onDisconnect)

    await this.scan()

    this.stopRequested = false
    this.scheduleUpdate()
  }

  async stop(onStopped = () => {}) {
    this.onStopped = onStopped

    webusb.removeEventListener('connect', this.onConnect)
    webusb.removeEventListener('disconnect', this.onDisconnect)

    if (await this.stopUpdate()) {
      await this.stopDevices()
    }
  }

  async stopDevices() {
    for (let i = 0; i < this.devices.length; i++) {
      await this.devices[i].close()
    }

    this.devices = []

    if (this.onStopped) {
      this.onStopped()
    }
  }

  async scan() {
    const usbs = await webusb.getDevices()
    for (let i = 0; i < usbs.length; i++) {
      await this.deviceConnected(usbs[i])
    }
  }

  async deviceConnected(usb) {
    if (usb.vendorId !== vendorId || usb.productId !== productId) {
      return
    }

    const bridge = new FtdiBridge(usb)
    try {
      await bridge.open()
      await bridge.reset()

      const latency = await bridge.getLatencyTimer()
      if (latency !== 16) await bridge.setLatencyTimer(16)

      await bridge.enterMpsseMode()
      await bridge.mpsseSelfCheck()

      await bridge.mpsseEnterI2cMode()

      const sensor = new Bme280(bridge, BME280_ADDR)
      await sensor.init()

      const sensorHash = sensor.calibrationHash
      const deviceType = deviceTypeBySensorHash[sensorHash]
      if (deviceType === undefined) {
        console.log('Unknown sensor hash:', sensorHash)
      } else {
        const existingDevices = this.devices.filter((d) => d.type === deviceType)
        if (!existingDevices.length) {
          const device = createDevice(deviceType, usb, bridge, sensor, this.publisher)
          if (device) {
            this.devices.push(device)
            console.log(`Device ${deviceType} registered`)
            return // don't close
          } else {
            console.log(`Device ${deviceType} not implemented`)
          }
        } else {
          console.log(`Device ${deviceType} is already connected`)
        }
      }

      await bridge.close()
    } catch (e) {
      try {
        await bridge.close()
      } catch (e) {}
    }
  }

  async deviceDisconnected(usb) {
    this.disconnectedUsbs.push(usb)
  }

  onConnect = async (ev) => {
    await this.deviceConnected(ev.device)
  }

  onDisconnect = async (ev) => {
    await this.deviceDisconnected(ev.device)
  }

  onUpdate = async () => {
    this.updateTimeout = null

    await this.closeDisconnectedDevices()

    for (let i = 0; i < this.devices.length && !this.stopRequested; i++) {
      const device = this.devices[i]

      try {
        await device.sense()
      } catch (e) {
        console.error('Error in sense loop:', e)
      }

      await this.closeDisconnectedDevices()
    }

    for (let i = 0; i < this.devices.length && !this.stopRequested; i++) {
      const device = this.devices[i]

      try {
        await device.react()
      } catch (e) {
        console.error('Error in react loop:', e)
      }

      await this.closeDisconnectedDevices()
    }

    if (this.stopRequested) {
      await this.stopDevices()
    } else {
      this.scheduleUpdate()
    }
  }

  scheduleUpdate() {
    this.updateTimeout = setTimeout(this.onUpdate, 100)
  }

  async stopUpdate() {
    if (this.updateTimeout) {
      // in-between updates
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
      return true
    } else {
      // request stop and the other "thread" should stop devices
      this.stopRequested = true
      return false
    }
  }

  async closeDisconnectedDevices() {
    while (this.disconnectedUsbs.length > 0) {
      const usb = this.disconnectedUsbs.shift()
      for (let i = 0; i < this.devices.length; i++) {
        const device = this.devices[i]
        if (device.usb === usb) {
          try {
            await device.close()
          } catch (e) {
            console.error('Silent close failed:', e)
          }

          this.devices.splice(i, 1)
          i -= 1
        }
      }
    }
  }
}

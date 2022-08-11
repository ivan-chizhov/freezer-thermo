import { FtdiBridge } from './ftdi'

const Bme280Registers = Object.freeze({
  ID: 0xd0,

  DIG_T1: 0x88,
  DIG_T2: 0x8a,
  DIG_T3: 0x8c,

  DIG_P1: 0x8e,
  DIG_P2: 0x90,
  DIG_P3: 0x92,
  DIG_P4: 0x94,
  DIG_P5: 0x96,
  DIG_P6: 0x98,
  DIG_P7: 0x9a,
  DIG_P8: 0x9c,
  DIG_P9: 0x9e,

  DIG_H1: 0xa1,
  DIG_H2: 0xe1,
  DIG_H3: 0xe3,
  DIG_H4: 0xe4,
  DIG_H6: 0xe7,

  CTRL_HUM: 0xf2,
  CTRL_MEAS: 0xf4,

  PRESS: 0xf7,
  TEMP: 0xfa,
})

const BME280_CHIP_ID = 0x60

export class Bme280 {
  constructor(bridge = new FtdiBridge(), address = 0x00) {
    this.bridge = bridge
    this.address = address
  }

  async init() {
    const chipId = await this.read8u(Bme280Registers.ID)
    if (chipId !== BME280_CHIP_ID) throw new Error(`Invalid chip id: ${chipId}, expected: ${BME280_CHIP_ID}`)

    this.digT1 = await this.read16u(Bme280Registers.DIG_T1)
    this.digT2 = await this.read16s(Bme280Registers.DIG_T2)
    this.digT3 = await this.read16s(Bme280Registers.DIG_T3)

    this.digP1 = await this.read16u(Bme280Registers.DIG_P1)
    this.digP2 = await this.read16s(Bme280Registers.DIG_P2)
    this.digP3 = await this.read16s(Bme280Registers.DIG_P3)
    this.digP4 = await this.read16s(Bme280Registers.DIG_P4)
    this.digP5 = await this.read16s(Bme280Registers.DIG_P5)
    this.digP6 = await this.read16s(Bme280Registers.DIG_P6)
    this.digP7 = await this.read16s(Bme280Registers.DIG_P7)
    this.digP8 = await this.read16s(Bme280Registers.DIG_P8)
    this.digP9 = await this.read16s(Bme280Registers.DIG_P9)

    this.digH1 = await this.read8u(Bme280Registers.DIG_H1)
    this.digH2 = await this.read16s(Bme280Registers.DIG_H2)
    this.digH3 = await this.read8u(Bme280Registers.DIG_H3)
    const [digH4, digH5] = await this.read1212(Bme280Registers.DIG_H4)
    this.digH4 = digH4
    this.digH5 = digH5
    this.digH6 = await this.read8s(Bme280Registers.DIG_H6)

    await this.write8u(Bme280Registers.CTRL_HUM, 0b00000001) // h * 1
    await this.write8u(Bme280Registers.CTRL_MEAS, 0b00100111) // t * 1, h * 1, normal
  }

  calibrationHash() {
    let value = 17
    const hash = (param) => (value = (value << 5) - value + param) // shift operation truncates value to 32-bits

    hash(this.digT1)
    hash(this.digT2)
    hash(this.digT3)

    hash(this.digP1)
    hash(this.digP2)
    hash(this.digP3)
    hash(this.digP4)
    hash(this.digP5)
    hash(this.digP6)
    hash(this.digP7)
    hash(this.digP8)
    hash(this.digP9)

    hash(this.digH1)
    hash(this.digH2)
    hash(this.digH3)
    hash(this.digH4)
    hash(this.digH5)
    hash(this.digH6)

    return value
  }

  async readTempPressHum() {
    const array = await this.bridge.i2cTransferPacket(this.address, new Uint8Array([Bme280Registers.PRESS]).buffer, 8)
    const buffer = new Uint8Array(array)

    const adcT = (buffer[3] << 12) | (buffer[4] << 4) | (buffer[5] >> 4)
    if (adcT === 0x80000) {
      return []
    }

    const tempFine = this.compensateTempFine(adcT)
    const temp = this.tempFineToC(tempFine)

    const adcP = (buffer[0] << 12) | (buffer[1] << 4) | (buffer[2] >> 4)
    if (adcP === 0x80000) {
      return [temp]
    }

    const press = this.compensatePress(adcP, tempFine)

    const adcH = (buffer[6] << 8) | buffer[7]
    if (adcH === 0x8000) {
      return [temp, press]
    }

    const hum = this.compensateHum(adcH, tempFine)

    return [temp, press, hum]
  }

  async read8u(register) {
    const buffer = await this.bridge.i2cTransferPacket(this.address, new Uint8Array([register]).buffer, 1)
    return new DataView(buffer).getUint8(0)
  }

  async read8s(register) {
    const buffer = await this.bridge.i2cTransferPacket(this.address, new Uint8Array([register]).buffer, 1)
    return new DataView(buffer).getInt8(0)
  }

  async read16u(register) {
    const buffer = await this.bridge.i2cTransferPacket(this.address, new Uint8Array([register]).buffer, 2)
    return new DataView(buffer).getUint16(0, true)
  }

  async read16s(register) {
    const buffer = await this.bridge.i2cTransferPacket(this.address, new Uint8Array([register]).buffer, 2)
    return new DataView(buffer).getInt16(0, true)
  }

  async read1212(register) {
    const buffer = await this.bridge.i2cTransferPacket(this.address, new Uint8Array([register]).buffer, 3)
    const view = new DataView(buffer)
    const first = (view.getInt8(0) << 4) | (view.getUint8(1) & 0x0f)
    const second = (view.getInt8(2) << 4) | (view.getUint8(1) >> 4)
    return [first, second]
  }

  async write8u(register, value) {
    await this.bridge.i2cTransferPacket(this.address, new Uint8Array([register, value]).buffer)
  }

  compensateTempFine(adcT) {
    let var1, var2

    var1 = ((adcT >> 3) - (this.digT1 << 1)) * (this.digT2 >> 11)
    var2 = (adcT >> 4) - this.digT1
    var2 = (((var2 * var2) >> 12) * this.digT3) >> 14
    return var1 + var2
  }

  tempFineToC(tempFine) {
    return ((tempFine * 5 + 128) >> 8) / 100
  }

  compensatePress(adcP, tempFine) {
    let var1, var2, p

    var1 = BigInt(tempFine) - 128000n
    var2 = var1 * var1 * BigInt(this.digP6)
    var2 = var2 + ((var1 * BigInt(this.digP5)) << 17n)
    var2 = var2 + (BigInt(this.digP4) << 35n)
    var1 = ((var1 * var1 * BigInt(this.digP3)) >> 8n) + ((var1 * BigInt(this.digP2)) << 12n)
    var1 = (((1n << 47n) + var1) * BigInt(this.digP1)) >> 33n
    if (var1 === 0n) {
      // avoid DIV0
      return 0
    }
    p = 1048576n - BigInt(adcP)
    p = (((p << 31n) - var2) * 3125n) / var1
    var1 = (BigInt(this.digP9) * (p >> 13n) * (p >> 13n)) >> 25n
    var2 = (BigInt(this.digP8) * p) >> 19n
    p = ((p + var1 + var2) >> 8n) + (BigInt(this.digP7) << 4n)
    return Number(p >> 8n) / 100
  }

  compensateHum(adcH, tempFine) {
    let var1

    var1 = tempFine - 76800
    var1 =
      (((adcH << 14) - (this.digH4 << 20) - this.digH5 * var1 + 16384) >> 15) *
      (((((((var1 * this.digH6) >> 10) * (((var1 * this.digH3) >> 11) + 32768)) >> 10) + 2097152) * this.digH2 +
        8192) >>
        14)
    var1 = var1 - (((((var1 >> 15) * (var1 >> 15)) >> 7) * this.digH1) >> 4)
    if (var1 < 0) {
      var1 = 0
    } else if (var1 > 419430400) {
      var1 = 419430400
    }

    var1 = var1 >> 12

    return ((var1 >> 10) * 100 + (((var1 % 1024) * 100) >> 10)) / 100
  }
}

import { WebUSB } from 'usb';

const webusb = new WebUSB({
  allowAllDevices: true
});

const vendorId = 0x0403;
const productId = 0x6014;

export class FtdiBridgeError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, FtdiBridgeError);
  }
}

const MpsseCommands = Object.freeze({
  DATA_OUT_BYTES_POS_EDGE: 0x10,
  DATA_OUT_BYTES_NEG_EDGE: 0x11,
  DATA_OUT_BITS_NEG_EDGE: 0x13,
  DATA_OUT_CLK_NEG: 0x01,
  DATA_IN_BYTES_POS_EDGE: 0x20,
  DATA_IN_BITS_POS_EDGE: 0x22,
  SET_DATA_BITS_LOW: 0x80,
  READ_DATA_BITS_LOW: 0x81,
  SET_DATA_BITS_HIGH: 0x82,
  DISABLE_LOOP_BACK: 0x85,
  SET_TCK_SK_DIV: 0x86,
  SEND_IMMEDIATE: 0x87,
  DISABLE_CLK_DIV5: 0x8A,
  ENABLE_CLK_DIV5: 0x8B,
  ENABLE_3_PHASE_DATA_CLOCKING: 0x8C,
  SET_TCK_DIV: 0x86,
  TURN_OFF_ADAPTIVE_CLOCKING: 0x97,
  DRIVE_ZERO_FOR_I2C: 0x9E,
  INVALID_COMMAND: 0xAA,
});

export class FtdiBridge {
  constructor() {
    // interface A
    this.interface = 0;
    this.index = 1;
    this.outputEndpointNumber = 0x02;
    this.inputEndpointNumber = 0x81;
  }

  async open() {
    try {
      this.device = await webusb.requestDevice({filters: [{vendorId, productId}]});
    } catch (e) {
      throw new FtdiBridgeError(e.message);
    }

    await this.device.open();

    const bcdDevice = this.device.device.deviceDescriptor.bcdDevice;
    if (bcdDevice !== 0x900) {
      throw new FtdiBridgeError(`Unknown device: ${bcdDevice}`)
    }

    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }

    await this.device.claimInterface(0);

    this.packetSize = this.device.configurations[0].interfaces[0].alternates[0].endpoints[0].packetSize;
  }

  async close() {
    if (this.device) {
      await this.device.close();
    }
  }

  async reset() {
    const result = await this.device.controlTransferOut({
      requestType: 'vendor',
      recipient: 'device',
      request: 0, // reset port
      value: 0,
      index: this.index,
    });

    if (result.status !== 'ok') {
      throw new FtdiBridgeError(`Reset failed with status: ${result.status}`);
    }
  }

  async getLatencyTimer() {
    const result = await this.device.controlTransferIn({
      requestType: 'vendor',
      recipient: 'device',
      request: 0x0A, // get latency timer
      value: 0,
      index: this.index,
    }, 1);

    if (result.status !== 'ok') {
      throw new FtdiBridgeError(`Cannot get latency: ${result.status}`);
    }

    return result.data.getUint8(0);
  }

  async setLatencyTimer(value) {
    const result = await this.device.controlTransferOut({
      requestType: 'vendor',
      recipient: 'device',
      request: 0x09, // set latency timer
      value,
      index: this.index,
    });

    if (result.status !== 'ok') {
      throw new FtdiBridgeError(`Cannot set latency: ${result.status}`);
    }
  }

  async setBitMode(mask, mode) {
    const value = mask | (mode << 8);

    const result = await this.device.controlTransferOut({
      requestType: 'vendor',
      recipient: 'device',
      request: 0x0B, // set bitmode
      value,
      index: this.index,
    });

    if (result.status !== 'ok') {
      throw new FtdiBridgeError(`Cannot set latency: ${result.status}`);
    }
  }

  async enterMpsseMode() {
    await this.setBitMode(0x00, 0x02);
  }

  async rawRead(length) {
    const buffer = new ArrayBuffer(length);
    const uint8buffer = new Uint8Array(buffer);

    let position = 0;
    while (position < length) {
      const blockLength = Math.min(this.packetSize, length - position + 2);
      const result = await this.device.transferIn(this.inputEndpointNumber, blockLength);
      if (result.status !== 'ok') {
        throw new FtdiBridgeError(`Error reading from device: ${result.status}`);
      }

      if (result.data.byteLength > 2) {
        const blockView = new Uint8Array(result.data.buffer, result.data.byteOffset + 2, result.data.byteLength - 2);
        uint8buffer.set(blockView, position);
        position += blockView.byteLength;
      }
    }

    return buffer;
  }

  async rawWrite(buffer, offset= 0, length = undefined) {
    if (length === undefined)
      length = buffer.byteLength;

    let position = 0;
    while (position < length) {
      const blockLength = Math.min(this.packetSize, length - position);
      const blockView = new Uint8Array(buffer, offset + position, blockLength);
      const result = await this.device.transferOut(this.outputEndpointNumber, blockView);
      if (result.status !== 'ok') {
        throw new FtdiBridgeError(`Error writing to device: ${result.status}`);
      }

      position += blockLength;
    }
  }

  async mpsseSelfCheck() {
    await this.rawWrite(new Uint8Array([MpsseCommands.INVALID_COMMAND]).buffer);
    const response = await this.rawRead(2);
    const responseBytes = new Uint8Array(response)
    if (responseBytes[0] !== 0xFA) {
      throw new FtdiBridgeError(`Expected error code in self-check response. Got: ${responseBytes[0]}`);
    }

    if (responseBytes[1] !== MpsseCommands.INVALID_COMMAND) {
      throw new FtdiBridgeError(`Expected command code in self-check response. Got: ${responseBytes[1]}`);
    }
  }

  async mpsseEnterI2cMode() {
    await this.rawWrite(new Uint8Array([
      MpsseCommands.DISABLE_CLK_DIV5,
      MpsseCommands.TURN_OFF_ADAPTIVE_CLOCKING,
      MpsseCommands.ENABLE_3_PHASE_DATA_CLOCKING,
      MpsseCommands.DRIVE_ZERO_FOR_I2C, 0x07, 0x00, // on AD0, 1 and 2
      MpsseCommands.DISABLE_LOOP_BACK,
      MpsseCommands.SET_TCK_SK_DIV, 0xC8, 0x00, // 0xC8 divider
    ]).buffer);

    await this.i2cSetLinesIdle();
  }

  async mpsseSetAC(bits = []) {
    let outHighs = 0;
    let outFlags = 0;

    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== undefined) {
        outFlags |= 1 << i;
        outHighs |= (!!bits[i]) << i
      }
    }

    outHighs &= 0xFF;
    outFlags &= 0xFF;

    await this.rawWrite(new Uint8Array([
      MpsseCommands.SET_DATA_BITS_HIGH, outHighs, outFlags
    ]).buffer);
  }

  async i2cSetLinesIdle() {
    await this.rawWrite(new Uint8Array([
      MpsseCommands.SET_DATA_BITS_LOW, 0xFF, 0xFB, // set all lines to high, all output except input pin 2
    ]).buffer);
  }

  async i2cStart() {
    const bytes = new Uint8Array(4 * 3 * 2);
    let position = 0;

    for (let i = 0; i < 4; i++) {  // repeat command to ensure timing
      bytes[position++] = MpsseCommands.SET_DATA_BITS_LOW;
      bytes[position++] = 0xFD; // Data bit 1 -> LOW
      bytes[position++] = 0xFB; // all output except input pin 2
    }

    for  (let i = 0; i < 4; i++) {
      bytes[position++] = MpsseCommands.SET_DATA_BITS_LOW;
      bytes[position++] = 0xFC;  // CLK bit 0 and bit 1 -> LOW
      bytes[position++] = 0xFB; // all output except input pin 2
    }

    if (position !== bytes.byteLength)
      throw new FtdiBridgeError('L0g1C');

    await this.rawWrite(bytes.buffer);
  }

  async i2cStop() {
    const bytes = new Uint8Array(4 * 3 * 2);
    let position = 0;

    for (let i = 0; i < 4; i++) {  // repeat command to ensure timing
      bytes[position++] = MpsseCommands.SET_DATA_BITS_LOW;
      bytes[position++] = 0xFC; // CLK bit 0, DATA bit 1 -> LOW
      bytes[position++] = 0xFB; // all output except input pin 2
    }

    for  (let i = 0; i < 4; i++) {
      bytes[position++] = MpsseCommands.SET_DATA_BITS_LOW;
      bytes[position++] = 0xFD;  // CLK bit 0 -> LOW, DATA bit 1 -> HIGH
      bytes[position++] = 0xFB; // all output except input pin 2
    }

    if (position !== bytes.byteLength)
      throw new FtdiBridgeError('L0g1C');

    await this.rawWrite(bytes.buffer);
  }

  async i2cReceiveBytes(length) {
    const bytes = new Uint8Array(9 * length + 1);
    let position = 0;

    for (let i = 0; i < length; i++) {
      const isLast = i + 1 === length;

      bytes[position++] = MpsseCommands.DATA_IN_BYTES_POS_EDGE;
      bytes[position++] = 0x00; // in ONE byte (zero-based number)
      bytes[position++] = 0x00;

      bytes[position++] = MpsseCommands.DATA_OUT_BITS_NEG_EDGE;
      bytes[position++] = 0x00; // LENGTH -> 1 (0x00)
      bytes[position++] = isLast ? 0xFF : 0x00; // VALUE -> NAK (1) for last or ACK (0)

      bytes[position++] = MpsseCommands.SET_DATA_BITS_LOW;
      bytes[position++] = 0xFE; // IDLE
      bytes[position++] = 0xFB;
    }

    bytes[position++] = MpsseCommands.SEND_IMMEDIATE;

    if (position !== bytes.byteLength)
      throw new FtdiBridgeError('L0g1C');

    await this.rawWrite(bytes.buffer);

    return await this.rawRead(length);
  }

  async i2cSendByte(value) {
    await this.rawWrite(new Uint8Array([
      MpsseCommands.DATA_OUT_BYTES_NEG_EDGE, 0x00, 0x00, value, // out ONE byte
      MpsseCommands.SET_DATA_BITS_LOW, 0xFE, 0xFB, // CLK -> LOW, DATA -> HIGH
      MpsseCommands.DATA_IN_BITS_POS_EDGE, 0x00, // in ONE bit
      MpsseCommands.SEND_IMMEDIATE,
    ]).buffer);

    const responseBuffer = await this.rawRead(1);
    const responseBytes = new Uint8Array(responseBuffer);
    return (responseBytes[0] & 1) === 0;  // 0: ACK
  }

  async i2cTransferPacket(address, outputData, inputLength) {
    let started = false;

    try {
      if (outputData) {
        await this.i2cSetLinesIdle();
        await this.i2cStart();
        started = true;

        const addressAck = await this.i2cSendByte(address << 1 | 0);
        if (!addressAck)
          throw new FtdiBridgeError(`Address ${address} did not acknowledge send packet start`);

        const bytes = new Uint8Array(outputData);
        for (let i = 0; i < bytes.length; i++) {
          const dataAck = await this.i2cSendByte(bytes[i]);
          if (!dataAck)
            throw new FtdiBridgeError(`Address ${address} did not acknowledge reception of byte ${i}`);
        }
      }

      if (inputLength) {
        await this.i2cSetLinesIdle();
        await this.i2cStart();
        started = true;

        const addressAck = await this.i2cSendByte(address << 1 | 1);
        if (!addressAck)
          throw new FtdiBridgeError(`Address ${address} did not acknowledge receive packet start`);

        return this.i2cReceiveBytes(inputLength);
      }
    } finally {
      try {
        if (started) {
          await this.i2cStop();
        }
      } catch { }
    }
  }
}

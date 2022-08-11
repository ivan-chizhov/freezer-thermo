import { app, BrowserWindow } from 'electron';
import { FtdiBridge } from './ftdi';
import { Bme280 } from './bme280';

const delay = timeout => new Promise(resolve => setTimeout(resolve, timeout));

const BME280_ADDR = 0x76;

let appWindow = null;

let bridge = null;
let sensor = null;
let updateTimeout;

let readings = null;

const publishReadings = () => {
  if (appWindow && readings) {
    appWindow.webContents.send('sensor', readings);
  }
}

const updateReadings = async () => {
  let updated = false;

  try {
    const [temperature, pressure, humidity] = await sensor.readTempPressHum();
    if (temperature !== undefined && pressure !== undefined && humidity !== undefined) {
      readings = {
        temperature, pressure, humidity
      }
    }

    updated = true;
  } catch (e) {
    console.error('Error reading sensor:', e);
  }

  if (updated) {
    publishReadings();
  }
}

const updateIteration = async () => {
  updateTimeout = undefined;

  try {
    await updateReadings();
  } catch (e) {
    console.error('Error in sensor loop:', e);
  }

  scheduleUpdates();
}

const scheduleUpdates = () => {
  updateTimeout = setTimeout(updateIteration, 100);
}

const unscheduledUpdates = () => {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = undefined;
  }
}

const openDevice = async () => {
  bridge = new FtdiBridge();
  try {
    await bridge.open();
    await bridge.reset();

    const latency = await bridge.getLatencyTimer();
    if (latency !== 16) await bridge.setLatencyTimer(16);

    await bridge.enterMpsseMode();
    await bridge.mpsseSelfCheck();

    await bridge.mpsseSetAC([undefined, undefined, undefined]);

    await bridge.mpsseEnterI2cMode();

    sensor = new Bme280(bridge, BME280_ADDR);
    await sensor.init();

    console.log('Sensor hash:', sensor.calibrationHash());

    // device won't return values for a bit after init
    scheduleUpdates();
  } catch (e) {
    console.error(e.message);
  }
}

const createAppWindow = () => {
  const window = new BrowserWindow({
    width: 640,
    height: 120,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  appWindow = window;

  window.webContents.on('dom-ready', async () => {
    await publishReadings();

    window.show();
  });

  window.on('close', () => {
    appWindow = null;
  })

  // and load the index.html of the app.
  const _ = window.loadFile('index.html');

  // Open the DevTools.
  // win.webContents.openDevTools()
};

const _ = openDevice();

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await publishReadings();

  createAppWindow();
});

app.on('activate', () => {
  if (appWindow === null)
    createAppWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('quit', async () => {
  unscheduledUpdates();
  await bridge.close();
});

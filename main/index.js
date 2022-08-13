import { app, BrowserWindow } from 'electron'
import { DeviceManager, Publisher } from './devices'

let appWindow = null

let publisher = new Publisher()
let deviceManager = null

const createAppWindow = () => {
  const window = new BrowserWindow({
    width: 640,
    height: 120,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  })

  appWindow = window

  window.webContents.on('dom-ready', () => {
    publisher.connect(window)
    window.show()
  })

  window.on('close', () => {
    publisher.disconnect(window)
    appWindow = null
  })

  const _ = window.loadFile('index.html')
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  createAppWindow()

  deviceManager = new DeviceManager(publisher)
  await deviceManager.start()
})

app.on('activate', () => {
  if (appWindow === null) {
    createAppWindow()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', async (event) => {
  if (deviceManager) {
    event.preventDefault()
    await deviceManager.stop(() => {
      deviceManager = null
      app.quit()
    })
  }
})

app.on('quit', async () => {
  // for Windows restart
  if (deviceManager) {
    await deviceManager.stop()
    deviceManager = null
  }
})

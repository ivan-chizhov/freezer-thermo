import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { ipcRenderer } from 'electron'

import App from './App'
import useSensorStore from './sensorStore'

const container = document.getElementById('app')
const root = createRoot(container)
root.render(<App />)

ipcRenderer.on('sensor', (_event, readings) => {
  useSensorStore.setState(readings)
})

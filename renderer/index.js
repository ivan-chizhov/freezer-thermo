import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { ipcRenderer } from 'electron'

import App from './App'
import useSensorStore from './sensorStore'
import useSwitchStore from './switchStore'

const container = document.getElementById('app')
const root = createRoot(container)
root.render(<App />)

ipcRenderer.on('inside', (_event, data) => useSensorStore.setState({ inside: data }))
ipcRenderer.on('outside', (_event, data) => useSensorStore.setState({ outside: data }))
ipcRenderer.on('switch', (_event, data) => useSwitchStore.setState(data))

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ipcRenderer } from 'electron';

import App from './App';
import useSensorStore from './sensorStore';

// const App = () => {
//   const temperature = useSensorStore(s => s.temperature);
//   const temperatureText = temperature !== undefined ? temperature.toFixed(2) : 'unknown';
//   return (<div>Temperature: {temperatureText}</div>);
// }

const container = document.getElementById('app');
const root = createRoot(container);
root.render(<App />);

ipcRenderer.on('sensor', (_event, readings) => {
  useSensorStore.setState(readings);
});
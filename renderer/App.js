import React from 'react'
import { Global, css } from '@emotion/react'
import styled from '@emotion/styled'
import useSensorStore from './sensorStore'
import useSwitchStore from './switchStore'

const InstrumentContainer = styled.div`
  padding: 4px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
`

const InstrumentHeading = styled.div`
  margin: 4px;
  flex-grow: 1;
  color: #aaa;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 2px;
`

const InstrumentValueContainer = styled.div`
  margin: 4px;
  flex-grow: 2;
  display: flex;
  align-items: baseline;
`

const InstrumentValueUnknown = styled.div`
  color: #777;
  font-size: 32px;
`

const InstrumentValueInteger = styled.div`
  font-size: 32px;
  color: #ddd;
`

const InstrumentValueDecimal = styled.div`
  font-size: 24px;
  color: #ccc;
`

const InstrumentSwitchOn = styled.div`
  color: #ddd;
  font-size: 32px;
`

const InstrumentSwitchOff = styled.div`
  color: #aaa;
  font-size: 32px;
`

const InstrumentValuePresent = ({ value }) => {
  let [integerPart, decimalPart] = String(value.toFixed(2)).split('.')
  return (
    <InstrumentValueContainer>
      <InstrumentValueInteger>{integerPart}</InstrumentValueInteger>
      <InstrumentValueDecimal>.{decimalPart}</InstrumentValueDecimal>
    </InstrumentValueContainer>
  )
}

const InstrumentValueSelector = ({ value }) =>
  value !== undefined ? (
    <InstrumentValuePresent value={value} />
  ) : (
    <InstrumentValueContainer>
      <InstrumentValueUnknown>-</InstrumentValueUnknown>
    </InstrumentValueContainer>
  )

const TemperatureInstrument = ({ sensorName }) => {
  const temperature = useSensorStore((s) => s[sensorName].temperature)
  return (
    <InstrumentContainer>
      <InstrumentHeading>Temperature (&deg;C)</InstrumentHeading>
      <InstrumentValueSelector value={temperature} />
    </InstrumentContainer>
  )
}

const PressureInstrument = ({ sensorName }) => {
  const pressure = useSensorStore((s) => s[sensorName].pressure)
  return (
    <InstrumentContainer>
      <InstrumentHeading>Pressure (hPa)</InstrumentHeading>
      <InstrumentValueSelector value={pressure} />
    </InstrumentContainer>
  )
}

const HumidityInstrument = ({ sensorName }) => {
  const humidity = useSensorStore((s) => s[sensorName].humidity)
  return (
    <InstrumentContainer>
      <InstrumentHeading>Humidity (%RH)</InstrumentHeading>
      <InstrumentValueSelector value={humidity} />
    </InstrumentContainer>
  )
}

const SwitchValueSelector = ({ value }) => {
  switch (value) {
    case undefined:
      return <InstrumentValueUnknown>-</InstrumentValueUnknown>

    case true:
      return <InstrumentSwitchOn>ON</InstrumentSwitchOn>

    case false:
      return <InstrumentSwitchOff>OFF</InstrumentSwitchOff>
  }
}

const SwitchInstrument = ({ name, path }) => {
  const value = useSwitchStore((s) => s[path])
  return (
    <InstrumentContainer>
      <InstrumentHeading>{name}</InstrumentHeading>
      <InstrumentValueContainer>
        <SwitchValueSelector value={value} />
      </InstrumentValueContainer>
    </InstrumentContainer>
  )
}

const DashboardPanel = styled.div`
  display: flex;
  height: 100%;
  flex-grow: 1;
  background: #222;
  margin: 3px;
  border-radius: 8px;
`

const DashboardPanelHeadingText = styled.div`
  width: 40px;
  color: #aaa;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 2px;
  transform: translate(50%, 50%) rotate(90deg);
  transform-origin: left;
`

const DashboardPanelHeadingContainer = styled.div`
  display: flex;
  flex-direction: column;
`

const DashboardPanelHeading = ({ children }) => (
  <DashboardPanelHeadingContainer>
    <DashboardPanelHeadingText>{children}</DashboardPanelHeadingText>
  </DashboardPanelHeadingContainer>
)

const DashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  margin: 3px;
`

export default function App() {
  return (
    <>
      <Global
        styles={css`
          html,
          body,
          #app {
            margin: 0;
            padding: 0;
            min-height: 100vh;
            max-width: 100vw;
            background: #333;
            color: white;
            font-family: Helvetica, Arial, sans-serif;
          }

          #app {
            display: flex;
          }
        `}
      />
      <DashboardContainer>
        <DashboardPanel>
          <DashboardPanelHeading>Inside</DashboardPanelHeading>
          <TemperatureInstrument sensorName="inside" />
          <PressureInstrument sensorName="inside" />
          <HumidityInstrument sensorName="inside" />
        </DashboardPanel>
        <DashboardPanel>
          <DashboardPanelHeading>Outside</DashboardPanelHeading>
          <TemperatureInstrument sensorName="outside" />
          <PressureInstrument sensorName="outside" />
          <HumidityInstrument sensorName="outside" />
        </DashboardPanel>
        <DashboardPanel>
          <DashboardPanelHeading>Switches</DashboardPanelHeading>
          <SwitchInstrument name="Freezer" path="freezer" />
          <SwitchInstrument name="Machine" path="machine" />
        </DashboardPanel>
      </DashboardContainer>
    </>
  )
}

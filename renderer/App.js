import React from 'react';
import { Global, css } from '@emotion/react';
import styled from '@emotion/styled';
import useSensorStore from './sensorStore';

const InstrumentContainer = styled.div`
  padding: 4px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const InstrumentHeading = styled.div`
  margin: 4px;
  flex-grow: 1;
  color: #AAA;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 2px;
`;

const InstrumentValueContainer = styled.div`
  margin: 4px;
  flex-grow: 2;
  display: flex;
  align-items: baseline;
`;

const InstrumentValueInteger = styled.div`
  font-size: 32px;
  color: #DDD;
`;

const InstrumentValueDecimal = styled.div`
  font-size: 24px;
  color: #CCC;
`;

const InstrumentValuePresent = ({value}) => {
  let [integerPart, decimalPart] = String(value.toFixed(2)).split('.');
  return (
    <InstrumentValueContainer>
      <InstrumentValueInteger>{integerPart}</InstrumentValueInteger>
      <InstrumentValueDecimal>.{decimalPart}</InstrumentValueDecimal>
    </InstrumentValueContainer>
  );
}

const InstrumentValueUnknown = () => (<InstrumentValueContainer>-</InstrumentValueContainer>);

const InstrumentValueSelector = ({value}) =>
  value !== undefined ?
    (<InstrumentValuePresent value={value} />) :
    (<InstrumentValueUnknown />);

const TemperatureInstrument = () => {
  const temperature = useSensorStore(s => s.temperature);
  return (
    <InstrumentContainer>
      <InstrumentHeading>Temperature (&deg;C)</InstrumentHeading>
      <InstrumentValueSelector value={temperature} />
    </InstrumentContainer>
  );
}

const PressureInstrument = () => {
  const pressure = useSensorStore(s => s.pressure);
  return (
    <InstrumentContainer>
      <InstrumentHeading>Pressure (hPa)</InstrumentHeading>
      <InstrumentValueSelector value={pressure} />
    </InstrumentContainer>
  );
}

const HumidityInstrument = () => {
  const humidity = useSensorStore(s => s.humidity);
  return (
    <InstrumentContainer>
      <InstrumentHeading>Humidity (%RH)</InstrumentHeading>
      <InstrumentValueSelector value={humidity} />
    </InstrumentContainer>
  );
}

const DashboardContainer = styled.div`
  min-height: 100vh;
  display: flex;
`;

export default function App() {
  return (<>
    <Global styles={css`
      html, body, #app {
        margin: 0;
        padding: 0;
        min-height: 100vh;
        max-width: 100vw;
        background: #222;
        color: white;
        font-family: Helvetica, Arial, sans-serif;
      }
    `} />
    <DashboardContainer>
      <TemperatureInstrument />
      <PressureInstrument />
      <HumidityInstrument />
    </DashboardContainer>
  </>);
}
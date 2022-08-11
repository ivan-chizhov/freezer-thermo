import create from 'zustand'

const useSensorStore = create((set) => ({
  temperature: undefined,
  pressure: undefined,
  humidity: undefined,
}))

export default useSensorStore

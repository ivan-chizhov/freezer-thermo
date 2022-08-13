import create from 'zustand'

const useSensorStore = create((set) => ({
  inside: {},
  outside: {},
}))

export default useSensorStore

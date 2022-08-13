import create from 'zustand'

const useSwitchStore = create((set) => ({
  freezer: undefined,
  machine: undefined,
}))

export default useSwitchStore

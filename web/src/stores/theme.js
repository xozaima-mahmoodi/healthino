import { defineStore } from 'pinia'

const STORAGE_KEY = 'healthino_theme'

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    current: localStorage.getItem(STORAGE_KEY) || 'light'
  }),
  actions: {
    set(theme) {
      this.current = theme
      localStorage.setItem(STORAGE_KEY, theme)
      applyTheme(theme)
    },
    toggle() {
      this.set(this.current === 'dark' ? 'light' : 'dark')
    },
    init() {
      applyTheme(this.current)
    }
  }
})

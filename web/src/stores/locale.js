import { defineStore } from 'pinia'
import { applyLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n'

export const useLocaleStore = defineStore('locale', {
  state: () => ({
    current: localStorage.getItem('healthino_locale') || DEFAULT_LOCALE
  }),
  actions: {
    set(locale) {
      if (!SUPPORTED_LOCALES.includes(locale)) return
      this.current = locale
      applyLocale(locale)
    }
  }
})

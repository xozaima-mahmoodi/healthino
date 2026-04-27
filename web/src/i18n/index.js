import { createI18n } from 'vue-i18n'
import fa from '../locales/fa.json'
import ckb from '../locales/ckb.json'

export const SUPPORTED_LOCALES = ['fa', 'ckb']
export const DEFAULT_LOCALE = 'fa'

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('healthino_locale') || DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fa, ckb }
})

export function applyLocale(locale) {
  i18n.global.locale.value = locale
  localStorage.setItem('healthino_locale', locale)
  document.documentElement.lang = locale
  document.documentElement.dir = 'rtl'
}

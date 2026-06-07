import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import { i18n, applyLocale } from './i18n'
import './style.css'
import App from './App.vue'

// Apply the persisted locale (sets <html> lang + dir + font) before mount.
applyLocale(i18n.global.locale.value)

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .mount('#app')

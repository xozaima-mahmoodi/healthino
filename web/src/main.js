import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import { i18n } from './i18n'
import './style.css'
import App from './App.vue'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .mount('#app')

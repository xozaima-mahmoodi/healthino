import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import faMessages from '../src/locales/fa.json'
import ckbMessages from '../src/locales/ckb.json'
import { createAppRouter } from '../src/router'

export async function makeRouter(initialPath = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div>Home</div>' } },
      { path: '/symptoms', name: 'symptoms', component: { template: '<div>Symptoms</div>' } }
    ]
  })
  await router.push(initialPath)
  await router.isReady()
  return router
}

export async function makeGuardedRouter(initialPath = '/') {
  const router = createAppRouter(createMemoryHistory())
  await router.push(initialPath)
  await router.isReady()
  return router
}

export function makeI18n(locale = 'fa') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'fa',
    messages: { fa: faMessages, ckb: ckbMessages }
  })
}

export function makePinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

export async function makeTestPlugins({ path = '/', locale = 'fa' } = {}) {
  const router = await makeRouter(path)
  const i18n = makeI18n(locale)
  const pinia = makePinia()
  return { plugins: [router, i18n, pinia], router, i18n, pinia }
}

export async function makeGuardedTestPlugins({ path = '/', locale = 'fa' } = {}) {
  const pinia = makePinia()
  const router = await makeGuardedRouter(path)
  const i18n = makeI18n(locale)
  return { plugins: [router, i18n, pinia], router, i18n, pinia }
}

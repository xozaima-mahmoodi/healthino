import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {}))
  }
}))

import {
  useIdleLogout,
  IDLE_TIMEOUT_MS,
  WARNING_TIMEOUT_MS
} from '../src/composables/useIdleLogout'
import { useAuthStore } from '../src/stores/auth'
import { useToastStore } from '../src/stores/toast'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

let lastApi

const Host = defineComponent({
  props: { idleMs: Number, warningMs: Number },
  setup(props) {
    lastApi = useIdleLogout({ idleMs: props.idleMs, warningMs: props.warningMs })
    return () => h('div', 'host')
  }
})

async function setup({ authed = true, idleMs = 5000, warningMs = 2000 } = {}) {
  const { plugins, router } = await makeTestPlugins({ path: '/' })
  const auth = useAuthStore()
  if (authed) {
    auth.setSession({
      token: 'tok-idle',
      user: { id: 1, name: 'Test', display_name: 'Test', email: 't@x.io', is_doctor: false }
    })
  }
  const wrapper = mount(Host, { global: { plugins }, props: { idleMs, warningMs } })
  await nextTick()
  return { wrapper, router, auth }
}

describe('useIdleLogout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('enforces the 15-minute inactivity + 60s warning production policy by default', () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000)
    expect(WARNING_TIMEOUT_MS).toBe(60 * 1000)
  })

  it('opens the warning modal after inactivity, then force-logs-out after the countdown', async () => {
    const { router, auth } = await setup({ idleMs: 5000, warningMs: 2000 })
    const toast = useToastStore()
    const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => {})

    expect(lastApi.showWarning.value).toBe(false)

    vi.advanceTimersByTime(5000) // inactivity window elapses
    expect(lastApi.showWarning.value).toBe(true)
    expect(lastApi.secondsRemaining.value).toBe(2)
    expect(auth.isAuthenticated).toBe(true) // not logged out yet — still warning

    vi.advanceTimersByTime(2000) // warning countdown elapses
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(pushSpy).toHaveBeenCalledWith('/login')
    expect(toast.items.at(-1).message).toBe(faMessages.toast.idle_logout)
  })

  it('counts the displayed seconds down every second', async () => {
    await setup({ idleMs: 5000, warningMs: 3000 })
    vi.advanceTimersByTime(5000)
    expect(lastApi.secondsRemaining.value).toBe(3)
    vi.advanceTimersByTime(1000)
    expect(lastApi.secondsRemaining.value).toBe(2)
    vi.advanceTimersByTime(1000)
    expect(lastApi.secondsRemaining.value).toBe(1)
  })

  it('resets the inactivity timer on user interaction before the warning shows', async () => {
    await setup({ idleMs: 5000, warningMs: 2000 })

    vi.advanceTimersByTime(4000)
    window.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(4000)
    expect(lastApi.showWarning.value).toBe(false)

    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(4999)
    expect(lastApi.showWarning.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(lastApi.showWarning.value).toBe(true)
  })

  it('ignores background activity while the warning is open (countdown is not reset)', async () => {
    const { auth } = await setup({ idleMs: 5000, warningMs: 2000 })

    vi.advanceTimersByTime(5000)
    expect(lastApi.showWarning.value).toBe(true)

    // user barely nudges the mouse / scrolls while reading the warning
    window.dispatchEvent(new Event('mousemove'))
    window.dispatchEvent(new Event('scroll'))

    vi.advanceTimersByTime(2000) // countdown still expires
    expect(auth.isAuthenticated).toBe(false)
  })

  it('"Stay Logged In" closes the modal and restarts the inactivity window', async () => {
    const { auth } = await setup({ idleMs: 5000, warningMs: 2000 })

    vi.advanceTimersByTime(5000)
    expect(lastApi.showWarning.value).toBe(true)

    lastApi.stayLoggedIn()
    expect(lastApi.showWarning.value).toBe(false)
    expect(auth.isAuthenticated).toBe(true)

    // a fresh inactivity window begins
    vi.advanceTimersByTime(4999)
    expect(lastApi.showWarning.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(lastApi.showWarning.value).toBe(true)
  })

  it('"Logout Now" logs out immediately', async () => {
    const { router, auth } = await setup({ idleMs: 5000, warningMs: 2000 })
    const toast = useToastStore()
    const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => {})

    vi.advanceTimersByTime(5000)
    expect(lastApi.showWarning.value).toBe(true)

    lastApi.logoutNow()
    expect(auth.isAuthenticated).toBe(false)
    expect(lastApi.showWarning.value).toBe(false)
    expect(pushSpy).toHaveBeenCalledWith('/login')
    expect(toast.items.at(-1).message).toBe(faMessages.toast.logout_success)
  })

  it('does NOT arm anything for unauthenticated visitors', async () => {
    const { auth } = await setup({ authed: false, idleMs: 5000, warningMs: 2000 })

    vi.advanceTimersByTime(60_000)
    expect(lastApi.showWarning.value).toBe(false)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('arms the timer the moment a user signs in', async () => {
    const { auth } = await setup({ authed: false, idleMs: 5000, warningMs: 2000 })

    auth.setSession({
      token: 'tok-late',
      user: { id: 2, name: 'A', display_name: 'A', email: 'a@b.io', is_doctor: false }
    })
    await nextTick()

    vi.advanceTimersByTime(5000)
    expect(lastApi.showWarning.value).toBe(true)
  })
})

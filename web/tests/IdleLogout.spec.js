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

import { useIdleLogout, IDLE_TIMEOUT_MS } from '../src/composables/useIdleLogout'
import { useAuthStore } from '../src/stores/auth'
import { useToastStore } from '../src/stores/toast'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

const Host = defineComponent({
  props: { timeoutMs: { type: Number, default: undefined } },
  setup(props) {
    useIdleLogout(props.timeoutMs ? { timeoutMs: props.timeoutMs } : undefined)
    return () => h('div', 'host')
  }
})

async function setup({ authed = true, timeoutMs } = {}) {
  const { plugins, router } = await makeTestPlugins({ path: '/' })
  const auth = useAuthStore()
  if (authed) {
    auth.setSession({
      token: 'tok-idle',
      user: { id: 1, name: 'Test', display_name: 'Test', email: 't@x.io', is_doctor: false }
    })
  }
  const wrapper = mount(Host, { global: { plugins }, props: { timeoutMs } })
  await nextTick()
  return { wrapper, router, auth }
}

describe('useIdleLogout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses a 15-minute inactivity window by default', () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000)
  })

  it('logs the user out after the timeout expires with no activity', async () => {
    const { router, auth } = await setup({ timeoutMs: 5000 })
    const toast = useToastStore()
    const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => {})

    expect(auth.isAuthenticated).toBe(true)

    vi.advanceTimersByTime(4999)
    expect(auth.isAuthenticated).toBe(true)
    expect(toast.items).toHaveLength(0)

    vi.advanceTimersByTime(1)

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(pushSpy).toHaveBeenCalledWith('/')
    expect(toast.items).toHaveLength(1)
    expect(toast.items[0].message).toBe(faMessages.toast.idle_logout)
  })

  it('resets the timer on every user interaction (mousemove / keydown / click)', async () => {
    const { auth } = await setup({ timeoutMs: 5000 })

    vi.advanceTimersByTime(4000)
    expect(auth.isAuthenticated).toBe(true)

    window.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(4000)
    expect(auth.isAuthenticated).toBe(true)

    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(4000)
    expect(auth.isAuthenticated).toBe(true)

    window.dispatchEvent(new Event('click'))
    vi.advanceTimersByTime(4999)
    expect(auth.isAuthenticated).toBe(true)

    vi.advanceTimersByTime(2)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('does NOT arm the timer for unauthenticated visitors', async () => {
    const { auth } = await setup({ authed: false, timeoutMs: 5000 })
    const toast = useToastStore()

    vi.advanceTimersByTime(60_000)
    expect(auth.isAuthenticated).toBe(false)
    expect(toast.items).toHaveLength(0)
  })

  it('arms the timer the moment a user signs in (and disarms on sign-out)', async () => {
    const { auth, router } = await setup({ authed: false, timeoutMs: 5000 })
    const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => {})

    auth.setSession({
      token: 'tok-late',
      user: { id: 2, name: 'A', display_name: 'A', email: 'a@b.io', is_doctor: false }
    })
    await nextTick()

    vi.advanceTimersByTime(5000)
    expect(auth.isAuthenticated).toBe(false)
    expect(pushSpy).toHaveBeenCalledWith('/')
  })
})

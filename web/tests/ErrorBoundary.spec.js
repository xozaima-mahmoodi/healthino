import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useGlobalErrorBoundary } from '../src/composables/useGlobalErrorBoundary'
import { useToastStore } from '../src/stores/toast'
import { useAuthStore } from '../src/stores/auth'
import { useHealthStore } from '../src/stores/health'
import { api } from '../src/api/client'
import { makeGuardedTestPlugins, makeTestPlugins } from './helpers.js'

let originalAdapter
let warnSpy

beforeEach(() => {
  originalAdapter = api.defaults.adapter
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  warnSpy.mockRestore()
  document.body.innerHTML = ''
})

function withAdapter(adapter) {
  api.defaults.adapter = adapter
}

function fail500(config) {
  const err = new Error('Request failed with status code 500')
  err.response = { status: 500, data: { error: 'internal_error' }, headers: {}, config }
  err.config = config
  err.code = 'ERR_BAD_RESPONSE'
  return err
}

const Boundary = defineComponent({
  setup() {
    useGlobalErrorBoundary({ message: 'something went wrong' })
    return () => h('div', { 'data-testid': 'app-shell' }, [h('slot')])
  }
})

describe('useGlobalErrorBoundary', () => {
  it('catches errors thrown by child components and surfaces a single throttled toast', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const toast = useToastStore()

    const Bomb = defineComponent({
      setup() {
        throw new Error('child blew up')
      },
      render() { return h('div') }
    })

    const Host = defineComponent({
      setup() {
        useGlobalErrorBoundary({ message: 'something went wrong' })
        return () => h(Bomb)
      }
    })

    expect(() => mount(Host, { global: { plugins } })).not.toThrow()
    await nextTick()

    const errors = toast.items.filter(i => i.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('something went wrong')
  })

  it('catches window-level unhandledrejection and emits at most one toast within the throttle window', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    mount(Boundary, { global: { plugins } })
    await nextTick()

    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event('unhandledrejection'))
    }
    await nextTick()

    expect(toast.items.filter(i => i.type === 'error').length).toBeLessThanOrEqual(1)
  })

  it('ignores ERR_CANCELED rejections (they are intentional, not failures)', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    mount(Boundary, { global: { plugins } })
    await nextTick()

    const event = new Event('unhandledrejection')
    Object.defineProperty(event, 'reason', { value: { code: 'ERR_CANCELED', message: 'canceled' } })
    window.dispatchEvent(event)
    await nextTick()

    expect(toast.items.filter(i => i.type === 'error')).toHaveLength(0)
  })
})

describe('500 errors do not break navigation or freeze the app', () => {
  it('lets the user navigate between routes after a 500 from a store action', async () => {
    const { router, plugins } = await makeGuardedTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({
      token: 'tok-x', user: { id: 1, name: 'A', email: 'a@b.io' }
    })
    mount(Boundary, { global: { plugins } })

    withAdapter(async (config) => { throw fail500(config) })

    const { useHistoryStore } = await import('../src/stores/history')
    const history = useHistoryStore()
    await history.fetch()

    expect(history.error).toBeTruthy()

    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')

    await router.push('/symptoms')
    expect(router.currentRoute.value.path).toBe('/symptoms')
  })

  it('does not stack endless toasts when many 500 calls fail in a row', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    mount(Boundary, { global: { plugins } })

    withAdapter(async (config) => { throw fail500(config) })

    const calls = Array.from({ length: 10 }, () => api.get('/api/v1/assessments').catch(() => null))
    await Promise.all(calls)
    await nextTick()

    expect(toast.items.filter(i => i.type === 'error').length).toBeLessThanOrEqual(2)
  })
})

describe('health store ping probe', () => {
  it('marks the store online when /api/v1/ping succeeds', async () => {
    await makeTestPlugins({ path: '/' })
    const health = useHealthStore()

    withAdapter(async (config) => ({
      status: 200,
      data: { status: 'ok', time: '2026-05-06T00:00:00Z' },
      headers: {},
      config
    }))

    const ok = await health.ping()
    expect(ok).toBe(true)
    expect(health.online).toBe(true)
    expect(health.lastError).toBeNull()
    expect(health.lastCheckedAt).toBeTypeOf('number')
  })

  it('marks the store offline and records the error when ping fails', async () => {
    await makeTestPlugins({ path: '/' })
    const health = useHealthStore()

    withAdapter(async (config) => {
      const err = new Error('Network Error')
      err.config = config
      err.code = 'ERR_NETWORK'
      throw err
    })

    const ok = await health.ping()
    expect(ok).toBe(false)
    expect(health.online).toBe(false)
    expect(health.lastError?.message).toContain('Network Error')
  })
})

describe('auth state recovery from corrupted localStorage', () => {
  it('drops a half-populated session (token without user) on boot', async () => {
    localStorage.setItem('healthino:auth_token', 'looks-real-token-1234')
    // user is missing entirely

    const { useAuthStore: freshAuth } = await import('../src/stores/auth')
    await makeTestPlugins({ path: '/' })
    const auth = freshAuth()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(localStorage.getItem('healthino:auth_token')).toBeNull()
  })

  it('drops a token that does not match the expected shape', async () => {
    localStorage.setItem('healthino:auth_token', '!!! not a real token <script> !!!')
    localStorage.setItem('healthino:auth_user', JSON.stringify({ id: 1, email: 'a@b.io' }))

    const { useAuthStore: freshAuth } = await import('../src/stores/auth')
    await makeTestPlugins({ path: '/' })
    const auth = freshAuth()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
  })

  it('drops a user blob that is not a valid JSON object', async () => {
    localStorage.setItem('healthino:auth_token', 'valid-token-1234')
    localStorage.setItem('healthino:auth_user', '{this-is-not-json')

    const { useAuthStore: freshAuth } = await import('../src/stores/auth')
    await makeTestPlugins({ path: '/' })
    const auth = freshAuth()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { api, cancelPendingRequests, pendingRequestCount } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import { useToastStore } from '../src/stores/toast'
import { makeTestPlugins } from './helpers.js'

let originalAdapter

function withAdapter(adapter) {
  api.defaults.adapter = adapter
}

beforeEach(() => {
  originalAdapter = api.defaults.adapter
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  cancelPendingRequests('test_cleanup')
  document.body.innerHTML = ''
})

describe('api client — auth header', () => {
  it('attaches a Bearer Authorization header when a token is present', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setToken('my-secret-token')

    let seenHeaders = null
    withAdapter(async (config) => {
      seenHeaders = config.headers
      return { status: 200, data: {}, headers: {}, config }
    })

    await api.get('/api/v1/me')

    expect(seenHeaders.Authorization).toBe('Bearer my-secret-token')
  })

  it('omits the Authorization header when there is no token', async () => {
    await makeTestPlugins({ path: '/' })

    let seenHeaders = null
    withAdapter(async (config) => {
      seenHeaders = config.headers
      return { status: 200, data: {}, headers: {}, config }
    })

    await api.get('/api/v1/me')

    expect(seenHeaders.Authorization).toBeUndefined()
  })
})

describe('api client — 401 response interceptor', () => {
  it('clears the auth session exactly once on a 401, even if many 401s arrive in parallel', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({ token: 'expired-tok', user: { id: 1, name: 'A', email: 'a@b.io' } })
    expect(auth.isAuthenticated).toBe(true)

    withAdapter(async (config) => {
      const error = new Error('Request failed with status code 401')
      error.response = { status: 401, data: { error: 'unauthorized' }, headers: {}, config }
      error.config = config
      throw error
    })

    const results = await Promise.allSettled([
      api.get('/api/v1/assessments'),
      api.get('/api/v1/me'),
      api.post('/api/v1/symptom_checker', { symptoms: ['x'] })
    ])

    for (const r of results) expect(r.status).toBe('rejected')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
  })

  it('does not clear an unauthenticated session on 401 (e.g., a failed login attempt)', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)

    withAdapter(async (config) => {
      const error = new Error('Request failed with status code 401')
      error.response = {
        status: 401, data: { errors: { base: ['invalid_credentials'] } }, headers: {}, config
      }
      error.config = config
      throw error
    })

    await expect(api.post('/api/v1/auth/login', { email: 'x', password: 'y' })).rejects.toBeDefined()

    expect(auth.token).toBeNull()
  })
})

describe('api client — cancellation', () => {
  it('tracks in-flight requests and cancels them when cancelPendingRequests() is called', async () => {
    await makeTestPlugins({ path: '/' })

    let adapterStarted
    const adapterStartedP = new Promise(r => { adapterStarted = r })
    let abortReason = null
    withAdapter((config) => new Promise((_, reject) => {
      adapterStarted()
      const onAbort = () => {
        abortReason = config.signal.reason
        const err = new Error('canceled')
        err.config = config
        err.code = 'ERR_CANCELED'
        reject(err)
      }
      if (config.signal.aborted) onAbort()
      else config.signal.addEventListener('abort', onAbort)
    }))

    const inflight = api.get('/api/v1/assessments')
    inflight.catch(() => {})
    await adapterStartedP
    expect(pendingRequestCount()).toBe(1)

    cancelPendingRequests('hard_reset')

    await expect(inflight).rejects.toBeDefined()
    expect(pendingRequestCount()).toBe(0)
    expect(String(abortReason)).toContain('hard_reset')
  })

  it('releases the controller from the pending registry on a normal successful response', async () => {
    await makeTestPlugins({ path: '/' })
    withAdapter(async (config) => ({ status: 200, data: {}, headers: {}, config }))

    await api.get('/api/v1/me')
    expect(pendingRequestCount()).toBe(0)
  })
})

describe('auth.hardReset()', () => {
  it('cancels in-flight requests, clears storage, and resets the auth store', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({ token: 'tok', user: { id: 1, name: 'X', email: 'x@y.io' } })
    expect(localStorage.getItem('healthino:auth_token')).toBe('tok')

    let aborted = false
    let adapterStarted
    const adapterStartedP = new Promise(r => { adapterStarted = r })
    withAdapter((config) => new Promise((_, reject) => {
      adapterStarted()
      const onAbort = () => {
        aborted = true
        const err = new Error('canceled'); err.config = config; err.code = 'ERR_CANCELED'
        reject(err)
      }
      config.signal.addEventListener('abort', onAbort)
    }))
    const inflight = api.get('/api/v1/assessments')
    inflight.catch(() => {})
    await adapterStartedP
    expect(pendingRequestCount()).toBe(1)

    auth.hardReset()
    await expect(inflight).rejects.toBeDefined()

    expect(aborted).toBe(true)
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(localStorage.getItem('healthino:auth_token')).toBeNull()
    expect(localStorage.getItem('healthino:auth_user')).toBeNull()
    expect(pendingRequestCount()).toBe(0)
  })

  it('also drains any toasts so the screen is not stuck with old errors', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    const toast = useToastStore()
    toast.error('one')
    toast.error('two')
    expect(toast.items).toHaveLength(2)

    auth.hardReset()
    expect(toast.items).toHaveLength(0)
  })
})

describe('auth-failure → user-facing error', () => {
  it('surfaces a single, clear error toast for cascading 401s instead of stacking many', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({ token: 'expired', user: { id: 1, name: 'X', email: 'x@y.io' } })
    const toast = useToastStore()

    withAdapter(async (config) => {
      const error = new Error('Request failed with status code 401')
      error.response = { status: 401, data: { error: 'unauthorized' }, headers: {}, config }
      error.config = config
      throw error
    })

    const fireAndToast = async () => {
      try { await api.get('/api/v1/assessments') }
      catch { toast.error('Session expired. Please sign in again.') }
    }
    await Promise.all([fireAndToast(), fireAndToast(), fireAndToast(), fireAndToast()])

    const errors = toast.items.filter(i => i.type === 'error')
    expect(errors.length).toBeLessThanOrEqual(2)
    expect(new Set(errors.map(e => e.message)).size).toBe(errors.length)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, withRetry, API_BASE_URL, logResolvedBaseUrl } from '../src/api/client'
import { useHealthStore } from '../src/stores/health'
import { makeTestPlugins } from './helpers.js'

let originalAdapter
let warnSpy
let infoSpy

beforeEach(() => {
  originalAdapter = api.defaults.adapter
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  warnSpy.mockRestore()
  infoSpy.mockRestore()
})

function withAdapter(adapter) {
  api.defaults.adapter = adapter
}

function networkError(config) {
  const err = new Error('Network Error')
  err.code = 'ERR_NETWORK'
  err.config = config
  return err
}

function fail500(config) {
  const err = new Error('Request failed with status code 500')
  err.response = { status: 500, data: {}, headers: {}, config }
  err.config = config
  err.code = 'ERR_BAD_RESPONSE'
  return err
}

describe('GET /api/v1/ping connectivity', () => {
  it('returns the { status: "ok" } payload from the backend', async () => {
    await makeTestPlugins({ path: '/' })
    let observedUrl = null
    withAdapter(async (config) => {
      observedUrl = config.url
      return {
        status: 200,
        data: { status: 'ok', time: '2026-05-06T00:00:00Z' },
        headers: {},
        config
      }
    })

    const { data } = await api.get('/api/v1/ping')
    expect(observedUrl).toBe('/api/v1/ping')
    expect(data).toEqual({ status: 'ok', time: '2026-05-06T00:00:00Z' })
  })

  it('drives the health store online=true after a successful ping', async () => {
    await makeTestPlugins({ path: '/' })
    const health = useHealthStore()
    withAdapter(async (config) => ({
      status: 200, data: { status: 'ok', time: 'x' }, headers: {}, config
    }))

    await health.ping()
    expect(health.online).toBe(true)
    expect(health.lastError).toBeNull()
  })
})

describe('Connection retries — withRetry()', () => {
  it('retries on a transient ERR_NETWORK and returns the eventual 200', async () => {
    await makeTestPlugins({ path: '/' })
    let calls = 0
    withAdapter(async (config) => {
      calls += 1
      if (calls < 3) throw networkError(config)
      return { status: 200, data: { status: 'ok', time: 't' }, headers: {}, config }
    })

    const { data } = await withRetry(
      () => api.get('/api/v1/ping'),
      { retries: 5, baseDelay: 1, maxDelay: 2 }
    )
    expect(data.status).toBe('ok')
    expect(calls).toBe(3)
  })

  it('retries on a 5xx and recovers on the next 200', async () => {
    await makeTestPlugins({ path: '/' })
    let calls = 0
    withAdapter(async (config) => {
      calls += 1
      if (calls === 1) throw fail500(config)
      return { status: 200, data: { status: 'ok' }, headers: {}, config }
    })

    const { data } = await withRetry(
      () => api.get('/api/v1/ping'),
      { retries: 3, baseDelay: 1, maxDelay: 2 }
    )
    expect(data.status).toBe('ok')
    expect(calls).toBe(2)
  })

  it('does NOT retry a 4xx (4xx is deterministic — retrying spams the server)', async () => {
    await makeTestPlugins({ path: '/' })
    let calls = 0
    withAdapter(async (config) => {
      calls += 1
      const err = new Error('400'); err.config = config
      err.response = { status: 400, data: {}, headers: {}, config }
      throw err
    })

    await expect(
      withRetry(() => api.get('/api/v1/ping'), { retries: 5, baseDelay: 1, maxDelay: 2 })
    ).rejects.toBeDefined()
    expect(calls).toBe(1)
  })

  it('gives up after the retry budget is exhausted (does not retry forever)', async () => {
    await makeTestPlugins({ path: '/' })
    let calls = 0
    withAdapter(async (config) => {
      calls += 1
      throw networkError(config)
    })

    await expect(
      withRetry(() => api.get('/api/v1/ping'), { retries: 3, baseDelay: 1, maxDelay: 2 })
    ).rejects.toBeDefined()
    expect(calls).toBe(4) // 1 initial + 3 retries
  })
})

describe('health.ping() — retries while Rails boots', () => {
  it('reports online=true once Rails comes up after a few failed attempts', async () => {
    await makeTestPlugins({ path: '/' })
    const health = useHealthStore()

    let calls = 0
    withAdapter(async (config) => {
      calls += 1
      if (calls < 3) throw networkError(config)
      return { status: 200, data: { status: 'ok', time: 't' }, headers: {}, config }
    })

    const ok = await health.ping({ retries: 4, baseDelay: 1 })
    expect(ok).toBe(true)
    expect(health.online).toBe(true)
    expect(health.attempts).toBe(3)
  })

  it('reports online=false with the last error when retries are exhausted', async () => {
    await makeTestPlugins({ path: '/' })
    const health = useHealthStore()

    withAdapter(async (config) => { throw networkError(config) })

    const ok = await health.ping({ retries: 2, baseDelay: 1 })
    expect(ok).toBe(false)
    expect(health.online).toBe(false)
    expect(health.lastError?.message).toContain('Network Error')
  })
})

describe('API base URL — port match', () => {
  it('exports an API_BASE_URL that resolves to same-origin (Vite proxy) when VITE_API_BASE is unset', () => {
    expect(typeof API_BASE_URL).toBe('string')
    expect(API_BASE_URL).toBe('')
  })

  it('logs the resolved base URL at most once on startup so a port mismatch is visible', async () => {
    vi.resetModules()
    const { logResolvedBaseUrl: fresh } = await import('../src/api/client')
    fresh()
    fresh()
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(String(infoSpy.mock.calls[0][0])).toContain('[api] baseURL=')
  })
})

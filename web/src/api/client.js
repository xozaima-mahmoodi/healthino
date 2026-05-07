import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const pendingControllers = new Set()

export const API_BASE_URL = import.meta.env.VITE_API_BASE || ''

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000
})

let baseUrlLogged = false
export function logResolvedBaseUrl() {
  if (baseUrlLogged) return
  baseUrlLogged = true
  const resolved = API_BASE_URL || `${typeof window !== 'undefined' ? window.location.origin : ''} (same-origin via dev proxy)`
  console.info(`[api] baseURL=${resolved}`)
}

api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${auth.token}`
  }

  if (!config.signal) {
    const controller = new AbortController()
    config.signal = controller.signal
    config.__healthinoController = controller
    pendingControllers.add(controller)
  }
  return config
})

function releaseController(config) {
  const controller = config && config.__healthinoController
  if (controller) pendingControllers.delete(controller)
}

api.interceptors.response.use(
  (response) => {
    releaseController(response.config)
    return response
  },
  (error) => {
    releaseController(error?.config)

    const status = error?.response?.status
    const code = error?.code
    if (code !== 'ERR_CANCELED') {
      const url = error?.config?.url || '?'
      const method = (error?.config?.method || 'get').toUpperCase()
      console.warn(`[api] ${method} ${url} failed`, status || code || error?.message)
    }

    if (status === 401) {
      try {
        const auth = useAuthStore()
        if (auth.token) auth.clear()
      } catch { /* pinia not ready — safe to skip */ }
    }
    return Promise.reject(error)
  }
)

export function cancelPendingRequests(reason = 'client_reset') {
  for (const controller of pendingControllers) {
    try { controller.abort(reason) } catch { /* ignore */ }
  }
  pendingControllers.clear()
}

export function pendingRequestCount() {
  return pendingControllers.size
}

function isRetriableError(err) {
  if (!err) return false
  if (err.code === 'ERR_CANCELED') return false
  const status = err.response?.status
  if (status == null) return true
  return status >= 500 && status < 600
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('aborted', 'AbortError'))
    }, { once: true })
  })
}

export async function withRetry(fn, {
  retries = 3,
  baseDelay = 300,
  maxDelay = 3000,
  signal
} = {}) {
  let attempt = 0
  while (true) {
    try {
      return await fn({ attempt })
    } catch (err) {
      const lastAttempt = attempt >= retries
      if (lastAttempt || !isRetriableError(err)) throw err
      const delay = Math.min(maxDelay, baseDelay * 2 ** attempt)
      console.warn(`[api] retry ${attempt + 1}/${retries} in ${delay}ms`)
      try { await sleep(delay, signal) } catch { throw err }
      attempt += 1
    }
  }
}

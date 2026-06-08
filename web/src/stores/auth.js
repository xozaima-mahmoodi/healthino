import { defineStore } from 'pinia'
import { api, cancelPendingRequests } from '../api/client'
import { sanitizeEmail } from '../utils/text'
import { useToastStore } from './toast'

const TOKEN_KEY = 'healthino:auth_token'
const USER_KEY  = 'healthino:auth_user'
const STORAGE_PREFIX = 'healthino:'

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore */ }
}

function readToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw || typeof raw !== 'string') return null
    return /^[A-Za-z0-9._\-]{8,256}$/.test(raw) ? raw : null
  } catch {
    return null
  }
}

function isValidUser(u) {
  if (!u || typeof u !== 'object') return false
  if (typeof u.id !== 'number' && typeof u.id !== 'string') return false
  if (u.email != null && typeof u.email !== 'string') return false
  if (u.name != null && typeof u.name !== 'string') return false
  return true
}

function readSafeUser() {
  const raw = readJson(USER_KEY)
  return isValidUser(raw) ? raw : null
}

function purgeAuthStorage() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch { /* ignore */ }
}

function bootState() {
  const token = readToken()
  const user  = readSafeUser()
  if ((token && !user) || (!token && user)) {
    purgeAuthStorage()
    return { token: null, user: null }
  }
  return { token, user }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const boot = bootState()
    return {
      token: boot.token,
      user: boot.user,
      submitting: false,
      error: null
    }
  },
  getters: {
    isAuthenticated: (s) => !!s.token,
    displayName: (s) => s.user?.display_name || s.user?.name || s.user?.email || ''
  },
  actions: {
    setToken(token) {
      this.token = token || null
      try {
        if (token) localStorage.setItem(TOKEN_KEY, token)
        else localStorage.removeItem(TOKEN_KEY)
      } catch { /* ignore */ }
    },
    setUser(user) {
      this.user = user || null
      writeJson(USER_KEY, user)
    },
    setSession({ token, user }) {
      this.setToken(token)
      this.setUser(user)
    },
    clear() {
      this.setToken(null)
      this.setUser(null)
      this.error = null
    },
    async login({ email, password }) {
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.post('/api/v1/auth/login', {
          email: sanitizeEmail(email),
          password
        })
        this.setSession(data)
        return true
      } catch (e) {
        this.error = e?.response?.data || { message: e?.message || 'request_failed' }
        return false
      } finally {
        this.submitting = false
      }
    },
    async register(payload) {
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.post('/api/v1/auth/register', {
          ...payload,
          email: sanitizeEmail(payload.email)
        })
        this.setSession(data)
        return true
      } catch (e) {
        this.error = e?.response?.data || { message: e?.message || 'request_failed' }
        return false
      } finally {
        this.submitting = false
      }
    },
    async fetchMe() {
      if (!this.token) return null
      try {
        const { data } = await api.get('/api/v1/me')
        this.setUser(data.user)
        return data.user
      } catch (e) {
        if (e?.response?.status === 401) this.clear()
        return null
      }
    },
    async updateProfile(payload) {
      this.submitting = true
      this.error = null
      try {
        const body = { ...payload }
        if (typeof body.email === 'string') body.email = sanitizeEmail(body.email)
        if (typeof body.name === 'string') body.name = body.name.trim()
        // Profile metadata only (name/email/locale). Password changes go through
        // updatePassword() against the dedicated verified endpoint.
        const { data } = await api.patch('/api/v1/user', body)
        this.setUser(data.user)
        return true
      } catch (e) {
        this.error = e?.response?.data || { message: e?.message || 'request_failed' }
        return false
      } finally {
        this.submitting = false
      }
    },
    // Dedicated, security-sensitive password change. Hits the verified endpoint
    // that requires the current password — passwords are never trimmed.
    async updatePassword({ current_password, password, password_confirmation }) {
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.put('/api/v1/profile/update_password', {
          current_password,
          password,
          password_confirmation
        })
        if (data?.user) this.setUser(data.user)
        return true
      } catch (e) {
        this.error = e?.response?.data || { message: e?.message || 'request_failed' }
        return false
      } finally {
        this.submitting = false
      }
    },
    logout() {
      this.clear()
    },
    hardReset() {
      cancelPendingRequests('hard_reset')
      try {
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k)
        }
        for (const k of keys) localStorage.removeItem(k)
      } catch { /* ignore */ }
      this.token = null
      this.user = null
      this.error = null
      this.submitting = false
      try { useToastStore().clear() } catch { /* pinia not ready */ }
    }
  }
})

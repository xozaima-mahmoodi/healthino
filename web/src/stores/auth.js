import { defineStore } from 'pinia'
import { api } from '../api/client'
import { sanitizeEmail } from '../utils/text'

const TOKEN_KEY = 'healthino:auth_token'
const USER_KEY  = 'healthino:auth_user'

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
  try { return localStorage.getItem(TOKEN_KEY) || null } catch { return null }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: readToken(),
    user: readJson(USER_KEY),
    submitting: false,
    error: null
  }),
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
    logout() {
      this.clear()
    }
  }
})

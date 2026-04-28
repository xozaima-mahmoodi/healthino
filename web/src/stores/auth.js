import { defineStore } from 'pinia'

const STORAGE_KEY = 'healthino:auth_token'

function readToken() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: readToken()
  }),
  getters: {
    isAuthenticated: (s) => !!s.token
  },
  actions: {
    setToken(token) {
      this.token = token || null
      try {
        if (token) localStorage.setItem(STORAGE_KEY, token)
        else localStorage.removeItem(STORAGE_KEY)
      } catch { /* ignore quota / privacy errors */ }
    },
    clear() {
      this.setToken(null)
    }
  }
})

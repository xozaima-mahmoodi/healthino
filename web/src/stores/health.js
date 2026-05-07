import { defineStore } from 'pinia'
import { api, withRetry } from '../api/client'

export const useHealthStore = defineStore('health', {
  state: () => ({
    online: true,
    lastCheckedAt: null,
    lastError: null,
    attempts: 0
  }),
  actions: {
    async ping({ timeout = 5000, retries = 0, baseDelay = 400 } = {}) {
      this.attempts = 0
      try {
        const { data } = await withRetry(async ({ attempt }) => {
          this.attempts = attempt + 1
          return api.get('/api/v1/ping', { timeout })
        }, { retries, baseDelay, maxDelay: 3000 })

        this.online = data?.status === 'ok'
        this.lastError = null
      } catch (e) {
        this.online = false
        this.lastError = {
          status: e?.response?.status || null,
          message: e?.message || 'unreachable'
        }
      } finally {
        this.lastCheckedAt = Date.now()
      }
      return this.online
    }
  }
})

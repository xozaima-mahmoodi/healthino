import { defineStore } from 'pinia'

const DEFAULT_DURATION = 3000
let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: []
  }),
  actions: {
    push(message, { type = 'info', duration = DEFAULT_DURATION } = {}) {
      const text = typeof message === 'string' ? message.trim() : ''
      if (!text) return null
      const id = nextId++
      const item = { id, type, message: text }
      this.items.push(item)
      if (duration > 0) {
        item.timer = setTimeout(() => this.dismiss(id), duration)
      }
      return id
    },
    success(message, opts = {}) {
      return this.push(message, { ...opts, type: 'success' })
    },
    error(message, opts = {}) {
      return this.push(message, { ...opts, type: 'error' })
    },
    info(message, opts = {}) {
      return this.push(message, { ...opts, type: 'info' })
    },
    dismiss(id) {
      const idx = this.items.findIndex(i => i.id === id)
      if (idx === -1) return
      const [removed] = this.items.splice(idx, 1)
      if (removed?.timer) clearTimeout(removed.timer)
    },
    clear() {
      for (const i of this.items) {
        if (i.timer) clearTimeout(i.timer)
      }
      this.items = []
    }
  }
})

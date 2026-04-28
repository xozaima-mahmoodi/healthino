import { beforeEach } from 'vitest'

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-url'
  URL.revokeObjectURL = () => {}
}

beforeEach(() => {
  document.documentElement.classList.remove('dark')
  document.documentElement.lang = 'fa'
  document.documentElement.dir = 'rtl'
  localStorage.clear()
})

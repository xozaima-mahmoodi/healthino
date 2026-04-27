import { beforeEach } from 'vitest'

beforeEach(() => {
  document.documentElement.classList.remove('dark')
  document.documentElement.lang = 'fa'
  document.documentElement.dir = 'rtl'
  localStorage.clear()
})

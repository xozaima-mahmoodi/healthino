import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {}))
  }
}))

import Login from '../src/views/Login.vue'
import SymptomForm from '../src/components/SymptomForm.vue'
import ToastContainer from '../src/components/ToastContainer.vue'
import faMessages from '../src/locales/fa.json'
import { useAuthStore } from '../src/stores/auth'
import { useSymptomStore } from '../src/stores/symptom'
import { useToastStore } from '../src/stores/toast'
import { makeTestPlugins } from './helpers.js'

function findToastInBody(text) {
  const nodes = document.body.querySelectorAll('[data-toast-id]')
  for (const n of nodes) {
    if (n.textContent && n.textContent.includes(text)) return n
  }
  return null
}

describe('toast store', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('push() returns an id, adds to items, and auto-dismisses after the default duration', async () => {
    await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    const id = toast.success('hello')

    expect(id).toBeGreaterThan(0)
    expect(toast.items).toHaveLength(1)
    expect(toast.items[0]).toMatchObject({ id, type: 'success', message: 'hello' })

    vi.advanceTimersByTime(2999)
    expect(toast.items).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.items).toHaveLength(0)
  })

  it('dismiss() removes the toast immediately and cancels its timer', async () => {
    await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    const id = toast.error('bad')
    expect(toast.items).toHaveLength(1)

    toast.dismiss(id)
    expect(toast.items).toHaveLength(0)

    vi.advanceTimersByTime(5000)
    expect(toast.items).toHaveLength(0)
  })

  it('ignores empty/whitespace messages', async () => {
    await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    expect(toast.success('')).toBeNull()
    expect(toast.success('   ')).toBeNull()
    expect(toast.items).toHaveLength(0)
  })
})

describe('ToastContainer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders a toast item from the store inside the container', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    mount(ToastContainer, { global: { plugins }, attachTo: document.body })

    toast.success('یک پیام تستی')
    await nextTick()

    const node = findToastInBody('یک پیام تستی')
    expect(node).not.toBeNull()
    expect(node.getAttribute('data-testid')).toBe('toast-success')
  })

  it('removes the toast from the DOM after dismiss()', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const toast = useToastStore()
    mount(ToastContainer, { global: { plugins }, attachTo: document.body })

    const id = toast.error('err msg')
    await nextTick()
    expect(findToastInBody('err msg')).not.toBeNull()

    toast.dismiss(id)
    await nextTick()
    expect(findToastInBody('err msg')).toBeNull()
  })
})

describe('Toast — Login flow', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the success toast after a successful login', async () => {
    const { plugins, router } = await makeTestPlugins({ path: '/login' })
    mount(ToastContainer, { global: { plugins }, attachTo: document.body })
    const wrapper = mount(Login, { global: { plugins } })
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockResolvedValue(true)
    vi.spyOn(router, 'push').mockImplementation(() => {})

    await wrapper.find('[data-testid="login-email"]').setValue('a@b.io')
    await wrapper.find('[data-testid="login-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    await nextTick()

    const node = findToastInBody(faMessages.toast.login_success)
    expect(node).not.toBeNull()
    expect(node.getAttribute('data-testid')).toBe('toast-success')
  })

  it('shows the error toast when login fails', async () => {
    const { plugins } = await makeTestPlugins({ path: '/login' })
    mount(ToastContainer, { global: { plugins }, attachTo: document.body })
    const wrapper = mount(Login, { global: { plugins } })
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockImplementation(async () => {
      auth.error = { errors: { base: ['invalid_credentials'] } }
      return false
    })

    await wrapper.find('[data-testid="login-email"]').setValue('x@y.io')
    await wrapper.find('[data-testid="login-password"]').setValue('whatever')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    await nextTick()

    const node = findToastInBody(faMessages.toast.login_error)
    expect(node).not.toBeNull()
    expect(node.getAttribute('data-testid')).toBe('toast-error')
  })
})

describe('Toast — Symptom analysis flow', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function fillRequired(wrapper) {
    await wrapper.find('[data-testid="primary-symptom-select"]').setValue('headache')
    await wrapper.find('[data-testid="body-area-select"]').setValue('head')
    await wrapper.find('[data-testid="duration-input"]').setValue(3)
  }

  it('shows the success toast after a successful analysis', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    mount(ToastContainer, { global: { plugins }, attachTo: document.body })
    const wrapper = mount(SymptomForm, { global: { plugins } })
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockImplementation(async () => {
      store.result = { red_flag: false, specialty: { id: 1, name: 'پوست' }, doctors: [] }
      return true
    })

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')
    await nextTick()
    await nextTick()

    const node = findToastInBody(faMessages.toast.analysis_success)
    expect(node).not.toBeNull()
    expect(node.getAttribute('data-testid')).toBe('toast-success')
  })

  it('shows the error toast when analysis fails', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    mount(ToastContainer, { global: { plugins }, attachTo: document.body })
    const wrapper = mount(SymptomForm, { global: { plugins } })
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockImplementation(async () => {
      store.error = { message: 'Network Error' }
      return false
    })

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')
    await nextTick()
    await nextTick()

    const node = findToastInBody(faMessages.toast.analysis_error)
    expect(node).not.toBeNull()
    expect(node.getAttribute('data-testid')).toBe('toast-error')
  })
})

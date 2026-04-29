import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {}))
  }
}))

import Login from '../src/views/Login.vue'
import Register from '../src/views/Register.vue'
import faMessages from '../src/locales/fa.json'
import { useAuthStore } from '../src/stores/auth'
import { makeTestPlugins } from './helpers.js'

async function mountLogin() {
  const { plugins, router } = await makeTestPlugins({ path: '/login' })
  const wrapper = mount(Login, { global: { plugins } })
  return { wrapper, router }
}

async function mountRegister() {
  const { plugins, router } = await makeTestPlugins({ path: '/register' })
  const wrapper = mount(Register, { global: { plugins } })
  return { wrapper, router }
}

describe('Login.vue', () => {
  it('renders the login card with email + password fields', async () => {
    const { wrapper } = await mountLogin()
    expect(wrapper.find('[data-testid="login-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-password"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-submit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(faMessages.auth.login_title)
  })

  it('keeps the submit button disabled until both fields are filled (and password ≥6)', async () => {
    const { wrapper } = await mountLogin()
    const submit = wrapper.find('[data-testid="login-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="login-email"]').setValue('a@b.io')
    await wrapper.find('[data-testid="login-password"]').setValue('short')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="login-password"]').setValue('secret123')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('calls auth.login with the trimmed credentials and navigates to "/" by default', async () => {
    const { wrapper, router } = await mountLogin()
    const auth = useAuthStore()
    const loginSpy = vi.spyOn(auth, 'login').mockResolvedValue(true)
    const pushSpy = vi.spyOn(router, 'push')

    await wrapper.find('[data-testid="login-email"]').setValue('  Sara@Example.IO  ')
    await wrapper.find('[data-testid="login-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')

    expect(loginSpy).toHaveBeenCalledWith({ email: 'Sara@Example.IO', password: 'secret123' })
    expect(pushSpy).toHaveBeenCalledWith('/')
  })

  it('strips invisible bidi/IME chars from the email before submitting', async () => {
    const { wrapper } = await mountLogin()
    const auth = useAuthStore()
    const loginSpy = vi.spyOn(auth, 'login').mockResolvedValue(true)

    const noisy = '‎ khazimeh@gmail.com‏​'
    await wrapper.find('[data-testid="login-email"]').setValue(noisy)
    await wrapper.find('[data-testid="login-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')

    expect(loginSpy).toHaveBeenCalledWith({ email: 'khazimeh@gmail.com', password: 'secret123' })
  })

  it('renders an error banner when auth.error is set, and stays on /login', async () => {
    const { wrapper, router } = await mountLogin()
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockImplementation(async () => {
      auth.error = { errors: { base: ['invalid_credentials'] } }
      return false
    })
    const pushSpy = vi.spyOn(router, 'push')

    await wrapper.find('[data-testid="login-email"]').setValue('x@y.io')
    await wrapper.find('[data-testid="login-password"]').setValue('whatever')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(pushSpy).not.toHaveBeenCalled()
    const banner = wrapper.find('[data-testid="login-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain(faMessages.auth.invalid_credentials)
  })

  it('respects ?next= when redirecting after a successful login', async () => {
    const { plugins, router } = await makeTestPlugins({ path: '/login?next=/symptoms' })
    const wrapper = mount(Login, { global: { plugins } })
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockResolvedValue(true)
    const pushSpy = vi.spyOn(router, 'push')

    await wrapper.find('[data-testid="login-email"]').setValue('a@b.io')
    await wrapper.find('[data-testid="login-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')

    expect(pushSpy).toHaveBeenCalledWith('/symptoms')
  })
})

describe('GlobalHeader — post-login identity', () => {
  it('shows the user display name instead of the Login pill once a session exists', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({
      token: 'tok-abc',
      user: { id: 1, name: 'خزیمه محمودی', display_name: 'خزیمه محمودی', email: 'k@gmail.com', is_doctor: false }
    })
    const { default: GlobalHeader } = await import('../src/components/GlobalHeader.vue')
    const wrapper = mount(GlobalHeader, { global: { plugins } })
    await nextTick()

    expect(wrapper.find('[data-testid="login-link"]').exists()).toBe(false)
    const menu = wrapper.find('[data-testid="user-menu"]')
    expect(menu.exists()).toBe(true)
    expect(wrapper.find('[data-testid="user-display-name"]').text()).toBe('خزیمه محمودی')
    expect(wrapper.find('[data-testid="logout-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="history-link"]').exists()).toBe(true)
  })
})

describe('Register.vue', () => {
  it('renders the register card with name + email + password fields', async () => {
    const { wrapper } = await mountRegister()
    expect(wrapper.find('[data-testid="register-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="register-name"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="register-email"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="register-password"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(faMessages.auth.register_title)
  })

  it('keeps submit disabled until name (≥2) + email + password (≥6) are filled', async () => {
    const { wrapper } = await mountRegister()
    const submit = wrapper.find('[data-testid="register-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="register-name"]').setValue('S')
    await wrapper.find('[data-testid="register-email"]').setValue('s@x.io')
    await wrapper.find('[data-testid="register-password"]').setValue('secret123')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="register-name"]').setValue('Sara')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('submits to auth.register and navigates to "/" (Home) on success', async () => {
    const { wrapper, router } = await mountRegister()
    const auth = useAuthStore()
    const regSpy = vi.spyOn(auth, 'register').mockResolvedValue(true)
    const pushSpy = vi.spyOn(router, 'push')

    await wrapper.find('[data-testid="register-name"]').setValue('خزیمه محمودی')
    await wrapper.find('[data-testid="register-email"]').setValue('khazimeh@gmail.com')
    await wrapper.find('[data-testid="register-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')

    expect(regSpy).toHaveBeenCalledWith(expect.objectContaining({
      name: 'خزیمه محمودی',
      email: 'khazimeh@gmail.com',
      password: 'secret123',
      preferred_locale: 'fa'
    }))
    expect(pushSpy).toHaveBeenCalledWith('/')
  })

  it('strips invisible bidi/IME chars from the email before submitting', async () => {
    const { wrapper } = await mountRegister()
    const auth = useAuthStore()
    const regSpy = vi.spyOn(auth, 'register').mockResolvedValue(true)

    const noisy = '‎ khazimeh@gmail.com‏​'
    await wrapper.find('[data-testid="register-name"]').setValue('خزیمه محمودی')
    await wrapper.find('[data-testid="register-email"]').setValue(noisy)
    await wrapper.find('[data-testid="register-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')

    expect(regSpy).toHaveBeenCalledWith(expect.objectContaining({
      email: 'khazimeh@gmail.com',
      name: 'خزیمه محمودی'
    }))
  })

  it('shows server-side validation errors in the banner', async () => {
    const { wrapper } = await mountRegister()
    const auth = useAuthStore()
    vi.spyOn(auth, 'register').mockImplementation(async () => {
      auth.error = { errors: { email: ['has already been taken'] } }
      return false
    })

    await wrapper.find('[data-testid="register-name"]').setValue('Sara')
    await wrapper.find('[data-testid="register-email"]').setValue('sara@example.com')
    await wrapper.find('[data-testid="register-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const banner = wrapper.find('[data-testid="register-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('email: has already been taken')
  })
})

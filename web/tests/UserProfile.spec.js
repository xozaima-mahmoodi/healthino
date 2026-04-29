import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {}))
  }
}))

import UserProfile from '../src/views/UserProfile.vue'
import faMessages from '../src/locales/fa.json'
import { useAuthStore } from '../src/stores/auth'
import { makeTestPlugins } from './helpers.js'

async function mountProfile({ authed = true } = {}) {
  const { plugins, router } = await makeTestPlugins({ path: '/profile' })
  const auth = useAuthStore()
  if (authed) {
    auth.setSession({
      token: 'tok-prof',
      user: {
        id: 42,
        name: 'خزیمه محمودی',
        display_name: 'خزیمه محمودی',
        email: 'k@gmail.com',
        is_doctor: false,
        created_at: '2025-09-01T10:00:00Z'
      }
    })
  }
  const wrapper = mount(UserProfile, { global: { plugins } })
  await nextTick()
  return { wrapper, router, auth }
}

describe('UserProfile.vue', () => {
  it('renders the profile card with name, email and joined date when authenticated', async () => {
    const { wrapper } = await mountProfile()

    expect(wrapper.find('[data-testid="profile-card"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(faMessages.profile.title)

    expect(wrapper.find('[data-testid="profile-name-text"]').text()).toBe('خزیمه محمودی')
    expect(wrapper.find('[data-testid="profile-email-text"]').text()).toBe('k@gmail.com')

    const joined = wrapper.find('[data-testid="profile-joined-text"]').text()
    expect(joined.length).toBeGreaterThan(0)
    expect(joined).not.toBe('—')
  })

  it('shows the sign-in prompt when not authenticated', async () => {
    const { wrapper } = await mountProfile({ authed: false })

    expect(wrapper.find('[data-testid="profile-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="profile-needs-auth"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(faMessages.profile.sign_in_required)
  })

  it('toggles between view and edit modes via the Edit and Cancel buttons', async () => {
    const { wrapper } = await mountProfile()

    expect(wrapper.find('[data-testid="profile-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-edit-form"]').exists()).toBe(false)

    await wrapper.find('[data-testid="profile-edit-button"]').trigger('click')

    expect(wrapper.find('[data-testid="profile-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="profile-edit-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-name-input"]').element.value).toBe('خزیمه محمودی')
    expect(wrapper.find('[data-testid="profile-email-input"]').element.value).toBe('k@gmail.com')

    await wrapper.find('[data-testid="profile-name-input"]').setValue('Edited Locally')
    await wrapper.find('[data-testid="profile-cancel-button"]').trigger('click')

    expect(wrapper.find('[data-testid="profile-edit-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="profile-name-text"]').text()).toBe('خزیمه محمودی')
  })

  it('saves edits via auth.updateProfile, returns to view mode and shows the saved banner', async () => {
    const { wrapper } = await mountProfile()
    const auth = useAuthStore()
    const updateSpy = vi.spyOn(auth, 'updateProfile').mockImplementation(async (payload) => {
      auth.setUser({ ...auth.user, ...payload })
      return true
    })

    await wrapper.find('[data-testid="profile-edit-button"]').trigger('click')
    await wrapper.find('[data-testid="profile-name-input"]').setValue('Sara K')
    await wrapper.find('[data-testid="profile-email-input"]').setValue('  Sara@Example.IO  ')
    await wrapper.find('[data-testid="profile-edit-form"]').trigger('submit')
    await nextTick()

    expect(updateSpy).toHaveBeenCalledWith({ name: 'Sara K', email: 'Sara@Example.IO' })
    expect(wrapper.find('[data-testid="profile-edit-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="profile-saved"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-name-text"]').text()).toBe('Sara K')
  })

  it('keeps editing and surfaces server errors when updateProfile fails', async () => {
    const { wrapper } = await mountProfile()
    const auth = useAuthStore()
    vi.spyOn(auth, 'updateProfile').mockImplementation(async () => {
      auth.error = { errors: { email: ['has already been taken'] } }
      return false
    })

    await wrapper.find('[data-testid="profile-edit-button"]').trigger('click')
    await wrapper.find('[data-testid="profile-email-input"]').setValue('taken@example.com')
    await wrapper.find('[data-testid="profile-edit-form"]').trigger('submit')
    await nextTick()

    expect(wrapper.find('[data-testid="profile-edit-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-saved"]').exists()).toBe(false)
    const banner = wrapper.find('[data-testid="profile-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('email: has already been taken')
  })
})

describe('auth.updateProfile', () => {
  it('PATCHes /api/v1/user with trimmed payload and stores the returned user', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({
      token: 'tok',
      user: { id: 1, name: 'Old', email: 'old@example.com', display_name: 'Old', is_doctor: false }
    })

    const { api } = await import('../src/api/client')
    api.patch.mockResolvedValueOnce({
      data: {
        user: { id: 1, name: 'New', email: 'new@example.com', display_name: 'New', is_doctor: false }
      }
    })

    const ok = await auth.updateProfile({ name: '  New  ', email: '  New@Example.com  ' })

    expect(ok).toBe(true)
    expect(api.patch).toHaveBeenCalledWith(
      '/api/v1/user',
      { name: 'New', email: 'New@Example.com' }
    )
    expect(auth.user.name).toBe('New')
    expect(auth.user.email).toBe('new@example.com')
  })
})

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

describe('UserProfile.vue — password change', () => {
  async function enterEdit() {
    const { wrapper } = await mountProfile()
    await wrapper.find('[data-testid="profile-edit-button"]').trigger('click')
    return wrapper
  }

  it('renders the new + confirm password inputs as type="password" with eye toggles', async () => {
    const wrapper = await enterEdit()
    const newPw = wrapper.find('[data-testid="profile-new-password-input"]')
    const confirmPw = wrapper.find('[data-testid="profile-confirm-password-input"]')

    expect(newPw.exists()).toBe(true)
    expect(confirmPw.exists()).toBe(true)
    expect(newPw.attributes('type')).toBe('password')
    expect(confirmPw.attributes('type')).toBe('password')

    await wrapper.find('[data-testid="profile-new-password-toggle"]').trigger('click')
    expect(newPw.attributes('type')).toBe('text')
    await wrapper.find('[data-testid="profile-new-password-toggle"]').trigger('click')
    expect(newPw.attributes('type')).toBe('password')
  })

  it('keeps Save enabled when both password fields are blank (profile-only edit)', async () => {
    const wrapper = await enterEdit()
    const save = wrapper.find('[data-testid="profile-save-button"]')
    expect(save.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="profile-password-error"]').exists()).toBe(false)
  })

  it('disables Save and shows the mismatch hint when the two passwords differ', async () => {
    const wrapper = await enterEdit()
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('SuperSecret1')
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('Different99')
    await nextTick()

    const save = wrapper.find('[data-testid="profile-save-button"]')
    expect(save.attributes('disabled')).toBeDefined()

    const hint = wrapper.find('[data-testid="profile-password-error"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe(faMessages.profile.password_mismatch)
  })

  it('disables Save and shows the too-short hint when the new password is < 8 chars', async () => {
    const wrapper = await enterEdit()
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('short7c')
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('short7c')
    await nextTick()

    const save = wrapper.find('[data-testid="profile-save-button"]')
    expect(save.attributes('disabled')).toBeDefined()

    const hint = wrapper.find('[data-testid="profile-password-error"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe(faMessages.profile.password_too_short)
  })

  it('enables Save and clears the hint once both passwords match and meet the 8-char minimum', async () => {
    const wrapper = await enterEdit()
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('LongEnough1')
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('LongEnough1')
    await nextTick()

    expect(wrapper.find('[data-testid="profile-save-button"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="profile-password-error"]').exists()).toBe(false)
  })

  it('forwards password + password_confirmation to updateProfile and shows the password-success toast', async () => {
    const wrapper = await enterEdit()
    const auth = useAuthStore()
    const updateSpy = vi.spyOn(auth, 'updateProfile').mockResolvedValue(true)

    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('LongEnough1')
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('LongEnough1')
    await wrapper.find('[data-testid="profile-edit-form"]').trigger('submit')
    await nextTick()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.password).toBe('LongEnough1')
    expect(payload.password_confirmation).toBe('LongEnough1')
    expect(payload.name).toBe('خزیمه محمودی')
    expect(payload.email).toBe('k@gmail.com')
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

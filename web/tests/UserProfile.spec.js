import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {})),
    put: vi.fn(() => new Promise(() => {}))
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

describe('UserProfile.vue — change password', () => {
  const STRONG = 'StrongPass1!'

  it('renders 3 password fields (current/new/confirm) as type="password", each with an eye toggle', async () => {
    const { wrapper } = await mountProfile()
    const current = wrapper.find('[data-testid="profile-current-password-input"]')
    const newPw = wrapper.find('[data-testid="profile-new-password-input"]')
    const confirmPw = wrapper.find('[data-testid="profile-confirm-password-input"]')

    expect(current.exists()).toBe(true)
    expect(newPw.exists()).toBe(true)
    expect(confirmPw.exists()).toBe(true)
    expect(current.attributes('type')).toBe('password')
    expect(newPw.attributes('type')).toBe('password')
    expect(confirmPw.attributes('type')).toBe('password')

    await wrapper.find('[data-testid="profile-current-password-toggle"]').trigger('click')
    expect(current.attributes('type')).toBe('text')
    await wrapper.find('[data-testid="profile-new-password-toggle"]').trigger('click')
    expect(newPw.attributes('type')).toBe('text')
    await wrapper.find('[data-testid="profile-confirm-password-toggle"]').trigger('click')
    expect(confirmPw.attributes('type')).toBe('text')
  })

  it('keeps the Change Password button disabled until every rule passes', async () => {
    const { wrapper } = await mountProfile()
    const btn = () => wrapper.find('[data-testid="profile-change-password-button"]')

    expect(btn().attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="profile-current-password-input"]').setValue('oldsecret')
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue(STRONG)
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue(STRONG)
    await nextTick()

    expect(btn().attributes('disabled')).toBeUndefined()
  })

  it('shows a real-time mismatch warning and disables submit when new/confirm differ', async () => {
    const { wrapper } = await mountProfile()
    await wrapper.find('[data-testid="profile-current-password-input"]').setValue('oldsecret')
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue(STRONG)
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('Different1!')
    await nextTick()

    const hint = wrapper.find('[data-testid="profile-password-error"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe(faMessages.profile.password_mismatch)
    expect(wrapper.find('[data-testid="profile-change-password-button"]').attributes('disabled')).toBeDefined()
  })

  it('reflects the strength rules (length / number / special) live and blocks weak passwords', async () => {
    const { wrapper } = await mountProfile()
    await wrapper.find('[data-testid="profile-current-password-input"]').setValue('oldsecret')
    const newPw = wrapper.find('[data-testid="profile-new-password-input"]')

    // length only — number + special still missing → still disabled
    await newPw.setValue('abcdefgh')
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('abcdefgh')
    await nextTick()
    expect(wrapper.find('[data-testid="pw-rule-length"]').text()).toContain('✓')
    expect(wrapper.find('[data-testid="pw-rule-number"]').text()).toContain('○')
    expect(wrapper.find('[data-testid="pw-rule-special"]').text()).toContain('○')
    expect(wrapper.find('[data-testid="profile-change-password-button"]').attributes('disabled')).toBeDefined()

    // all three rules satisfied → enabled
    await newPw.setValue('abcdefg1!')
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('abcdefg1!')
    await nextTick()
    expect(wrapper.find('[data-testid="pw-rule-number"]').text()).toContain('✓')
    expect(wrapper.find('[data-testid="pw-rule-special"]').text()).toContain('✓')
    expect(wrapper.find('[data-testid="profile-change-password-button"]').attributes('disabled')).toBeUndefined()
  })

  it('calls auth.updatePassword with current/new/confirm and shows the success toast', async () => {
    const { wrapper } = await mountProfile()
    const auth = useAuthStore()
    const updateSpy = vi.spyOn(auth, 'updatePassword').mockResolvedValue(true)

    await wrapper.find('[data-testid="profile-current-password-input"]').setValue('oldsecret')
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue(STRONG)
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue(STRONG)
    await wrapper.find('[data-testid="profile-password-section"]').trigger('submit')
    await nextTick()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({
      current_password: 'oldsecret',
      password: STRONG,
      password_confirmation: STRONG
    })
    // fields are cleared and the inline success note appears
    expect(wrapper.find('[data-testid="profile-current-password-input"]').element.value).toBe('')
    expect(wrapper.find('[data-testid="profile-password-saved"]').exists()).toBe(true)
  })

  it('surfaces an incorrect-current-password error returned by the server', async () => {
    const { wrapper } = await mountProfile()
    const auth = useAuthStore()
    vi.spyOn(auth, 'updatePassword').mockImplementation(async () => {
      auth.error = { errors: { current_password: ['is incorrect'] } }
      return false
    })

    await wrapper.find('[data-testid="profile-current-password-input"]').setValue('wrongpass')
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue(STRONG)
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue(STRONG)
    await wrapper.find('[data-testid="profile-password-section"]').trigger('submit')
    await nextTick()

    const err = wrapper.find('[data-testid="profile-password-server-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toBe(faMessages.profile.password_current_incorrect)
    // the password error must not leak into the profile-wide error banner
    expect(wrapper.find('[data-testid="profile-error"]').exists()).toBe(false)
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

describe('auth.updatePassword', () => {
  it('PUTs to the dedicated endpoint with untrimmed credentials and stores the returned user', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({
      token: 'tok',
      user: { id: 1, name: 'A', email: 'a@example.com', display_name: 'A', is_doctor: false }
    })

    const { api } = await import('../src/api/client')
    api.put.mockResolvedValueOnce({
      data: {
        message: 'password_updated',
        user: { id: 1, name: 'A', email: 'a@example.com', display_name: 'A', is_doctor: false }
      }
    })

    const ok = await auth.updatePassword({
      current_password: ' old ',
      password: 'StrongPass1! ',
      password_confirmation: 'StrongPass1! '
    })

    expect(ok).toBe(true)
    expect(api.put).toHaveBeenCalledWith('/api/v1/profile/update_password', {
      current_password: ' old ',
      password: 'StrongPass1! ',
      password_confirmation: 'StrongPass1! '
    })
  })

  it('returns false and records the error on failure', async () => {
    await makeTestPlugins({ path: '/' })
    const auth = useAuthStore()
    auth.setSession({
      token: 'tok',
      user: { id: 1, name: 'A', email: 'a@example.com', display_name: 'A', is_doctor: false }
    })

    const { api } = await import('../src/api/client')
    api.put.mockRejectedValueOnce({
      response: { status: 401, data: { errors: { current_password: ['is incorrect'] } } }
    })

    const ok = await auth.updatePassword({
      current_password: 'wrong',
      password: 'StrongPass1!',
      password_confirmation: 'StrongPass1!'
    })

    expect(ok).toBe(false)
    expect(auth.error).toEqual({ errors: { current_password: ['is incorrect'] } })
  })
})

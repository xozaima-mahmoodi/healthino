import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {}))
  }
}))

import DoctorDashboard from '../src/views/DoctorDashboard.vue'
import faMessages from '../src/locales/fa.json'
import { useAuthStore } from '../src/stores/auth'
import { makeTestPlugins } from './helpers.js'

async function mountDashboard({ authed = true } = {}) {
  const { plugins, router } = await makeTestPlugins({ path: '/doctor' })
  const auth = useAuthStore()
  if (authed) auth.setToken('doctor-token-xyz')
  else auth.clear()
  const wrapper = mount(DoctorDashboard, { global: { plugins } })
  return { wrapper, router }
}

describe('DoctorDashboard — gating', () => {
  it('shows the sign-in-required block when no token is set', async () => {
    const { wrapper } = await mountDashboard({ authed: false })
    await nextTick()

    expect(wrapper.find('[data-testid="doctor-needs-auth"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="doctor-dashboard-card"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(faMessages.doctor.sign_in_required)
  })

  it('renders the dashboard form when authenticated', async () => {
    const { wrapper } = await mountDashboard()
    expect(wrapper.find('[data-testid="doctor-dashboard-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="doctor-patient-id-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="doctor-view-button"]').exists()).toBe(true)
  })
})

describe('DoctorDashboard — patient lookup', () => {
  it('keeps the View button disabled until a positive integer ID is entered', async () => {
    const { wrapper } = await mountDashboard()
    const btn = wrapper.find('[data-testid="doctor-view-button"]')
    expect(btn.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="doctor-patient-id-input"]').setValue('0')
    expect(btn.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="doctor-patient-id-input"]').setValue('42')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('navigates to /history?user_id=X on submit', async () => {
    const { wrapper, router } = await mountDashboard()
    const pushSpy = vi.spyOn(router, 'push')

    await wrapper.find('[data-testid="doctor-patient-id-input"]').setValue('1024')
    await wrapper.find('form').trigger('submit')

    expect(pushSpy).toHaveBeenCalledWith({ path: '/history', query: { user_id: 1024 } })
  })

  it('records the looked-up patient in the recent list and renders a chip for it', async () => {
    const { wrapper } = await mountDashboard()
    expect(wrapper.find('[data-testid="doctor-recent-list"]').exists()).toBe(false)

    await wrapper.find('[data-testid="doctor-patient-id-input"]').setValue('77')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(wrapper.find('[data-testid="doctor-recent-list"]').exists()).toBe(true)
    const chips = wrapper.findAll('[data-testid="doctor-recent-item"]')
    expect(chips).toHaveLength(1)
    expect(chips[0].attributes('data-id')).toBe('77')
    expect(chips[0].text()).toContain('#77')
  })

  it('clicking a recent chip re-navigates to that patient', async () => {
    const { wrapper, router } = await mountDashboard()

    await wrapper.find('[data-testid="doctor-patient-id-input"]').setValue('5')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const pushSpy = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="doctor-recent-item"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ path: '/history', query: { user_id: 5 } })
  })
})

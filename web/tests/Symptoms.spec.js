import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import Symptoms from '../src/views/Symptoms.vue'
import { useSymptomStore } from '../src/stores/symptom'
import { makeTestPlugins } from './helpers.js'

const STALE_RESULT = {
  red_flag: false,
  specialty: { id: 1, name: 'پوست' },
  doctors: [{ id: 1, name: 'دکتر تستی', experience_years: 5, rating: 4.5 }]
}

async function mountSymptoms() {
  const { plugins } = await makeTestPlugins({ path: '/symptoms' })
  return mount(Symptoms, { global: { plugins } })
}

describe('Symptoms view — fresh-on-entry guarantee', () => {
  it('clears any leftover result from the store on mount, so the form is always shown first', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    const store = useSymptomStore()
    store.result = STALE_RESULT
    store.error = { message: 'old error' }

    const wrapper = mount(Symptoms, { global: { plugins } })
    await nextTick()

    expect(store.result).toBeNull()
    expect(store.error).toBeNull()
    expect(wrapper.find('[data-testid="result-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="form-card"]').exists()).toBe(true)
  })

  it('renders empty form fields on entry (no carryover from a previous session)', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    const store = useSymptomStore()
    store.result = STALE_RESULT

    const wrapper = mount(Symptoms, { global: { plugins } })
    await nextTick()

    expect(wrapper.find('[data-testid="primary-symptom-select"]').element.value).toBe('')
    expect(wrapper.find('[data-testid="additional-info-input"]').element.value).toBe('')
    expect(wrapper.find('[data-testid="body-area-select"]').element.value).toBe('')
    expect(wrapper.find('[data-testid="duration-input"]').element.value).toBe('')
    expect(wrapper.findAll('[data-testid="attachment-item"]')).toHaveLength(0)
  })

  it('does not show any validation errors on a fresh mount', async () => {
    const wrapper = await mountSymptoms()
    await nextTick()

    expect(wrapper.find('[data-testid="error-symptom"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-body-area"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-duration"]').exists()).toBe(false)
  })
})

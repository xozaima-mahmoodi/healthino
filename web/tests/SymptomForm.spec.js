import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SymptomForm from '../src/components/SymptomForm.vue'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

async function mountForm() {
  const { plugins } = await makeTestPlugins()
  return mount(SymptomForm, { global: { plugins } })
}

describe('SymptomForm — primary symptom select', () => {
  it('renders a native <select> (so the user cannot type into it)', async () => {
    const wrapper = await mountForm()
    const select = wrapper.find('[data-testid="primary-symptom-select"]')
    expect(select.exists()).toBe(true)
    expect(select.element.tagName).toBe('SELECT')
  })

  it('uses the bilingual primary-symptom label', async () => {
    const wrapper = await mountForm()
    expect(wrapper.text()).toContain(faMessages.symptom_form.symptoms_label)
  })

  it('contains a disabled placeholder plus the common-symptom options', async () => {
    const wrapper = await mountForm()
    const options = wrapper.find('[data-testid="primary-symptom-select"]').findAll('option')

    expect(options.length).toBeGreaterThan(1)
    expect(options[0].attributes('disabled')).toBeDefined()
    expect(options[0].attributes('value')).toBe('')

    const labels = options.slice(1).map(o => o.text())
    expect(labels).toContain(faMessages.symptoms.headache)
    expect(labels).toContain(faMessages.symptoms.fever)
    expect(labels).toContain(faMessages.symptoms.shortness_of_breath)
  })

  it('binds the selected option into the form state', async () => {
    const wrapper = await mountForm()
    const select = wrapper.find('[data-testid="primary-symptom-select"]')
    await select.setValue('cough')
    expect(select.element.value).toBe('cough')
  })

  it('keeps submit disabled until a primary symptom is picked', async () => {
    const wrapper = await mountForm()
    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="primary-symptom-select"]').setValue('headache')
    expect(submit.attributes('disabled')).toBeUndefined()
  })
})

describe('SymptomForm — additional info field', () => {
  it('is visible by default (no conditional rendering)', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="additional-info-input"]').exists()).toBe(true)
  })

  it('uses the bilingual additional-info label', async () => {
    const wrapper = await mountForm()
    expect(wrapper.text()).toContain(faMessages.symptom_form.additional_info_label)
  })

  it('accepts free-text input', async () => {
    const wrapper = await mountForm()
    const info = wrapper.find('[data-testid="additional-info-input"]')
    await info.setValue('علائم از دیشب شروع شده و با حرکت بدتر می‌شود')
    expect(info.element.value).toBe('علائم از دیشب شروع شده و با حرکت بدتر می‌شود')
  })

  it('does NOT block submit when left empty', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="primary-symptom-select"]').setValue('fever')
    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
  })
})

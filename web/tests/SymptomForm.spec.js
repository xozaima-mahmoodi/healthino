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

async function selectFiles(wrapper, files) {
  const input = wrapper.find('[data-testid="attachments-input"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
}

describe('SymptomForm — medical document upload', () => {
  it('renders a multi-file upload input that accepts images and PDFs', async () => {
    const wrapper = await mountForm()
    const input = wrapper.find('[data-testid="attachments-input"]')
    expect(input.exists()).toBe(true)
    expect(input.element.tagName).toBe('INPUT')
    expect(input.attributes('type')).toBe('file')
    expect(input.attributes('multiple')).toBeDefined()
    expect(input.attributes('accept')).toContain('image/')
    expect(input.attributes('accept')).toContain('application/pdf')
  })

  it('renders the bilingual upload label', async () => {
    const wrapper = await mountForm()
    expect(wrapper.text()).toContain(faMessages.symptom_form.attachments_label)
  })

  it('hides the preview gallery before any file is selected', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="attachments-preview"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="attachment-item"]')).toHaveLength(0)
  })

  it('shows an image thumbnail when an image file is selected', async () => {
    const wrapper = await mountForm()
    const file = new File(['fake-bytes'], 'scan.png', { type: 'image/png' })
    await selectFiles(wrapper, [file])

    const items = wrapper.findAll('[data-testid="attachment-item"]')
    expect(items).toHaveLength(1)
    expect(items[0].attributes('data-name')).toBe('scan.png')
    expect(items[0].find('[data-testid="attachment-thumbnail"]').exists()).toBe(true)
    expect(items[0].find('[data-testid="attachment-icon"]').exists()).toBe(false)
  })

  it('shows a generic icon (no <img>) for non-image files like PDFs', async () => {
    const wrapper = await mountForm()
    const pdf = new File(['%PDF-1.4'], 'lab-result.pdf', { type: 'application/pdf' })
    await selectFiles(wrapper, [pdf])

    const item = wrapper.find('[data-testid="attachment-item"]')
    expect(item.exists()).toBe(true)
    expect(item.find('[data-testid="attachment-thumbnail"]').exists()).toBe(false)
    expect(item.find('[data-testid="attachment-icon"]').exists()).toBe(true)
  })

  it('appends multiple files at once into the preview gallery', async () => {
    const wrapper = await mountForm()
    const files = [
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.pdf', { type: 'application/pdf' }),
      new File(['c'], 'three.jpg', { type: 'image/jpeg' })
    ]
    await selectFiles(wrapper, files)

    const items = wrapper.findAll('[data-testid="attachment-item"]')
    expect(items).toHaveLength(3)
    const names = items.map(i => i.attributes('data-name'))
    expect(names).toEqual(['one.png', 'two.pdf', 'three.jpg'])
  })

  it('removes a file when its remove button is clicked', async () => {
    const wrapper = await mountForm()
    const files = [
      new File(['a'], 'keep.png', { type: 'image/png' }),
      new File(['b'], 'drop.pdf', { type: 'application/pdf' })
    ]
    await selectFiles(wrapper, files)
    expect(wrapper.findAll('[data-testid="attachment-item"]')).toHaveLength(2)

    const dropItem = wrapper.findAll('[data-testid="attachment-item"]')
      .find(i => i.attributes('data-name') === 'drop.pdf')
    await dropItem.find('[data-testid="attachment-remove"]').trigger('click')

    const remaining = wrapper.findAll('[data-testid="attachment-item"]')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].attributes('data-name')).toBe('keep.png')
  })

  it('hides the preview gallery again once the last file is removed', async () => {
    const wrapper = await mountForm()
    await selectFiles(wrapper, [new File(['x'], 'only.png', { type: 'image/png' })])
    expect(wrapper.find('[data-testid="attachments-preview"]').exists()).toBe(true)

    await wrapper.find('[data-testid="attachment-remove"]').trigger('click')
    expect(wrapper.find('[data-testid="attachments-preview"]').exists()).toBe(false)
  })
})

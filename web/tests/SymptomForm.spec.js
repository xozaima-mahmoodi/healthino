import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import SymptomForm from '../src/components/SymptomForm.vue'
import faMessages from '../src/locales/fa.json'
import { useSymptomStore } from '../src/stores/symptom'
import { makeTestPlugins } from './helpers.js'

async function fillRequired(wrapper, { symptom = 'headache', area = 'head', hours = 3 } = {}) {
  await wrapper.find('[data-testid="primary-symptom-select"]').setValue(symptom)
  await wrapper.find('[data-testid="body-area-select"]').setValue(area)
  await wrapper.find('[data-testid="duration-input"]').setValue(hours)
}

const SAMPLE_RESULT = {
  red_flag: false,
  specialty: { id: 4, name: 'متخصص قلب و عروق' },
  doctors: [
    { id: 1, name: 'دکتر احمدی', experience_years: 12, rating: 4.7 },
    { id: 2, name: 'دکتر کریمی', experience_years: 8,  rating: 4.5 }
  ]
}

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

  it('marks the primary symptom label with a required asterisk', async () => {
    const wrapper = await mountForm()
    const wrap = wrapper.find('[data-testid="primary-symptom-select"]').element.parentElement
    expect(wrap.querySelector('label').textContent).toContain('*')
  })
})

describe('SymptomForm — body area select', () => {
  it('exposes the expanded body-area list (≥10 items, including new ones)', async () => {
    const wrapper = await mountForm()
    const select = wrapper.find('[data-testid="body-area-select"]')
    expect(select.exists()).toBe(true)
    expect(select.element.tagName).toBe('SELECT')

    const optionValues = select.findAll('option').slice(1).map(o => o.attributes('value'))
    expect(optionValues.length).toBeGreaterThanOrEqual(10)
    for (const expected of ['head', 'neurological', 'chest', 'abdomen', 'back_spine', 'pelvic', 'skin']) {
      expect(optionValues).toContain(expected)
    }
  })

  it('marks the body-area label with a required asterisk', async () => {
    const wrapper = await mountForm()
    const wrap = wrapper.find('[data-testid="body-area-select"]').element.parentElement
    expect(wrap.querySelector('label').textContent).toContain('*')
  })
})

describe('SymptomForm — severity (intensity) label', () => {
  it('uses "شدت درد" (pain intensity) instead of the older "شدت" wording', async () => {
    const wrapper = await mountForm()
    const wrap = wrapper.find('[data-testid="severity-input"]').element.parentElement
    expect(wrap.querySelector('label').textContent).toContain('شدت درد')
    expect(wrap.querySelector('label').textContent).toContain(faMessages.symptom_form.severity_label)
  })

  it('marks the severity label with a required asterisk', async () => {
    const wrapper = await mountForm()
    const wrap = wrapper.find('[data-testid="severity-input"]').element.parentElement
    expect(wrap.querySelector('label').textContent).toContain('*')
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

  it('does NOT carry a required-asterisk on its label', async () => {
    const wrapper = await mountForm()
    const wrap = wrapper.find('[data-testid="additional-info-input"]').element.parentElement
    expect(wrap.querySelector('label').textContent).not.toContain('*')
  })
})

describe('SymptomForm — required-field validation', () => {
  it('blocks submission and surfaces an error per missing required field', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await wrapper.find('form').trigger('submit')

    expect(analyzeSpy).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="error-symptom"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-body-area"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-duration"]').exists()).toBe(true)

    expect(wrapper.find('[data-testid="error-symptom"]').text())
      .toContain(faMessages.symptom_form.validation.symptom_required)
  })

  it('clears each error as soon as the user fills the corresponding field', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockResolvedValue()

    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[data-testid="error-symptom"]').exists()).toBe(true)

    await wrapper.find('[data-testid="primary-symptom-select"]').setValue('cough')
    expect(wrapper.find('[data-testid="error-symptom"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-body-area"]').exists()).toBe(true)

    await wrapper.find('[data-testid="body-area-select"]').setValue('chest')
    expect(wrapper.find('[data-testid="error-body-area"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-duration"]').exists()).toBe(true)

    await wrapper.find('[data-testid="duration-input"]').setValue(2)
    expect(wrapper.find('[data-testid="error-duration"]').exists()).toBe(false)
  })

  it('treats Additional Info and Attachments as optional (no error when empty)', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')

    expect(analyzeSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="error-symptom"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-body-area"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-duration"]').exists()).toBe(false)

    const payload = analyzeSpy.mock.calls[0][0]
    expect(payload.body_area).toBe('head')
    expect(payload.duration_hours).toBe(3)
    expect(payload.symptoms).toEqual([faMessages.symptoms.headache])
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

describe('SymptomForm — post-submission result view', () => {
  it('shows the form card and hides the result card on initial mount', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="form-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="result-card"]').exists()).toBe(false)
  })

  it('hides the form and shows the result card once the store has a result', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = SAMPLE_RESULT
    await nextTick()

    expect(wrapper.find('[data-testid="form-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="primary-symptom-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="result-card"]').exists()).toBe(true)
  })

  it('renders the AI feedback (specialty + recommended doctors) inside the result card', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = SAMPLE_RESULT
    await nextTick()

    const card = wrapper.find('[data-testid="result-card"]')
    expect(card.text()).toContain(faMessages.symptom_form.result_title)
    expect(card.find('[data-testid="result-specialty"]').text()).toContain('متخصص قلب و عروق')
    const docs = card.findAll('[data-testid="result-doctor"]')
    expect(docs).toHaveLength(2)
    expect(docs[0].text()).toContain('دکتر احمدی')
    expect(docs[1].text()).toContain('دکتر کریمی')
  })

  it('renders a "New Assessment" button on the result card', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = SAMPLE_RESULT
    await nextTick()

    const btn = wrapper.find('[data-testid="new-assessment-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe(faMessages.symptom_form.new_assessment)
  })

  it('clears the result and brings back an empty form when "New Assessment" is clicked', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    // Fill the form so we can prove it's been reset on the way back.
    await wrapper.find('[data-testid="primary-symptom-select"]').setValue('headache')
    await wrapper.find('[data-testid="additional-info-input"]').setValue('شب‌ها بدتر می‌شود')
    await selectFiles(wrapper, [new File(['x'], 'lab.pdf', { type: 'application/pdf' })])
    expect(wrapper.findAll('[data-testid="attachment-item"]')).toHaveLength(1)

    store.result = SAMPLE_RESULT
    await nextTick()

    await wrapper.find('[data-testid="new-assessment-button"]').trigger('click')
    await nextTick()

    expect(store.result).toBeNull()
    expect(wrapper.find('[data-testid="result-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="form-card"]').exists()).toBe(true)

    expect(wrapper.find('[data-testid="primary-symptom-select"]').element.value).toBe('')
    expect(wrapper.find('[data-testid="additional-info-input"]').element.value).toBe('')
    expect(wrapper.findAll('[data-testid="attachment-item"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="attachments-preview"]').exists()).toBe(false)

    expect(wrapper.find('[data-testid="error-symptom"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-body-area"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-duration"]').exists()).toBe(false)
  })

  it('renders the red-flag warning when the result indicates one', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = { ...SAMPLE_RESULT, red_flag: true }
    await nextTick()

    expect(wrapper.find('[data-testid="result-red-flag"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="result-red-flag"]').text())
      .toContain(faMessages.symptom_form.red_flag_warning)
  })
})

describe('SymptomForm — first aid section', () => {
  it('renders the First Aid section with the bilingual title in the result card', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = SAMPLE_RESULT
    await nextTick()

    const section = wrapper.find('[data-testid="result-first-aid"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain(faMessages.symptom_form.first_aid.title)
  })

  it('renders the API-provided first-aid items when present', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = {
      ...SAMPLE_RESULT,
      first_aid: ['ابتدا یخ بگذارید', 'دارو بدون تجویز نخورید', 'در صورت تشدید به اورژانس بروید']
    }
    await nextTick()

    const items = wrapper.findAll('[data-testid="first-aid-item"]')
    expect(items).toHaveLength(3)
    expect(items[0].text()).toBe('ابتدا یخ بگذارید')
    expect(items[2].text()).toContain('اورژانس')
  })

  it('falls back to localized default tips when first_aid is missing', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.result = SAMPLE_RESULT
    await nextTick()

    const items = wrapper.findAll('[data-testid="first-aid-item"]')
    expect(items.length).toBeGreaterThan(0)
    const text = items.map(i => i.text()).join(' ')
    expect(text).toContain(faMessages.symptom_form.first_aid.default_1)
  })
})

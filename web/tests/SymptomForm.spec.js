import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import SymptomForm from '../src/components/SymptomForm.vue'
import faMessages from '../src/locales/fa.json'
import { useSymptomStore } from '../src/stores/symptom'
import { api } from '../src/api/client'
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

async function mountForm(options = {}) {
  const { plugins } = await makeTestPlugins()
  return mount(SymptomForm, { global: { plugins }, ...options })
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

describe('SymptomForm — analyze-documents button loading state', () => {
  const imageFile = () => new File(['bytes'], 'lab.png', { type: 'image/png' })

  // `api` is a module singleton, so a spy on api.post survives across tests and
  // would accumulate call counts. Restore after each test for isolation.
  afterEach(() => { vi.restoreAllMocks() })

  it('disables the button and swaps in the spinner while analysis is in flight', async () => {
    const wrapper = await mountForm()
    await selectFiles(wrapper, [imageFile()])

    // Hold the request open so we can observe the in-flight state.
    let resolvePost
    const postSpy = vi
      .spyOn(api, 'post')
      .mockImplementation(() => new Promise((resolve) => { resolvePost = resolve }))

    const btn = wrapper.find('[data-testid="analyze-documents-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="analyze-documents-spinner"]').exists()).toBe(false)

    await btn.trigger('click')
    await nextTick()

    // In flight: request fired once, button disabled, spinner shown.
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/assessments/analyze_document',
      expect.anything(),
      expect.anything()
    )
    expect(btn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="analyze-documents-spinner"]').exists()).toBe(true)

    // Resolve → state clears: re-enabled, spinner gone.
    resolvePost({ data: { summary: 'خلاصه', questions: ['q1', 'q2', 'q3'] } })
    await flushPromises()

    expect(btn.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="analyze-documents-spinner"]').exists()).toBe(false)
  })

  it('re-enables the button and hides the spinner when the request fails', async () => {
    const wrapper = await mountForm()
    await selectFiles(wrapper, [imageFile()])

    let rejectPost
    vi.spyOn(api, 'post')
      .mockImplementation(() => new Promise((_, reject) => { rejectPost = reject }))

    const btn = wrapper.find('[data-testid="analyze-documents-button"]')
    await btn.trigger('click')
    await nextTick()
    expect(btn.attributes('disabled')).toBeDefined()

    rejectPost(new Error('network down'))
    await flushPromises()

    expect(btn.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="analyze-documents-spinner"]').exists()).toBe(false)
  })

  it('ignores repeated clicks while a request is already in flight (no double-trigger)', async () => {
    const wrapper = await mountForm()
    await selectFiles(wrapper, [imageFile()])

    const postSpy = vi
      .spyOn(api, 'post')
      .mockImplementation(() => new Promise(() => {})) // never settles

    const btn = wrapper.find('[data-testid="analyze-documents-button"]')
    await btn.trigger('click')
    await nextTick()
    await btn.trigger('click')
    await btn.trigger('click')
    await nextTick()

    expect(postSpy).toHaveBeenCalledTimes(1)
  })
})

// Drives a full document analysis with a canned API payload, so the badge /
// medical-term rendering can be asserted on real component state.
async function analyzeWith(wrapper, data) {
  await selectFiles(wrapper, [new File(['bytes'], 'lab.png', { type: 'image/png' })])
  vi.spyOn(api, 'post').mockResolvedValue({ data })
  await wrapper.find('[data-testid="analyze-documents-button"]').trigger('click')
  await flushPromises()
}

describe('SymptomForm — vital badges', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const BADGES = [
    { label: 'Hemoglobin', value: '9.1 g/dL', status: 'warning', icon: '🩸' },
    { label: 'Blood pressure', value: '180/110', status: 'critical' },
    { label: 'Fasting glucose', value: '92 mg/dL', status: 'normal' }
  ]

  it('renders nothing when the analysis carries no vital badges', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', questions: [] })
    expect(wrapper.find('[data-testid="vital-badges"]').exists()).toBe(false)
  })

  it('renders one card per badge with its label, value and status attribute', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', vital_badges: BADGES })

    const section = wrapper.find('[data-testid="vital-badges"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain(faMessages.symptom_form.vital_badges_title)

    const cards = wrapper.findAll('[data-testid="vital-badge"]')
    expect(cards).toHaveLength(3)
    expect(cards.map(c => c.attributes('data-status'))).toEqual(['warning', 'critical', 'normal'])
    expect(cards[0].text()).toContain('Hemoglobin')
    expect(cards[0].text()).toContain('9.1 g/dL')
  })

  it('lays the cards out one per row on mobile and two per row from sm up', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', vital_badges: BADGES })

    const grid = wrapper.find('[data-testid="vital-badge"]').element.parentElement
    expect(grid.className).toContain('grid')
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('sm:grid-cols-2')
    // A third column inside the max-w-2xl form column would clip long names.
    expect(grid.className).not.toContain('grid-cols-3')
  })

  it('wraps long indicator names instead of truncating them', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, {
      summary: 'خلاصه',
      vital_badges: [
        { label: 'خطر سندروم متابولیک', value: '۱ به ۳ برابر میانگین', status: 'warning' }
      ]
    })

    const card = wrapper.find('[data-testid="vital-badge"]')
    // Nothing inside the card may clip its text.
    expect(card.html()).not.toContain('truncate')
    expect(card.html()).not.toContain('text-ellipsis')

    // The full strings survive, and the label is free to run onto a second line.
    expect(card.text()).toContain('خطر سندروم متابولیک')
    expect(card.text()).toContain('۱ به ۳ برابر میانگین')
    const label = card.findAll('span').find(s => s.text() === 'خطر سندروم متابولیک')
    expect(label.classes()).toContain('break-words')
    expect(label.classes()).not.toContain('whitespace-nowrap')
  })

  it('scales the value type down as the value string grows', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, {
      summary: 'خلاصه',
      vital_badges: [
        { label: 'قند خون', value: '۹۲', status: 'normal' },
        { label: 'فشار خون', value: '۱۸۰/۱۱۰ mmHg', status: 'critical' },
        { label: 'خطر سندروم متابولیک', value: '۱ به ۳ برابر میانگین جمعیت', status: 'warning' }
      ]
    })

    const values = wrapper.findAll('[data-testid="vital-badge"]')
      .map(c => c.findAll('span').find(s => s.classes().includes('tabular-nums')))

    expect(values[0].classes()).toContain('text-[15px]')   // short
    expect(values[1].classes()).toContain('text-[13px]')   // medium
    expect(values[2].classes()).toContain('text-xs')       // long
  })

  it('keeps the status pill on one line and lets it wrap below a long value', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', vital_badges: BADGES })

    const pill = wrapper.find('[data-testid="vital-badge-status"]')
    expect(pill.classes()).toContain('whitespace-nowrap')
    expect(pill.classes()).toContain('shrink-0')
    // Its row wraps, so the pill never squeezes the value out of the card.
    expect(pill.element.parentElement.className).toContain('flex-wrap')
  })

  it('colour-codes emerald / amber / rose and names the status in words', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', vital_badges: BADGES })

    const byStatus = {}
    for (const card of wrapper.findAll('[data-testid="vital-badge"]')) {
      byStatus[card.attributes('data-status')] = card
    }

    expect(byStatus.normal.classes().join(' ')).toContain('emerald')
    expect(byStatus.warning.classes().join(' ')).toContain('amber')
    expect(byStatus.critical.classes().join(' ')).toContain('rose')

    expect(byStatus.normal.find('[data-testid="vital-badge-status"]').text())
      .toBe(faMessages.symptom_form.vital_status_normal)
    expect(byStatus.warning.find('[data-testid="vital-badge-status"]').text())
      .toBe(faMessages.symptom_form.vital_status_warning)
    expect(byStatus.critical.find('[data-testid="vital-badge-status"]').text())
      .toBe(faMessages.symptom_form.vital_status_critical)
  })

  it('pairs every status with dark-mode variants so the tint survives theme switches', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', vital_badges: BADGES })

    for (const card of wrapper.findAll('[data-testid="vital-badge"]')) {
      expect(card.classes().some(c => c.startsWith('dark:bg-'))).toBe(true)
      expect(card.classes().some(c => c.startsWith('dark:border-'))).toBe(true)
    }
  })

  it('falls back to a status icon when the AI sends no emoji', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'خلاصه', vital_badges: BADGES })

    const cards = wrapper.findAll('[data-testid="vital-badge"]')
    // Badge 0 carries 🩸 → no SVG; badges 1 and 2 have none → SVG fallback.
    expect(cards[0].find('[data-testid="vital-badge-icon"]').exists()).toBe(false)
    expect(cards[0].text()).toContain('🩸')
    expect(cards[1].find('[data-testid="vital-badge-icon"]').exists()).toBe(true)
    expect(cards[2].find('[data-testid="vital-badge-icon"]').exists()).toBe(true)
  })

  it('clamps an unrecognised status to normal rather than rendering an unstyled card', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, {
      summary: 'خلاصه',
      vital_badges: [{ label: 'Ferritin', value: '11 ng/mL', status: 'exploded' }]
    })

    const card = wrapper.find('[data-testid="vital-badge"]')
    expect(card.attributes('data-status')).toBe('normal')
    expect(card.classes().join(' ')).toContain('emerald')
  })
})

describe('SymptomForm — medical terminology decoder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // Teleported popovers live in <body>; clear any leftovers between tests.
    document.body.querySelectorAll('[data-testid="medical-term-tooltip"]').forEach(n => n.remove())
  })

  const PAYLOAD = {
    summary: 'The report shows anemia and mild tachycardia.',
    medical_terms: [
      { term: 'anemia', definition: 'A low red blood cell count.' },
      { term: 'tachycardia', definition: 'A faster than normal heart rate.' }
    ]
  }

  const tooltip = () => document.body.querySelector('[data-testid="medical-term-tooltip"]')

  // Anchors a term at a chosen viewport position so placement/clamping is testable
  // in a headless DOM, where every rect is otherwise 0×0.
  function stubRect(el, { left, top, width = 60, height = 18 }) {
    el.getBoundingClientRect = () => ({
      left, top, width, height, right: left + width, bottom: top + height, x: left, y: top
    })
  }

  function setViewport(width, height) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
  }

  it('turns matched terms into interactive chips and leaves the prose untouched', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)

    const terms = wrapper.findAll('[data-testid="medical-term"]')
    expect(terms.map(t => t.text())).toEqual(['anemia', 'tachycardia'])
    expect(wrapper.find('[data-testid="document-summary"]').text())
      .toContain('The report shows anemia and mild tachycardia.')
  })

  it('signals interactivity with a soft highlight, a dashed bottom border and a help cursor', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)

    const classes = wrapper.find('[data-testid="medical-term"]').classes()
    expect(classes).toContain('border-b-[1.5px]')
    expect(classes).toContain('border-dashed')
    expect(classes).toContain('cursor-help')
    expect(classes).toContain('bg-teal-500/[0.08]')
    expect(classes).toContain('dark:bg-teal-400/[0.10]')
    // Hover deepens the highlight and firms the border into a solid line.
    expect(classes).toContain('hover:bg-teal-500/[0.16]')
    expect(classes).toContain('hover:border-solid')
  })

  it('carries a trailing info glyph as a second interactivity cue', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)

    const term = wrapper.findAll('[data-testid="medical-term"]')[0]
    const icon = term.find('[data-testid="medical-term-info"]')
    expect(icon.exists()).toBe(true)
    // Decorative only — the definition is already announced via aria-describedby.
    expect(icon.attributes('aria-hidden')).toBe('true')
    // It brightens with the chip rather than on its own.
    expect(icon.classes()).toContain('group-hover/term:opacity-100')
    expect(term.classes()).toContain('group/term')
    // Chips still read as just their term (the glyph contributes no text).
    expect(term.text()).toBe('anemia')
  })

  it('switches the chip to a solid border and stronger tint while its definition is open', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    expect(term.classes()).toContain('bg-teal-500/[0.08]')
    expect(term.classes()).not.toContain('border-solid')

    await term.trigger('click')

    expect(term.classes()).toContain('bg-teal-500/20')
    expect(term.classes()).toContain('border-solid')

    wrapper.unmount()
  })

  it('opens a popover with the term and its definition on tap, and closes on a second tap', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    expect(tooltip()).toBeNull()
    expect(term.attributes('aria-expanded')).toBe('false')

    await term.trigger('click')
    expect(tooltip()).not.toBeNull()
    expect(tooltip().textContent).toContain('anemia')
    expect(tooltip().textContent).toContain('A low red blood cell count.')
    expect(term.attributes('aria-expanded')).toBe('true')
    // The chip points at the popover for screen readers only while it is open.
    expect(term.attributes('aria-describedby')).toBe(tooltip().id)

    await term.trigger('click')
    expect(tooltip()).toBeNull()
    expect(term.attributes('aria-describedby')).toBeUndefined()

    wrapper.unmount()
  })

  it('keeps only one definition open at a time', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const terms = wrapper.findAll('[data-testid="medical-term"]')

    await terms[0].trigger('click')
    await terms[1].trigger('click')

    expect(document.body.querySelectorAll('[data-testid="medical-term-tooltip"]')).toHaveLength(1)
    expect(tooltip().textContent).toContain('tachycardia')

    wrapper.unmount()
  })

  it('ignores hover from a touch pointer so a tap does not open-then-close', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    await term.trigger('pointerenter', { pointerType: 'touch' })
    expect(tooltip()).toBeNull()

    // The tap's click still opens it, and a stray touch pointerleave must not
    // yank it away mid-read.
    await term.trigger('click')
    expect(tooltip()).not.toBeNull()
    await term.trigger('pointerleave', { pointerType: 'touch' })
    expect(tooltip()).not.toBeNull()

    wrapper.unmount()
  })

  it('opens and closes on mouse hover', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    await term.trigger('pointerenter', { pointerType: 'mouse' })
    expect(tooltip()).not.toBeNull()

    await term.trigger('pointerleave', { pointerType: 'mouse' })
    expect(tooltip()).toBeNull()

    wrapper.unmount()
  })

  it('clamps the popover inside the viewport for a term hugging the screen edge', async () => {
    setViewport(375, 700)
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    // Term pinned to the right edge: centring it would push the bubble off-screen.
    stubRect(term.element, { left: 330, top: 400, width: 40 })
    await term.trigger('click')

    const style = tooltip().style
    const left = parseFloat(style.left)
    const width = parseFloat(style.width)
    expect(width).toBe(288)
    expect(left).toBeGreaterThanOrEqual(12)
    expect(left + width).toBeLessThanOrEqual(375 - 12)
    // The arrow follows the term even though the bubble was pushed left.
    const arrowLeft = parseFloat(tooltip().querySelector('span[aria-hidden="true"]').style.left)
    expect(arrowLeft).toBeGreaterThan(width / 2)

    wrapper.unmount()
  })

  it('narrows the popover to fit a viewport thinner than its natural width', async () => {
    setViewport(280, 640)
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    stubRect(term.element, { left: 8, top: 300, width: 40 })
    await term.trigger('click')

    expect(parseFloat(tooltip().style.width)).toBe(280 - 24)
    expect(parseFloat(tooltip().style.left)).toBe(12)

    wrapper.unmount()
  })

  it('anchors above the term by default and flips below when there is no room', async () => {
    setViewport(1280, 800)
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    stubRect(term.element, { left: 500, top: 500 })
    await term.trigger('click')
    expect(tooltip().getAttribute('data-placement')).toBe('top')
    expect(tooltip().style.bottom).not.toBe('')
    expect(tooltip().style.top).toBe('')

    // Same term near the top of the viewport → flip under it.
    await term.trigger('click')
    stubRect(term.element, { left: 500, top: 24 })
    await term.trigger('click')
    expect(tooltip().getAttribute('data-placement')).toBe('bottom')
    expect(tooltip().style.top).toBe('52px')   // rect.bottom (24 + 18) + 10 offset
    expect(tooltip().style.bottom).toBe('')

    wrapper.unmount()
  })

  it('re-anchors the popover when the page scrolls under it', async () => {
    setViewport(1280, 800)
    // Attached to the document so the open term stays `isConnected` — the
    // re-anchor path gives up (and closes) on a detached trigger.
    const wrapper = await mountForm({ attachTo: document.body })
    await analyzeWith(wrapper, PAYLOAD)
    const term = wrapper.findAll('[data-testid="medical-term"]')[0]

    stubRect(term.element, { left: 500, top: 500 })
    await term.trigger('click')
    const before = tooltip().style.bottom

    stubRect(term.element, { left: 500, top: 320 })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(tooltip().style.bottom).not.toBe(before)

    wrapper.unmount()
  })

  it('closes the popover on Escape', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    await wrapper.findAll('[data-testid="medical-term"]')[0].trigger('click')
    expect(tooltip()).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(tooltip()).toBeNull()

    wrapper.unmount()
  })

  it('closes the popover when the user taps elsewhere on the page', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, PAYLOAD)
    await wrapper.findAll('[data-testid="medical-term"]')[0].trigger('click')
    expect(tooltip()).not.toBeNull()

    document.body.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()
    expect(tooltip()).toBeNull()

    wrapper.unmount()
  })

  it('renders the summary verbatim with no chips when the AI sends no terms', async () => {
    const wrapper = await mountForm()
    await analyzeWith(wrapper, { summary: 'A plain summary with no jargon.' })

    expect(wrapper.findAll('[data-testid="medical-term"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="document-summary"]').text())
      .toContain('A plain summary with no jargon.')
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

describe('SymptomForm — demographic fields (gender + age)', () => {
  it('renders a gender <select> with only male and female options', async () => {
    const wrapper = await mountForm()
    const select = wrapper.find('[data-testid="gender-select"]')
    expect(select.exists()).toBe(true)
    expect(select.element.tagName).toBe('SELECT')

    const values = select.findAll('option').map(o => o.attributes('value'))
    expect(values).toContain('male')
    expect(values).toContain('female')
    expect(values).not.toContain('other')
  })

  it('renders a numeric age input', async () => {
    const wrapper = await mountForm()
    const age = wrapper.find('[data-testid="age-input"]')
    expect(age.exists()).toBe(true)
    expect(age.attributes('type')).toBe('number')
  })

  it('does not block submission when gender and age are blank (they are optional)', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')

    expect(analyzeSpy).toHaveBeenCalledTimes(1)
    const payload = analyzeSpy.mock.calls[0][0]
    expect(payload.gender).toBeNull()
    expect(payload.age).toBeNull()
  })

  it('forwards gender and age in the submission payload when provided', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="gender-select"]').setValue('female')
    await wrapper.find('[data-testid="age-input"]').setValue(34)
    await wrapper.find('form').trigger('submit')

    const payload = analyzeSpy.mock.calls[0][0]
    expect(payload.gender).toBe('female')
    expect(payload.age).toBe(34)
  })
})

describe('SymptomForm — medical history toggle', () => {
  it('hides the details input by default (when toggle is off)', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="medical-history-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="medical-history-details-wrap"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="medical-history-details-input"]').exists()).toBe(false)
  })

  it('reveals the details input the moment the toggle flips on', async () => {
    const wrapper = await mountForm()
    await wrapper.find('[data-testid="medical-history-toggle"]').setValue(true)
    expect(wrapper.find('[data-testid="medical-history-details-wrap"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="medical-history-details-input"]').exists()).toBe(true)
  })

  it('hides the details input again when the toggle flips off', async () => {
    const wrapper = await mountForm()
    const toggle = wrapper.find('[data-testid="medical-history-toggle"]')
    await toggle.setValue(true)
    expect(wrapper.find('[data-testid="medical-history-details-input"]').exists()).toBe(true)

    await toggle.setValue(false)
    expect(wrapper.find('[data-testid="medical-history-details-input"]').exists()).toBe(false)
  })

  it('blocks submission and surfaces an error when the toggle is on but details are blank', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="medical-history-toggle"]').setValue(true)
    await wrapper.find('form').trigger('submit')

    expect(analyzeSpy).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="error-medical-history-details"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-medical-history-details"]').text())
      .toContain(faMessages.symptom_form.validation.medical_history_details_required)
  })

  it('clears the error once the user fills the details field', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="medical-history-toggle"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[data-testid="error-medical-history-details"]').exists()).toBe(true)

    await wrapper.find('[data-testid="medical-history-details-input"]').setValue('Diabetes')
    expect(wrapper.find('[data-testid="error-medical-history-details"]').exists()).toBe(false)
  })

  it('forwards medical_history flag and details in the payload', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="medical-history-toggle"]').setValue(true)
    await wrapper.find('[data-testid="medical-history-details-input"]').setValue('Diabetes')
    await wrapper.find('form').trigger('submit')

    const payload = analyzeSpy.mock.calls[0][0]
    expect(payload.medical_history).toBe(true)
    expect(payload.medical_history_details).toBe('Diabetes')
  })

  it('sends medical_history=false and a null details field when toggle is off', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')

    const payload = analyzeSpy.mock.calls[0][0]
    expect(payload.medical_history).toBe(false)
    expect(payload.medical_history_details).toBeNull()
  })
})

describe('SymptomForm — current medication toggle', () => {
  it('hides the medication details input by default', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="medication-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="medication-details-input"]').exists()).toBe(false)
  })

  it('reveals the details input when the toggle is on, hides it when off', async () => {
    const wrapper = await mountForm()
    const toggle = wrapper.find('[data-testid="medication-toggle"]')

    await toggle.setValue(true)
    expect(wrapper.find('[data-testid="medication-details-input"]').exists()).toBe(true)

    await toggle.setValue(false)
    expect(wrapper.find('[data-testid="medication-details-input"]').exists()).toBe(false)
  })

  it('blocks submission and surfaces an error when toggle is on but details are blank', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="medication-toggle"]').setValue(true)
    await wrapper.find('form').trigger('submit')

    expect(analyzeSpy).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="error-medication-details"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-medication-details"]').text())
      .toContain(faMessages.symptom_form.validation.medication_details_required)
  })

  it('clears the error once the user enters a medication name', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="medication-toggle"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[data-testid="error-medication-details"]').exists()).toBe(true)

    await wrapper.find('[data-testid="medication-details-input"]').setValue('Aspirin')
    expect(wrapper.find('[data-testid="error-medication-details"]').exists()).toBe(false)
  })

  it('forwards medication flag and details in the payload', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue()

    await fillRequired(wrapper)
    await wrapper.find('[data-testid="medication-toggle"]').setValue(true)
    await wrapper.find('[data-testid="medication-details-input"]').setValue('Aspirin')
    await wrapper.find('form').trigger('submit')

    const payload = analyzeSpy.mock.calls[0][0]
    expect(payload.medication).toBe(true)
    expect(payload.medication_details).toBe('Aspirin')
  })
})

describe('SymptomForm — stuck-loading and error recovery', () => {
  it('shows the analyzing state while analyze() is in flight (no result, no error)', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    let resolveLater
    vi.spyOn(store, 'analyze').mockImplementation(() => {
      store.submitting = true
      return new Promise((resolve) => { resolveLater = resolve })
    })

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    expect(submit.text()).toBe(faMessages.symptom_form.analyzing)
    expect(wrapper.find('[data-testid="form-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="result-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="submit-error"]').exists()).toBe(false)

    store.submitting = false
    resolveLater?.()
    await nextTick()
  })

  it('recovers (button re-enables, form stays visible) when analyze() rejects with a network error', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockImplementation(async () => {
      store.submitting = true
      try {
        store.error = { message: 'Network Error' }
      } finally {
        store.submitting = false
      }
    })

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(submit.text()).toBe(faMessages.symptom_form.submit)
    expect(wrapper.find('[data-testid="form-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="result-card"]').exists()).toBe(false)

    const banner = wrapper.find('[data-testid="submit-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Network Error')
  })

  it('surfaces Rails 422 field-level error messages in the banner', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockImplementation(async () => {
      store.submitting = true
      try {
        store.error = { errors: { symptoms: ["can't be blank"], severity: ['must be 1..10'] } }
      } finally {
        store.submitting = false
      }
    })

    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const banner = wrapper.find('[data-testid="submit-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain("can't be blank")
    expect(banner.text()).toContain('must be 1..10')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('does NOT reset the form when analyze() errors out (so the user can fix and retry without re-typing)', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    vi.spyOn(store, 'analyze').mockImplementation(async () => {
      store.submitting = true
      try {
        store.error = { message: 'boom' }
      } finally {
        store.submitting = false
      }
    })

    await fillRequired(wrapper, { symptom: 'fever', area: 'chest', hours: 8 })
    await wrapper.find('[data-testid="additional-info-input"]').setValue('keep me')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(wrapper.find('[data-testid="primary-symptom-select"]').element.value).toBe('fever')
    expect(wrapper.find('[data-testid="body-area-select"]').element.value).toBe('chest')
    expect(wrapper.find('[data-testid="duration-input"]').element.value).toBe('8')
    expect(wrapper.find('[data-testid="additional-info-input"]').element.value).toBe('keep me')
  })

  it('clears submitting state and error on store.reset() (defends against stale loading on remount)', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()

    store.submitting = true
    store.error = { message: 'old' }
    await nextTick()

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="submit-error"]').exists()).toBe(true)

    store.reset()
    await nextTick()

    expect(store.submitting).toBe(false)
    expect(store.error).toBeNull()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="submit-error"]').exists()).toBe(false)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {}))
  }
}))

import HistoryView from '../src/views/HistoryView.vue'
import faMessages from '../src/locales/fa.json'
import { useHistoryStore } from '../src/stores/history'
import { useAuthStore } from '../src/stores/auth'
import { makeTestPlugins } from './helpers.js'

const SAMPLE_ITEMS = [
  {
    id: 11,
    primary_symptom: 'fever',
    additional_info: 'شب‌ها بدتر می‌شود',
    body_area: 'chest',
    intensity: 7,
    duration_hours: 12,
    result: { specialty: { slug: 'general', name: 'پزشک عمومی' } },
    created_at: '2026-04-26T10:30:00Z'
  },
  {
    id: 12,
    primary_symptom: 'headache',
    additional_info: null,
    body_area: 'head',
    intensity: 4,
    duration_hours: 3,
    result: { specialty: { slug: 'neurology', name: 'مغز و اعصاب' } },
    created_at: '2026-04-20T08:15:00Z'
  }
]

async function mountHistory({ authed = true } = {}) {
  const { plugins } = await makeTestPlugins({ path: '/history' })
  const auth = useAuthStore()
  if (authed) auth.setToken('test-token-abc123')
  else auth.clear()
  const wrapper = mount(HistoryView, { global: { plugins } })
  return wrapper
}

function seedItems(items) {
  const store = useHistoryStore()
  store.loading = false
  store.error = null
  store.items = items
  return store
}

describe('HistoryView — gating', () => {
  it('shows a sign-in-required message when no auth token is set', async () => {
    const wrapper = await mountHistory({ authed: false })
    await nextTick()

    expect(wrapper.find('[data-testid="history-needs-auth"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="history-timeline"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(faMessages.history.sign_in_required)
  })
})

describe('HistoryView — empty state', () => {
  it('shows the empty state when the store has no items', async () => {
    const wrapper = await mountHistory()
    const store = useHistoryStore()
    store.loading = false
    store.items = []
    await nextTick()

    expect(wrapper.find('[data-testid="history-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(faMessages.history.empty)
    expect(wrapper.find('[data-testid="history-timeline"]').exists()).toBe(false)
  })
})

describe('HistoryView — timeline rendering', () => {
  it('renders one timeline card per assessment, in store order', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const items = wrapper.findAll('[data-testid="history-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].attributes('data-id')).toBe('11')
    expect(items[1].attributes('data-id')).toBe('12')
  })

  it('localizes the primary symptom slug into the active locale (fa)', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const symptoms = wrapper.findAll('[data-testid="history-item-symptom"]')
    expect(symptoms[0].text()).toBe(faMessages.symptoms.fever)
    expect(symptoms[1].text()).toBe(faMessages.symptoms.headache)
  })

  it('shows the intensity badge with the value out of 10', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const badges = wrapper.findAll('[data-testid="history-item-intensity"]')
    expect(badges[0].text()).toContain('7/10')
    expect(badges[1].text()).toContain('4/10')
  })

  it('renders additional notes only when present', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const items = wrapper.findAll('[data-testid="history-item"]')
    expect(items[0].find('[data-testid="history-item-notes"]').exists()).toBe(true)
    expect(items[0].find('[data-testid="history-item-notes"]').text()).toContain('شب‌ها بدتر می‌شود')
    expect(items[1].find('[data-testid="history-item-notes"]').exists()).toBe(false)
  })

  it('shows the recommended specialty from result.specialty.name', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const specialties = wrapper.findAll('[data-testid="history-item-specialty"]')
    expect(specialties).toHaveLength(2)
    expect(specialties[0].text()).toContain('پزشک عمومی')
    expect(specialties[1].text()).toContain('مغز و اعصاب')
  })

  it('uses glassmorphism cards (premium styling) for each timeline entry', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const card = wrapper.find('[data-testid="history-item"] article')
    const cls = card.classes()
    expect(cls).toContain('rounded-2xl')
    // Mobile-first: lighter blur + more opaque on small screens, full glass on sm+.
    expect(cls).toContain('bg-white/90')
    expect(cls).toContain('backdrop-blur-md')
    expect(cls).toContain('sm:bg-white/80')
    expect(cls).toContain('sm:dark:bg-slate-800/40')
    expect(cls).toContain('sm:backdrop-blur-xl')
    expect(cls).toContain('shadow-glass')
  })

  it('renders the vertical-rail container with the timeline cards inside it', async () => {
    const wrapper = await mountHistory()
    seedItems(SAMPLE_ITEMS)
    await nextTick()

    const timeline = wrapper.find('[data-testid="history-timeline"]')
    expect(timeline.exists()).toBe(true)
    expect(timeline.element.tagName).toBe('OL')
    expect(timeline.findAll('[data-testid="history-item"]')).toHaveLength(2)
  })
})

describe('HistoryView — error state', () => {
  it('shows the error block when the store reports a load error', async () => {
    const wrapper = await mountHistory()
    const store = useHistoryStore()
    store.loading = false
    store.error = { status: 500, message: 'boom' }
    store.items = []
    await nextTick()

    expect(wrapper.find('[data-testid="history-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="history-empty"]').exists()).toBe(false)
  })
})

describe('HistoryView — doctor banner', () => {
  it('shows the "viewing as doctor" banner when viewing_as is "doctor"', async () => {
    const wrapper = await mountHistory()
    const store = useHistoryStore()
    store.items = SAMPLE_ITEMS
    store.patient = { id: 42, name: 'بیمار آزمایشی' }
    store.viewingAs = 'doctor'
    await nextTick()

    const banner = wrapper.find('[data-testid="history-doctor-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('بیمار آزمایشی')
  })

  it('does NOT show the doctor banner when viewing_as is "self"', async () => {
    const wrapper = await mountHistory()
    const store = useHistoryStore()
    store.items = SAMPLE_ITEMS
    store.patient = { id: 1, name: 'self' }
    store.viewingAs = 'self'
    await nextTick()

    expect(wrapper.find('[data-testid="history-doctor-banner"]').exists()).toBe(false)
  })
})

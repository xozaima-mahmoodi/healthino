/**
 * 375 px (iPhone SE) sanity checks.
 *
 * happy-dom doesn't run a real layout engine, so we can't measure pixel widths.
 * What we *can* do is assert two things at this width:
 *   1. Mobile-first Tailwind classes are present on the elements that have to
 *      stay tappable (no `hidden` blocking the home link, file zone tall enough,
 *      severity slider has the touch helper, primary CTAs are full-width).
 *   2. Click handlers fire on those elements (i.e. they're not visually buried
 *      under a sibling that would intercept the tap).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../src/api/client', () => ({
  api: {
    get:   vi.fn(() => new Promise(() => {})),
    post:  vi.fn(() => new Promise(() => {})),
    patch: vi.fn(() => new Promise(() => {}))
  }
}))

import GlobalHeader from '../src/components/GlobalHeader.vue'
import SymptomForm from '../src/components/SymptomForm.vue'
import UserProfile from '../src/views/UserProfile.vue'
import HistoryView from '../src/views/HistoryView.vue'
import { useAuthStore } from '../src/stores/auth'
import { useSymptomStore } from '../src/stores/symptom'
import { useHistoryStore } from '../src/stores/history'
import { makeTestPlugins } from './helpers.js'

const IPHONE_SE_WIDTH = 375

let originalInnerWidth
let originalInnerHeight

beforeAll(() => {
  originalInnerWidth  = window.innerWidth
  originalInnerHeight = window.innerHeight
  Object.defineProperty(window, 'innerWidth',  { configurable: true, value: IPHONE_SE_WIDTH })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 667 })
})

afterAll(() => {
  Object.defineProperty(window, 'innerWidth',  { configurable: true, value: originalInnerWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
})

function authedSession() {
  const auth = useAuthStore()
  auth.setSession({
    token: 'tok-mobile',
    user: {
      id: 1,
      name: 'خزیمه محمودی',
      display_name: 'خزیمه محمودی',
      email: 'k@gmail.com',
      is_doctor: false,
      created_at: '2025-09-01T10:00:00Z'
    }
  })
  return auth
}

describe('Responsive @ 375px — GlobalHeader', () => {
  it('keeps the brand link visible with no hidden-on-mobile class', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    authedSession()
    const wrapper = mount(GlobalHeader, { global: { plugins } })

    const brand = wrapper.find('[data-testid="brand-link"]')
    expect(brand.exists()).toBe(true)
    expect(brand.classes()).not.toContain('hidden')
    expect(brand.classes()).toContain('shrink-0')

    const logo = wrapper.find('[data-testid="brand-logo"]')
    expect(logo.classes()).toContain('h-7')
    expect(logo.classes()).toContain('sm:h-9')
  })

  it('uses tighter padding and smaller gaps on mobile so the right cluster fits', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    authedSession()
    const wrapper = mount(GlobalHeader, { global: { plugins } })

    const inner = wrapper.find('header > div')
    const cls = inner.classes()
    expect(cls).toContain('px-3')
    expect(cls).toContain('sm:px-8')
    expect(cls).toContain('py-3')
    expect(cls).toContain('sm:py-4')

    const cluster = inner.element.children[inner.element.children.length - 1]
    expect(cluster.className).toContain('gap-1')
    expect(cluster.className).toContain('sm:gap-2')
  })

  it('hides the LanguageSwitcher globe icon on mobile and tightens its chips', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    authedSession()
    const wrapper = mount(GlobalHeader, { global: { plugins } })

    const switcher = wrapper.find('[data-testid="language-switcher"]')
    expect(switcher.exists()).toBe(true)

    const globe = switcher.find('span[aria-hidden="true"]')
    expect(globe.classes()).toContain('hidden')
    expect(globe.classes()).toContain('sm:inline-flex')

    const chip = switcher.findAll('button')[0]
    expect(chip.classes()).toContain('px-2')
    expect(chip.classes()).toContain('sm:px-3')
    expect(chip.classes()).toContain('text-xs')
    expect(chip.classes()).toContain('sm:text-sm')
  })

  it('shrinks circular header buttons to 36px (h-9 w-9) on mobile', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    authedSession()
    const wrapper = mount(GlobalHeader, { global: { plugins } })

    const history = wrapper.find('[data-testid="history-link"]')
    expect(history.classes()).toContain('h-9')
    expect(history.classes()).toContain('w-9')
    expect(history.classes()).toContain('sm:h-10')
    expect(history.classes()).toContain('sm:w-10')

    const userTrigger = wrapper.find('[data-testid="user-menu-trigger"]')
    expect(userTrigger.exists()).toBe(true)
  })

  it('keeps the home link clickable (navigates on click)', async () => {
    const { plugins, router } = await makeTestPlugins({ path: '/symptoms' })
    authedSession()
    const wrapper = mount(GlobalHeader, { global: { plugins } })
    const pushSpy = vi.spyOn(router, 'push')

    await wrapper.find('[data-testid="brand-link"]').trigger('click')
    expect(pushSpy).toHaveBeenCalled()
  })
})

describe('Responsive @ 375px — SymptomForm', () => {
  async function mountForm() {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    return mount(SymptomForm, { global: { plugins } })
  }

  it('keeps the submit CTA full-width and clickable', async () => {
    const wrapper = await mountForm()
    const store = useSymptomStore()
    const analyzeSpy = vi.spyOn(store, 'analyze').mockResolvedValue(true)

    const submit = wrapper.find('button[type="submit"]')
    expect(submit.classes()).toContain('w-full')
    expect(submit.attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-testid="primary-symptom-select"]').setValue('headache')
    await wrapper.find('[data-testid="body-area-select"]').setValue('head')
    await wrapper.find('[data-testid="duration-input"]').setValue(3)
    await wrapper.find('form').trigger('submit')

    expect(analyzeSpy).toHaveBeenCalled()
  })

  it('renders form inputs at 100% width on mobile', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('[data-testid="primary-symptom-select"]').classes()).toContain('w-full')
    expect(wrapper.find('[data-testid="body-area-select"]').classes()).toContain('w-full')
    expect(wrapper.find('[data-testid="duration-input"]').classes()).toContain('w-full')
    expect(wrapper.find('[data-testid="additional-info-input"]').classes()).toContain('w-full')
  })

  it('uses a touch-friendly slider (24px thumb via .touch-slider)', async () => {
    const wrapper = await mountForm()
    const slider = wrapper.find('[data-testid="severity-input"]')
    expect(slider.classes()).toContain('touch-slider')
    expect(slider.classes()).toContain('w-full')
  })

  it('keeps the file-upload zone tall enough to tap (min-h-[140px], py-10 on mobile)', async () => {
    const wrapper = await mountForm()
    const zone = wrapper.find('[data-testid="upload-zone"]')
    const cls = zone.classes()
    expect(cls).toContain('min-h-[140px]')
    expect(cls).toContain('py-10')
    expect(cls).toContain('sm:py-8')
  })

  it('uses a lighter blur on mobile and the full glass on sm+ for scroll perf', async () => {
    const wrapper = await mountForm()
    const card = wrapper.find('[data-testid="form-card"]')
    const cls = card.classes()
    expect(cls).toContain('backdrop-blur-md')
    expect(cls).toContain('sm:backdrop-blur-xl')
    expect(cls).toContain('bg-white/90')
    expect(cls).toContain('sm:bg-white/80')
  })
})

describe('Responsive @ 375px — UserProfile', () => {
  it('renders the profile card with mobile padding + lighter blur', async () => {
    const { plugins } = await makeTestPlugins({ path: '/profile' })
    authedSession()
    const wrapper = mount(UserProfile, { global: { plugins } })
    await nextTick()

    const card = wrapper.find('[data-testid="profile-card"]')
    expect(card.exists()).toBe(true)
    const cls = card.classes()
    expect(cls).toContain('p-5')
    expect(cls).toContain('sm:p-8')
    expect(cls).toContain('backdrop-blur-md')
    expect(cls).toContain('sm:backdrop-blur-xl')
  })

  it('stacks Save / Cancel vertically on mobile (full-width tap targets)', async () => {
    const { plugins } = await makeTestPlugins({ path: '/profile' })
    authedSession()
    const wrapper = mount(UserProfile, { global: { plugins } })
    await nextTick()

    await wrapper.find('[data-testid="profile-edit-button"]').trigger('click')

    const save = wrapper.find('[data-testid="profile-save-button"]')
    const cancel = wrapper.find('[data-testid="profile-cancel-button"]')
    expect(save.classes()).toContain('w-full')
    expect(save.classes()).toContain('sm:w-auto')
    expect(cancel.classes()).toContain('w-full')
    expect(cancel.classes()).toContain('sm:w-auto')

    const buttonRow = save.element.parentElement
    expect(buttonRow.className).toContain('flex-col-reverse')
    expect(buttonRow.className).toContain('sm:flex-row')
  })
})

describe('Responsive @ 375px — HistoryView', () => {
  const SAMPLE = [
    {
      id: 11,
      created_at: '2025-09-15T08:30:00Z',
      primary_symptom: 'headache',
      body_area: 'head',
      duration_hours: 4,
      intensity: 6,
      result: { specialty: { id: 1, name: 'پزشک عمومی' } }
    }
  ]

  async function mountHistoryWithItems(items) {
    const { plugins } = await makeTestPlugins({ path: '/history' })
    authedSession()
    const wrapper = mount(HistoryView, { global: { plugins } })
    const history = useHistoryStore()
    history.loading = false
    history.error = null
    history.items = items
    await nextTick()
    return wrapper
  }

  it('renders timeline cards with vertically stacked details on mobile', async () => {
    const wrapper = await mountHistoryWithItems(SAMPLE)

    const card = wrapper.find('[data-testid="history-item"] article')
    expect(card.exists()).toBe(true)
    expect(card.classes()).toContain('p-4')
    expect(card.classes()).toContain('sm:p-5')

    const dl = card.find('dl')
    expect(dl.exists()).toBe(true)
    expect(dl.classes()).toContain('grid-cols-1')
    expect(dl.classes()).toContain('sm:grid-cols-2')
  })

  it('uses lighter blur on mobile for smoother scroll', async () => {
    const wrapper = await mountHistoryWithItems(SAMPLE)

    const card = wrapper.find('[data-testid="history-item"] article')
    expect(card.exists()).toBe(true)
    expect(card.classes()).toContain('backdrop-blur-md')
    expect(card.classes()).toContain('sm:backdrop-blur-xl')
  })
})

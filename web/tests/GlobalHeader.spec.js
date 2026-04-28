import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GlobalHeader from '../src/components/GlobalHeader.vue'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

const BRAND = faMessages.app.name        // "هلثینو"
const TAGLINE = faMessages.app.tagline   // "تشخیص هوشمند، انتخاب آگاهانه پزشک"
const BACK_LABEL = faMessages.nav.back   // "بازگشت"
const HOME_LABEL = faMessages.nav.home   // "خانه"
const THEME_LABEL = faMessages.theme.toggle

async function mountHeader(path) {
  const { plugins } = await makeTestPlugins({ path })
  return mount(GlobalHeader, { global: { plugins } })
}

describe('GlobalHeader', () => {
  describe('on the landing route ("/")', () => {
    it('renders the brand "هلثینو"', async () => {
      const wrapper = await mountHeader('/')
      expect(wrapper.text()).toContain(BRAND)
    })

    it('renders the tagline in the center slot', async () => {
      const wrapper = await mountHeader('/')
      const tagline = wrapper.find('p')
      expect(tagline.exists()).toBe(true)
      expect(tagline.text()).toBe(TAGLINE)
    })

    it('hides the tagline below the md breakpoint via "hidden md:block"', async () => {
      const wrapper = await mountHeader('/')
      const tagline = wrapper.find('p')
      expect(tagline.classes()).toContain('hidden')
      expect(tagline.classes()).toContain('md:block')
    })

    it('renders the theme toggle button', async () => {
      const wrapper = await mountHeader('/')
      const toggle = wrapper.find(`button[aria-label="${THEME_LABEL}"]`)
      expect(toggle.exists()).toBe(true)
    })

    it('does NOT render the back button on root', async () => {
      const wrapper = await mountHeader('/')
      const back = wrapper.find(`button[aria-label="${BACK_LABEL}"]`)
      expect(back.exists()).toBe(false)
    })

    it('does NOT render the home link on root (already there)', async () => {
      const wrapper = await mountHeader('/')
      expect(wrapper.find('[data-testid="home-link"]').exists()).toBe(false)
    })
  })

  describe('on the symptoms route ("/symptoms")', () => {
    it('still renders the brand "هلثینو"', async () => {
      const wrapper = await mountHeader('/symptoms')
      expect(wrapper.text()).toContain(BRAND)
    })

    it('still renders the tagline in the center', async () => {
      const wrapper = await mountHeader('/symptoms')
      expect(wrapper.find('p').text()).toBe(TAGLINE)
    })

    it('renders the back button', async () => {
      const wrapper = await mountHeader('/symptoms')
      const back = wrapper.find(`button[aria-label="${BACK_LABEL}"]`)
      expect(back.exists()).toBe(true)
    })

    it('renders the theme toggle button', async () => {
      const wrapper = await mountHeader('/symptoms')
      const toggle = wrapper.find(`button[aria-label="${THEME_LABEL}"]`)
      expect(toggle.exists()).toBe(true)
    })

    it('renders a home link that points to "/"', async () => {
      const wrapper = await mountHeader('/symptoms')
      const home = wrapper.find('[data-testid="home-link"]')
      expect(home.exists()).toBe(true)
      expect(home.element.tagName).toBe('A')
      expect(home.attributes('href')).toBe('/')
      expect(home.attributes('aria-label')).toBe(HOME_LABEL)
    })

    it('places the home link inside the brand container, next to the logo (NOT in the action cluster)', async () => {
      const wrapper = await mountHeader('/symptoms')
      const inner = wrapper.find('header > div').element
      const brand = inner.firstElementChild
      const cluster = inner.lastElementChild

      expect(brand.getAttribute('data-testid')).toBe('brand')
      expect(brand.textContent).toContain(BRAND)
      expect(brand.querySelector('[data-testid="home-link"]')).not.toBeNull()
      expect(cluster.querySelector('[data-testid="home-link"]')).toBeNull()
    })

    it('vertically centers the logo + home icon (brand container uses flex items-center)', async () => {
      const wrapper = await mountHeader('/symptoms')
      const brand = wrapper.find('[data-testid="brand"]')
      const cls = brand.classes()
      expect(cls).toContain('flex')
      expect(cls).toContain('items-center')
    })

    it('home link inherits the same brand-text colors as the logo (no glass chip)', async () => {
      const wrapper = await mountHeader('/symptoms')
      const cls = wrapper.find('[data-testid="home-link"]').classes()

      expect(cls).toContain('text-slate-700/80')
      expect(cls).toContain('dark:text-slate-200/80')
      expect(cls).toContain('hover:text-brand-dark')
      expect(cls).toContain('dark:hover:text-emerald-300')

      expect(cls).not.toContain('bg-white/70')
      expect(cls).not.toContain('dark:bg-slate-800/60')
      expect(cls).not.toContain('rounded-full')
      expect(cls).not.toContain('backdrop-blur-md')
    })
  })

  describe('layout / alignment', () => {
    it('uses sticky top-0 with backdrop-blur and a bottom border', async () => {
      const wrapper = await mountHeader('/')
      const header = wrapper.find('header')
      const cls = header.classes()
      expect(cls).toContain('sticky')
      expect(cls).toContain('top-0')
      expect(cls).toContain('backdrop-blur-md')
      expect(cls).toContain('border-b')
    })

    it('inner row uses max-w-6xl + mx-auto (matches the cards)', async () => {
      const wrapper = await mountHeader('/')
      const inner = wrapper.find('header > div')
      const cls = inner.classes()
      expect(cls).toContain('max-w-6xl')
      expect(cls).toContain('mx-auto')
    })

    it('places brand at the start (first flex child) and the action cluster at the end (last child)', async () => {
      const wrapper = await mountHeader('/symptoms')
      const inner = wrapper.find('header > div')
      const children = inner.element.children
      // children: <div brand (logo + home)>, <p tagline>, <div cluster>
      expect(children[0].tagName.toLowerCase()).toBe('div')
      expect(children[0].getAttribute('data-testid')).toBe('brand')
      expect(children[0].textContent).toContain(BRAND)
      const cluster = children[children.length - 1]
      expect(cluster.tagName.toLowerCase()).toBe('div')
      // cluster should hold the back / switcher / toggle buttons
      const buttons = cluster.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThanOrEqual(3) // back + 2 switcher options + theme
    })
  })
})

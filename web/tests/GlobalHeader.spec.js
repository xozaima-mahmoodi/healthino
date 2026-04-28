import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GlobalHeader from '../src/components/GlobalHeader.vue'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

const BRAND = faMessages.app.name        // "هلثینو"
const TAGLINE = faMessages.app.tagline
const BACK_LABEL = faMessages.nav.back
const THEME_LABEL = faMessages.theme.toggle

async function mountHeader(path) {
  const { plugins } = await makeTestPlugins({ path })
  return mount(GlobalHeader, { global: { plugins } })
}

describe('GlobalHeader', () => {
  describe('on the landing route ("/")', () => {
    it('renders the brand "هلثینو" inside the SVG logotype', async () => {
      const wrapper = await mountHeader('/')
      expect(wrapper.text()).toContain(BRAND)
      const text = wrapper.find('[data-testid="brand-logo"] text')
      expect(text.exists()).toBe(true)
      expect(text.text()).toBe(BRAND)
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

    it('still renders the brand link on root (the logo is always visible)', async () => {
      const wrapper = await mountHeader('/')
      const link = wrapper.find('[data-testid="brand-link"]')
      expect(link.exists()).toBe(true)
      expect(link.element.tagName).toBe('A')
      expect(link.attributes('href')).toBe('/')
    })

    it('does NOT render a separate home-icon link (logo is the home link now)', async () => {
      const wrapper = await mountHeader('/')
      expect(wrapper.find('[data-testid="home-link"]').exists()).toBe(false)
    })
  })

  describe('on the symptoms route ("/symptoms")', () => {
    it('still renders the brand "هلثینو" via the SVG logotype', async () => {
      const wrapper = await mountHeader('/symptoms')
      expect(wrapper.text()).toContain(BRAND)
      expect(wrapper.find('[data-testid="brand-logo"] text').text()).toBe(BRAND)
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

    it('the brand link points at "/" on internal pages too', async () => {
      const wrapper = await mountHeader('/symptoms')
      const link = wrapper.find('[data-testid="brand-link"]')
      expect(link.exists()).toBe(true)
      expect(link.element.tagName).toBe('A')
      expect(link.attributes('href')).toBe('/')
      expect(link.attributes('aria-label')).toBe(BRAND)
    })

    it('does NOT render a separate home-icon link', async () => {
      const wrapper = await mountHeader('/symptoms')
      expect(wrapper.find('[data-testid="home-link"]').exists()).toBe(false)
    })
  })

  describe('SVG typography logo', () => {
    it('contains a roof outline (chevron path) above the wordmark', async () => {
      const wrapper = await mountHeader('/symptoms')
      const svg = wrapper.find('[data-testid="brand-logo"]')
      const roof = svg.find('path')
      expect(roof.exists()).toBe(true)
      expect(roof.attributes('d')).toMatch(/^M\s*8\s+14\s+L\s*50\s+3\s+L\s*92\s+14$/)
      expect(roof.attributes('stroke')).toBe('currentColor')
    })

    it('text and stroke both inherit the link color via currentColor', async () => {
      const wrapper = await mountHeader('/symptoms')
      const svg = wrapper.find('[data-testid="brand-logo"]')
      expect(svg.find('text').attributes('fill')).toBe('currentColor')
      expect(svg.find('path').attributes('stroke')).toBe('currentColor')
    })

    it('exposes an accessible <title> for screen readers', async () => {
      const wrapper = await mountHeader('/symptoms')
      const title = wrapper.find('[data-testid="brand-logo"] title')
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe(BRAND)
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

    it('places the brand link at the start (first child) and the action cluster at the end', async () => {
      const wrapper = await mountHeader('/symptoms')
      const inner = wrapper.find('header > div')
      const children = inner.element.children
      // children: <a brand-link>, <p tagline>, <div cluster>
      expect(children[0].tagName.toLowerCase()).toBe('a')
      expect(children[0].getAttribute('data-testid')).toBe('brand-link')
      const cluster = children[children.length - 1]
      expect(cluster.tagName.toLowerCase()).toBe('div')
      const buttons = cluster.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThanOrEqual(3) // back + 2 switcher options + theme
    })

    it('vertically centers the brand link with other header items (items-center on link AND row)', async () => {
      const wrapper = await mountHeader('/symptoms')
      const link = wrapper.find('[data-testid="brand-link"]')
      expect(link.classes()).toContain('items-center')
      expect(wrapper.find('header > div').classes()).toContain('items-center')
    })

    it('brand link uses the same color tokens as before, with a brand-tinted hover', async () => {
      const wrapper = await mountHeader('/symptoms')
      const cls = wrapper.find('[data-testid="brand-link"]').classes()
      expect(cls).toContain('text-slate-700/80')
      expect(cls).toContain('dark:text-slate-200/80')
      expect(cls).toContain('hover:text-brand-dark')
      expect(cls).toContain('dark:hover:text-emerald-300')
      expect(cls).toContain('transition-colors')
    })
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GlobalHeader from '../src/components/GlobalHeader.vue'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

const BRAND = faMessages.app.name        // "هلثینو"
const TAGLINE = faMessages.app.tagline   // "تشخیص هوشمند، انتخاب آگاهانه پزشک"
const BACK_LABEL = faMessages.nav.back   // "بازگشت"
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
      // children: <span brand>, <p tagline>, <div cluster>
      expect(children[0].tagName.toLowerCase()).toBe('span')
      expect(children[0].textContent.trim()).toBe(BRAND)
      const cluster = children[children.length - 1]
      expect(cluster.tagName.toLowerCase()).toBe('div')
      // cluster should hold the back / switcher / toggle buttons
      const buttons = cluster.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThanOrEqual(3) // back + 2 switcher options + theme
    })
  })
})

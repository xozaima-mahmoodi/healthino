import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BackButton from '../src/components/BackButton.vue'
import faMessages from '../src/locales/fa.json'
import { makeTestPlugins } from './helpers.js'

const BACK_LABEL = faMessages.nav.back

async function mountBack(path) {
  const { plugins, router } = await makeTestPlugins({ path })
  const wrapper = mount(BackButton, { global: { plugins } })
  return { wrapper, router }
}

describe('BackButton', () => {
  it('does not render on the root path ("/")', async () => {
    const { wrapper } = await mountBack('/')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders on /symptoms', async () => {
    const { wrapper } = await mountBack('/symptoms')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('exposes a localized aria-label and title', async () => {
    const { wrapper } = await mountBack('/symptoms')
    const btn = wrapper.find('button')
    expect(btn.attributes('aria-label')).toBe(BACK_LABEL)
    expect(btn.attributes('title')).toBe(BACK_LABEL)
  })

  it('calls router.back() on click', async () => {
    const { wrapper, router } = await mountBack('/symptoms')
    const spy = vi.spyOn(router, 'back')
    await wrapper.find('button').trigger('click')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('contains an SVG arrow that flips in RTL via the "rtl:rotate-180" class', async () => {
    const { wrapper } = await mountBack('/symptoms')
    const svg = wrapper.find('button svg')
    expect(svg.exists()).toBe(true)
    expect(svg.classes()).toContain('rtl:rotate-180')
  })

  it('uses inline (non-fixed) positioning so it sits inside the header cluster', async () => {
    const { wrapper } = await mountBack('/symptoms')
    const cls = wrapper.find('button').classes()
    expect(cls).not.toContain('fixed')
    expect(cls).toContain('inline-flex')
  })

  it('uses glass styling with light + dark variants', async () => {
    const { wrapper } = await mountBack('/symptoms')
    const cls = wrapper.find('button').classes()
    expect(cls.some(c => c === 'bg-white/70')).toBe(true)
    expect(cls.some(c => c === 'dark:bg-slate-800/60')).toBe(true)
    expect(cls.some(c => c === 'backdrop-blur-md')).toBe(true)
  })
})

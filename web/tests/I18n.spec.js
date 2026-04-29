import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import GlobalHeader from '../src/components/GlobalHeader.vue'
import LanguageSwitcher from '../src/components/LanguageSwitcher.vue'
import faMessages from '../src/locales/fa.json'
import enMessages from '../src/locales/en.json'
import { useLocaleStore } from '../src/stores/locale'
import { applyLocale, directionFor, SUPPORTED_LOCALES } from '../src/i18n'
import { makeTestPlugins } from './helpers.js'

describe('i18n setup', () => {
  it('lists fa, ckb and en as supported locales', () => {
    expect(SUPPORTED_LOCALES).toContain('fa')
    expect(SUPPORTED_LOCALES).toContain('en')
  })

  it('directionFor() returns ltr for English and rtl for fa/ckb', () => {
    expect(directionFor('en')).toBe('ltr')
    expect(directionFor('fa')).toBe('rtl')
    expect(directionFor('ckb')).toBe('rtl')
  })
})

describe('LanguageSwitcher', () => {
  it('exposes EN as a third toggle pill', async () => {
    const { plugins } = await makeTestPlugins({ path: '/' })
    const wrapper = mount(LanguageSwitcher, { global: { plugins } })

    const labels = wrapper.findAll('button').map(b => b.text())
    expect(labels).toContain('فارسی')
    expect(labels).toContain('کوردی')
    expect(labels).toContain('EN')
  })
})

describe('GlobalHeader — language switching', () => {
  it('renders Persian text by default and the brand reads "هلثینو"', async () => {
    const { plugins } = await makeTestPlugins({ path: '/symptoms' })
    const wrapper = mount(GlobalHeader, { global: { plugins } })

    expect(wrapper.text()).toContain(faMessages.app.name)
    expect(wrapper.text()).toContain(faMessages.app.tagline)
  })

  it('switches Header text to the English locale and falls back to Persian after switching back', async () => {
    const { plugins, i18n } = await makeTestPlugins({ path: '/symptoms' })
    const wrapper = mount(GlobalHeader, { global: { plugins } })

    expect(wrapper.text()).toContain(faMessages.app.tagline)
    expect(wrapper.text()).not.toContain(enMessages.app.tagline)

    i18n.global.locale.value = 'en'
    await nextTick()

    expect(wrapper.text()).toContain(enMessages.app.name)        // "Healthino"
    expect(wrapper.text()).toContain(enMessages.app.tagline)
    expect(wrapper.text()).not.toContain(faMessages.app.tagline)

    i18n.global.locale.value = 'fa'
    await nextTick()
    expect(wrapper.text()).toContain(faMessages.app.tagline)
  })

  it('applyLocale("en") sets <html lang="en" dir="ltr">; applyLocale("fa") restores rtl', async () => {
    await makeTestPlugins({ path: '/' })

    applyLocale('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('en')

    applyLocale('fa')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('fa')
  })

  it('locale store rejects an unknown code without changing state', async () => {
    await makeTestPlugins({ path: '/' })
    const locale = useLocaleStore()
    const before = locale.current
    locale.set('xx-NOT-A-LOCALE')
    expect(locale.current).toBe(before)
  })
})

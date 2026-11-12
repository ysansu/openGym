// #303: an instance-wide default language, and the browser's, apply only to a copy nobody has
// picked a language for — never to an existing profile, whose `lang: 'en'` may be a choice.
//
// This build speaks English and Simplified Chinese, so the tags below are drawn from those two.
// The matching rules themselves (full tag first, then base, then nothing) are what the module
// is for, and they are the same rules whatever the language list holds.
import { describe, expect, it } from 'vitest'
import { matchLocale, autoLang } from './default-lang.js'

describe('matchLocale', () => {
  it('matches the full tag first, in any case or separator', () => {
    expect(matchLocale('zh')).toBe('zh')
    expect(matchLocale(' ZH ')).toBe('zh')
    expect(matchLocale('en-GB')).toBe('en')
  })

  it('falls back to the base language, and to nothing for one the app does not have', () => {
    expect(matchLocale('en-US')).toBe('en')
    expect(matchLocale('en-AU')).toBe('en')
    expect(matchLocale('nl-NL')).toBe(null)
    expect(matchLocale('de-DE')).toBe(null)     // removed from this build
    expect(matchLocale('pt-BR')).toBe(null)
    expect(matchLocale('')).toBe(null)
    expect(matchLocale(undefined)).toBe(null)
  })

  it('reads every Chinese tag as zh, since zh-TW is not a language this build has', () => {
    expect(matchLocale('zh-CN')).toBe('zh')
    expect(matchLocale('zh-Hans-CN')).toBe('zh')
    expect(matchLocale('zh-Hans')).toBe('zh')
    expect(matchLocale('zh-TW')).toBe('zh')     // falls back to the base, not to zh-TW
    expect(matchLocale('zh-Hant')).toBe('zh')
    expect(matchLocale('zh-HK')).toBe('zh')
    expect(matchLocale('zh')).toBe('zh')
  })
})

describe('autoLang', () => {
  const fresh = { lang: 'en', langAuto: true }
  it('leaves a copy alone that chose, or that predates the mark', () => {
    expect(autoLang({ lang: 'en' }, { default_lang: 'zh' }, ['zh-HK'])).toBe(null)
    expect(autoLang({ lang: 'en', langAuto: false }, { default_lang: 'zh' }, ['zh-HK'])).toBe(null)
  })

  it('puts DEFAULT_LANG before the browser, the browser before English', () => {
    expect(autoLang(fresh, { default_lang: 'zh' }, ['en-GB'])).toBe('zh')
    expect(autoLang(fresh, {}, ['nl-NL', 'zh-TW'])).toBe('zh')
    expect(autoLang(fresh, {}, ['nl-NL'])).toBe('en')
    // A default the app does not speak is skipped in favour of the browser's language, and an
    // unknown one falls through to English.
    expect(autoLang(fresh, { default_lang: 'xx' }, ['zh-CN'])).toBe('zh')
    expect(autoLang(fresh, { default_lang: 'xx' }, ['nl-NL'])).toBe('en')
  })
})

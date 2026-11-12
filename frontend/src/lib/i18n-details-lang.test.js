/* The first details load and a language switch can overlap: setLang reloads the descriptions
   only once a load has finished, so one that started under one language and finished under
   another used to put the first language's descriptions under the second. They are kept only
   for the language they were loaded for; the loader then loads the current language's own.

   This build speaks English and Chinese, so the switch below is zh -> en: the same overlap the
   German -> French case first caught. */
import { describe, expect, it } from 'vitest'
import * as core from './i18n-core.js'

const ex = { id: '9999', st: [] }

describe('a language switch while the details load', () => {
  it('keeps the descriptions of one language from landing under another', () => {
    core._setLangState('zh', {}, null, null, true, false)
    expect(core._setDetails({ 9999: ['Lift.'] }, { 9999: 'A lift.' }, { 9999: '一次举重。' }, 'zh')).toBe(true)
    expect(core.descFor(ex)).toBe('一次举重。')
    core._setLangState('en', {}, null, null, true, false)
    // Chinese descriptions that finished loading after the switch to English
    expect(core._setDetails({ 9999: ['Lift.'] }, { 9999: 'A lift.' }, { 9999: '一次举重。' }, 'zh')).toBe(false)
    expect(core.descFor(ex)).not.toBe('一次举重。')
    expect(core.instrFor(ex)).toEqual(['Lift.'])   // the English steps are every language's
    expect(core._setDetails(null, null, { 9999: 'A lift.' }, 'en')).toBe(true)
    expect(core.descFor(ex)).toBe('A lift.')
  })
})

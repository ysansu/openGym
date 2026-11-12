import { afterEach, describe, expect, it } from 'vitest'
import { exerciseNameText } from './format.js'
import { _setLangState } from './i18n-core.js'
import zh from '../exercise-names/zh.js'

// A toast, a dialog title, the timed-set label and the Stats picker show an exercise name as
// plain text, with no element to carry the CSS title-casing. They have to come out cased the way
// the same name reads in the list next to them.
describe('exerciseNameText', () => {
  const bench = { id: '0025', n: 'barbell bench press' }
  const custom = { id: 'custom-1', n: 'my own press' }
  afterEach(() => _setLangState('en', {}, null, null))

  it('title-cases an English name and a custom one', () => {
    expect(exerciseNameText(bench)).toBe('Barbell Bench Press')
    expect(exerciseNameText(custom)).toBe('My Own Press')
  })

  it('title-cases a name from a translated pack, the English one in parentheses included', () => {
    _setLangState('zh', {}, null, zh)
    expect(exerciseNameText(bench)).toBe('杠铃卧推 (Barbell Bench Press)')
  })

  it('leaves a pack that carries its own casing as the pack writes it', () => {
    // CASED_NAME_LANGS is empty in this build (German was its only entry), so no pack takes
    // this branch today; the switch is still what the function must honour when one does.
    _setLangState('zh', {}, null, zh, false)
    expect(exerciseNameText(bench)).toBe('杠铃卧推')
  })
})

// QA 1.3.9: the accent swatches' screen-reader names were the internal keys ("lime", "sky").
describe('ACCENT_NAMES', () => {
  it('names every accent, in every language pack', async () => {
    const { ACCENTS, ACCENT_NAMES } = await import('./format.js')
    expect(Object.keys(ACCENT_NAMES).sort()).toEqual(Object.keys(ACCENTS).sort())
    const packs = import.meta.glob('../locales/*.js', { eager: true, import: 'default' })
    for (const [file, pack] of Object.entries(packs))
      for (const name of Object.values(ACCENT_NAMES)) expect(pack[name], `${file}: ${name}`).toBeTruthy()
  })
})

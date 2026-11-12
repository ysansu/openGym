import { describe, it, expect } from 'vitest'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  baseLang, derivePack, dateLocale, getLang, t, _setLangState, exerciseNameClass, exerciseNameFor, CASED_NAME_LANGS
} from './i18n-core.js'
import { EXDB } from './exercises-data.js'

// baseLang / derivePack / DERIVED_LOCALES are exercised through the language this build
// ships. The de-CH derivation tests that used to sit here went with German: both the Swiss
// transform and the pack it read from were removed (lib/i18n-core.js).
// EXDB stores English names lower-case and the UI title-cases them with CSS. A pack that
// carries its own casing (CASED_NAME_LANGS, now empty — German was the only one) must not be
// cased again on top. Chinese has no case at all, so its translated names are title-cased
// like the English fallback and the class does nothing to them.
describe('exerciseNameClass', () => {
  const bench = { id: '0025', n: 'barbell bench press' }
  const pushUp = { id: '0662', n: 'push-up' }
  const custom = { id: 'custom-1', n: 'my own press' }

  it('title-cases while the English fallback is showing', () => {
    _setLangState('en', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
    _setLangState('en', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
  })

  it('title-cases a Chinese name too, since the script has no case to preserve', () => {
    _setLangState('zh', {}, null, { '0025': '杠铃卧推' })
    expect(exerciseNameClass(bench)).toBe('capitalize')
    _setLangState('en', {}, null, null)
  })

  // A pack may cover some exercises and not others: the ones it lacks show their lower-case
  // English title and still need the casing.
  it('decides per exercise, so an untranslated one keeps its casing', () => {
    _setLangState('zh', {}, null, { '0025': '杠铃卧推' })
    expect(exerciseNameClass(bench)).toBe('capitalize')
    expect(exerciseNameClass(pushUp)).toBe('capitalize')
    expect(exerciseNameClass(custom)).toBe('capitalize')
    expect(exerciseNameClass(undefined)).toBe('capitalize')
    _setLangState('en', {}, null, null)
  })
})

// #290 took the title-casing off every translated name so German would keep its own, and the
// packs stored lower-case (pt-BR, hu, es, ru, it, fr) went lower-case everywhere with it. Which
// packs carry real casing is a list, so it is checked against what the packs actually hold: a
// new pack that is lower-case gets the casing without anyone remembering to add it, and one with
// real casing fails here until it is listed.
describe('title-casing per exercise-name pack', () => {
  const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
  const packFor = lang => packs[`../exercise-names/${lang}.js`]
  // Share of names that start with a lower-case letter. A lower-case pack still has a few that
  // start upper-case for a reason of their own (EZ-rudas, L-sit, SkiErg), German has none.
  // Share of names that do not start with a capital. A script without case (Arabic, Devanagari,
  // Thai, Han...) has nothing to title-case, so such a name counts as lower-case: the capitalize
  // class stays on and does nothing to it.
  const lowerShare = names => {
    const firsts = Object.values(names).map(n => [...n][0]).filter(Boolean)
    return firsts.filter(c => c === c.toLocaleLowerCase()).length / firsts.length
  }

  it('lists exactly the packs written in their own casing', () => {
    for (const lang of EXERCISE_NAME_LANGS) {
      expect(CASED_NAME_LANGS.includes(lang), `${lang}: ${Math.round(lowerShare(packFor(lang)) * 100)}% lower-case`)
        .toBe(lowerShare(packFor(lang)) < 0.5)
    }
    for (const lang of CASED_NAME_LANGS) expect(EXERCISE_NAME_LANGS, lang).toContain(lang)
  })

  for (const lang of EXERCISE_NAME_LANGS) {
    const cased = CASED_NAME_LANGS.includes(baseLang(lang))
    it(`${lang}: a translated name is ${cased ? 'left in its own casing' : 'title-cased like English'}`, () => {
      const names = packFor(baseLang(lang))
      const translated = EXDB.filter(e => names[e.id])
      _setLangState(lang, {}, null, names)
      for (const ex of translated) expect(exerciseNameClass(ex), `${lang} ${ex.id}`).toBe(cased ? '' : 'capitalize')
      // An exercise the pack does not cover shows the lower-case English title either way.
      const untranslated = EXDB.find(e => !names[e.id])
      if (untranslated) expect(exerciseNameClass(untranslated)).toBe('capitalize')
      _setLangState('en', {}, null, null)
    })
  }
})

// The two per-language switches in Settings (the English name in parentheses, English names
// only) came with the Italian and French packs, but they have to hold for every pack the app
// ships — German too, which covers only part of the catalogue.
describe('English-name switches with every exercise-name pack', () => {
  const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
  const packFor = lang => packs[`../exercise-names/${lang}.js`]

  it('ships a pack for every language listed as having one', () => {
    for (const lang of EXERCISE_NAME_LANGS) expect(packFor(lang), lang).toBeTruthy()
  })

  // This build ships one translated pack (zh), so the per-pack walk is a single pass. It is
  // written as a loop rather than inlined because adding a language back means adding a pack
  // and an entry to LANGS, and this then covers it with no edit here.
  for (const lang of EXERCISE_NAME_LANGS) {
    it(`${lang}: parentheses off shows the translation alone, English only shows the English title`, () => {
      const names = packFor(lang)
      expect(names, `${lang} pack`).toBeTruthy()
      const ex = EXDB.find(e => names[e.id] && names[e.id].toLocaleLowerCase(lang) !== e.n.toLocaleLowerCase('en'))
      if (!ex) return   // the pack has no name that differs from the English one
      _setLangState(lang, {}, null, names)
      // A pack in CASED_NAME_LANGS keeps its own casing; any other is title-cased like English.
      const translatedClass = CASED_NAME_LANGS.includes(lang) ? '' : 'capitalize'
      expect(exerciseNameFor(ex)).toBe(`${names[ex.id]} (${ex.n})`)
      expect(exerciseNameClass(ex)).toBe(translatedClass)
      _setLangState(lang, {}, null, names, false)
      expect(exerciseNameFor(ex)).toBe(names[ex.id])
      expect(exerciseNameClass(ex)).toBe(translatedClass)
      _setLangState(lang, {}, null, names, true, true)
      expect(exerciseNameFor(ex)).toBe(ex.n)
      // The English title is stored lower-case, so it gets the title-casing back with it.
      expect(exerciseNameClass(ex)).toBe('capitalize')
      _setLangState('en', {}, null, null)
    })
  }

  it('zh: an exercise the partial pack does not cover is unaffected by either switch', () => {
    const names = packFor('zh')
    const ex = EXDB.find(e => !names[e.id])
    for (const [showEn, enOnly] of [[true, false], [false, false], [true, true]]) {
      _setLangState('zh', {}, null, names, showEn, enOnly)
      expect(exerciseNameFor(ex)).toBe(ex.n)
      expect(exerciseNameClass(ex)).toBe('capitalize')
    }
    _setLangState('en', {}, null, null)
  })
})

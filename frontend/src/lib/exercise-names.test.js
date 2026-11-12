import { afterEach, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { EXDB } from './exercises-data.js'
import V13_IDS from './catalogue-v13-ids.json' with { type: 'json' }
import { checkName, stagedExercises } from '../../../scripts/de-name-rules.mjs'
import {
  EXERCISE_NAME_LANGS, _setLangState, derivePack, exerciseNameFor, exerciseNameSearchText
} from './i18n-core.js'

// Every translated-name pack, checked the same way. The packs are generated from
// catalogue/i18n/<lang>.json and may be partial (anything missing shows the English title), so
// coverage and the language rules below are pinned on the 1,324 entries of the v1.3 catalogue,
// whose names were curated and reviewed. Names for the v1.4 additions only have to be well formed.
const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
const EXIDX = new Map(EXDB.map(exercise => [exercise.id, exercise]))
const LEGACY_IDS = new Set(V13_IDS)
const legacy = EXDB.filter(exercise => LEGACY_IDS.has(exercise.id))
const catalogueNames = lang => {
  const rows = JSON.parse(readFileSync(new URL(`../../../catalogue/i18n/${lang}.json`, import.meta.url), 'utf8'))
  return Object.fromEntries(Object.entries(rows).filter(([, row]) => row.name).map(([id, row]) => [id, row.name]))
}

const MALE = /(?:^|[^\p{L}])male(?=$|[^\p{L}])/iu
const FEMALE = /(?:^|[^\p{L}])female(?=$|[^\p{L}])/iu

// What the v1.3 names were held to, per language.
//   covers:   the v1.3 entries the pack translates in full
//   keep:     [English, translated] — a qualifier or piece of equipment in the English title that
//             has to survive translation, since it changes which exercise it is
//   forbid:   words a name must not contain (English left untranslated, rejected calques)
//   require:  a pattern every name has to match
//   distinct: no two different v1.3 exercises share a name
//   loanword: "burpee" is the local term too, so it shows without the English repeated
// Curated name rules, per language. This build ships one translated pack (zh), so the table
// has one entry: the other sixteen languages and their rules went with the packs
// (lib/i18n-core.js). The rules below are what the per-pack walk further down reads; adding
// a language back means adding its pack and an entry here.
const LANGS = {
  zh: {
    covers: legacy,
    // Han characters somewhere in the title: a name left in English would otherwise pass
    // every other check while showing "barbell bench press (barbell bench press)".
    require: /[\u4e00-\u9fff]/u,
  },
}

test('every curated language still ships a name pack, and every pack is enabled', () => {
  for (const lang of Object.keys(LANGS)) expect(EXERCISE_NAME_LANGS, lang).toContain(lang)
  for (const path of Object.keys(packs)) {
    const lang = path.match(/([^/]+)\.js$/)[1]
    expect(EXERCISE_NAME_LANGS, path).toContain(lang)
  }
})

for (const lang of EXERCISE_NAME_LANGS) {
  describe(`${lang} exercise names`, () => {
    const pack = packs[`../exercise-names/${lang}.js`]
    const rules = LANGS[lang] || {}
    // The rules hold the curated names: the v1.3 ones, for German only the reviewed stage.
    const v13 = (rules.covers || legacy).filter(exercise => pack[exercise.id])
    afterEach(() => _setLangState('en', {}, null, null))

    test('is built from catalogue/i18n, for known exercises only, with non-empty names', () => {
      expect(pack).toEqual(catalogueNames(lang))
      for (const [id, name] of Object.entries(pack)) {
        expect(EXIDX.has(id), `unknown exercise ${id}`).toBe(true)
        expect(typeof name === 'string' && name.trim(), id).toBeTruthy()
        expect(name, id).toBe(name.trim())
      }
    })

    if (rules.covers) {
      test('covers the v1.3 catalogue', () => {
        expect(rules.covers.length).toBeGreaterThan(0)
        for (const exercise of rules.covers) expect(pack[exercise.id]?.trim(), exercise.id).toBeTruthy()
      })
    }

    if (rules.forbid || rules.require) {
      test('leaves nothing untranslated in the v1.3 names', () => {
        for (const exercise of v13) {
          if (rules.forbid) expect(pack[exercise.id], exercise.id).not.toMatch(rules.forbid)
          if (rules.require) expect(pack[exercise.id], exercise.id).toMatch(rules.require)
        }
      })
    }

    if (rules.keep) {
      test('preserves identity-changing qualifiers and equipment in the v1.3 names', () => {
        for (const exercise of v13) {
          for (const [english, translated] of rules.keep) {
            if (english.test(exercise.n)) expect(pack[exercise.id], `${exercise.id}: ${exercise.n}`).toMatch(translated)
          }
        }
      })
    }

    if (rules.check) {
      test('every v1.3 name obeys the naming rules', () => {
        const broken = []
        for (const exercise of v13) {
          const violations = rules.check(exercise, pack[exercise.id])
          if (violations.length) broken.push(`${exercise.id} "${pack[exercise.id]}": ${violations.map(v => v.rule).join(', ')}`)
        }
        expect(broken).toEqual([])
      })
    }

    if (rules.distinct) {
      test('gives different v1.3 exercises different names', () => {
        const seen = new Map()
        for (const exercise of v13) {
          const name = pack[exercise.id]
          const other = seen.get(name)
          if (other) expect(other.n, `${name}: ${other.id} vs ${exercise.id}`).toBe(exercise.n)
          else seen.set(name, exercise)
        }
      })
    }

    test('shows the translation first with the English title in parentheses, and can hide or replace it', () => {
      // One whose name differs from the English, or the loanword rule below takes over.
      const exercise = EXDB.find(e => pack[e.id] && pack[e.id].toLocaleLowerCase(lang) !== e.n.toLocaleLowerCase('en'))
      const name = pack[exercise.id]
      _setLangState(lang, {}, null, pack)
      expect(exerciseNameFor(exercise)).toBe(`${name} (${exercise.n})`)
      expect(exerciseNameSearchText(exercise)).toContain(name)
      expect(exerciseNameSearchText(exercise)).toContain(exercise.n)
      _setLangState(lang, {}, null, pack, false)
      expect(exerciseNameFor(exercise)).toBe(name)
      _setLangState(lang, {}, null, pack, true, true)
      expect(exerciseNameFor(exercise)).toBe(exercise.n)
    })

    test('falls back to the English title, never translates custom exercises or changes other languages', () => {
      const exercise = EXDB.find(e => pack[e.id])
      const { [exercise.id]: _, ...without } = pack
      _setLangState(lang, {}, null, without)
      expect(exerciseNameFor(exercise)).toBe(exercise.n)
      const custom = { id: 'custom-1', n: 'My own exercise' }
      _setLangState(lang, {}, null, pack)
      expect(exerciseNameFor(custom)).toBe('My own exercise')
      _setLangState('en', {}, null, null)
      expect(exerciseNameFor(exercise)).toBe(exercise.n)
    })

    if (rules.loanword) {
      test('keeps loanword names without duplicating the English title', () => {
        _setLangState(lang, {}, null, pack)
        expect(exerciseNameFor(EXIDX.get('1160'))).toBe('burpee')
      })
    }
  })
}

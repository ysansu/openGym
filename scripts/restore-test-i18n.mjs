#!/usr/bin/env node
// Restores the i18n rows the test suite needs, alongside the exercise fixtures.
//
//   node scripts/restore-test-i18n.mjs
//
// prune.mjs drops every i18n row whose exercise is no longer in catalogue/exercises/, which
// is right for the app: a language pack with 19 rows is what ships. The tests, though, were
// written against the full catalogue — exercise-names.test.js walks every language pack,
// pt-br-instructions.test.js asserts the v1.3 catalogue is covered, i18n-core.test.js checks
// a translated name renders.
//
// So the rows for the fixture exercises are put back into catalogue/i18n/ and the language
// packs are rebuilt with them. The app's own build (scripts/catalogue/build.mjs) is unchanged
// and still emits 19-row packs; build-test-catalogue.mjs emits the packs the tests read.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAT = path.join(ROOT, 'catalogue')
const FX = path.join(CAT, 'test-fixtures')
const I18N = path.join(CAT, 'i18n')
const GIT = path.join(ROOT, '.git')

if (!fs.existsSync(FX)) {
  console.error('catalogue/test-fixtures/ is missing — run scripts/restore-test-fixtures.mjs first')
  process.exit(1)
}
if (!fs.existsSync(GIT)) {
  console.error('no .git here: the i18n rows come from git history')
  process.exit(1)
}

// The fixture ids, so a row is only restored for an exercise the tests actually name.
const fxIds = new Set(fs.readdirSync(FX).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))
console.log(`fixture exercises: ${fxIds.size}`)

// The i18n files as they were before the prune: HEAD has the full catalogue's rows.
const langs = fs.readdirSync(I18N).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
let restored = 0, langsTouched = 0

for (const lang of langs) {
  const rel = `catalogue/i18n/${lang}.json`
  let original
  try {
    original = execFileSync('git', ['show', `HEAD:${rel.replace(/\\/g, '/')}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  } catch {
    console.log(`  ${lang}: not in HEAD, skipped`)
    continue
  }
  const rows = JSON.parse(original)
  const current = JSON.parse(fs.readFileSync(path.join(I18N, lang + '.json'), 'utf8'))
  let added = 0
  for (const [id, row] of Object.entries(rows)) {
    if (!fxIds.has(id) || id in current) continue
    current[id] = row
    added++
  }
  if (added) {
    fs.writeFileSync(path.join(I18N, lang + '.json'), JSON.stringify(current, null, 1) + '\n')
    console.log(`  ${lang}: +${added} row(s)`)
    restored += added
    langsTouched++
  }
}

console.log(`\nrestored ${restored} i18n row(s) across ${langsTouched} language file(s)`)
console.log('next:  node scripts/build-test-catalogue.mjs')

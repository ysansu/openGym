#!/usr/bin/env node
// Restores the v1.3 catalogue — the 1,324 exercises openGym shipped before v1.4.0 — as test
// fixtures, without their media.
//
//   node scripts/restore-legacy-fixtures.mjs
//
// Why: two suites pin the v1.3 catalogue by id.
//   - pt-br-instructions.test.js (and its zh-TW / ar siblings) assert every legacy id has a
//     translated instruction pack, because that is what "the v1.3 catalogue was translated
//     in full" means. It reads catalogue-v13-ids.json and fails on the first id missing.
//   - exercise-names.test.js walks every language pack over the ids the pack claims.
//
// The legacy exercises carry no media in the fixture set on purpose: nothing in those
// suites reads a still or a clip, and 1,324 pairs would put ~180 MB of gitignored files
// back on disk for no test's benefit.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAT = path.join(ROOT, 'catalogue')
const FX = path.join(CAT, 'test-fixtures')
const I18N = path.join(CAT, 'i18n')
const V13 = path.join(ROOT, 'frontend/src/lib/catalogue-v13-ids.json')

if (!fs.existsSync(path.join(ROOT, '.git'))) {
  console.error('no .git here: the legacy catalogue comes from git history')
  process.exit(1)
}

const legacy = JSON.parse(fs.readFileSync(V13, 'utf8'))
const have = new Set(fs.existsSync(FX) ? fs.readdirSync(FX).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : [])
const wanted = legacy.filter(id => !have.has(id))
console.log(`v1.3 catalogue: ${legacy.length} exercises`)
console.log(`already restored as fixtures: ${have.size}`)
console.log(`to restore now: ${wanted.length}`)

// The exercise files, from the commit before the prune. HEAD is the pruned tree, so ask git
// for the parent's copy of each path.
let restored = 0, missing = 0
for (const id of wanted) {
  const rel = `catalogue/exercises/${id}.json`
  let body
  try {
    body = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 })
  } catch {
    missing++
    continue
  }
  fs.mkdirSync(FX, { recursive: true })
  fs.writeFileSync(path.join(FX, id + '.json'), body)
  restored++
}
console.log(`restored ${restored} legacy exercise file(s)`)
if (missing) console.log(`${missing} were not in HEAD (already pruned before this commit)`)

// Their i18n rows, same source.
const langs = fs.readdirSync(I18N).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
const wantSet = new Set(wanted)
let rows = 0, langsTouched = 0
for (const lang of langs) {
  const rel = `catalogue/i18n/${lang}.json`
  let original
  try {
    original = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  } catch { continue }
  const rowsAll = JSON.parse(original)
  const current = JSON.parse(fs.readFileSync(path.join(I18N, lang + '.json'), 'utf8'))
  let added = 0
  for (const [id, row] of Object.entries(rowsAll)) {
    if (!wantSet.has(id) || id in current) continue
    current[id] = row
    added++
  }
  if (added) {
    fs.writeFileSync(path.join(I18N, lang + '.json'), JSON.stringify(current, null, 1) + '\n')
    rows += added
    langsTouched++
  }
}
console.log(`restored ${rows} i18n row(s) across ${langsTouched} language file(s)`)
console.log('\nnext:  node scripts/build-test-catalogue.mjs')

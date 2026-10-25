#!/usr/bin/env node
// Builds the test-only exercise dataset: the app's pruned catalogue plus the fixtures the
// test suite needs, with their translations.
//
//   node scripts/build-test-catalogue.mjs
//
// Why this exists
// ---------------
// The catalogue is pruned to the owner's 19 exercises (scripts/catalogue/prune.mjs) so the
// app and the APK stay small. The test suite was written against the full 6,554, though:
// its fixtures name specific exercises because each one drives a different branch of the
// training logic — a barbell lift for the 2.5 kg step, a leverage machine for the
// assisted-load rule, cardio for time-and-speed logging, and the language packs that
// exercise-names.test.js and pt-br-instructions.test.js walk end to end.
//
// So the fixtures live in catalogue/test-fixtures/ and catalogue/i18n/ keeps their rows
// (scripts/restore-test-fixtures.mjs, scripts/restore-test-i18n.mjs). This script emits:
//
//   frontend/src/lib/exercises-test-data.js   EXDB + EXALIAS, app catalogue + fixtures
//   frontend/src/instr/<lang>.js              instructions, same packs the app's build makes
//   frontend/src/exercise-names/<lang>.js     translated names
//   frontend/src/exercise-desc/<lang>.js      descriptions
//
// vitest aliases exercises-data.js to the first of those (frontend/vite.config.js), and the
// i18n packs are only written when they differ from the app's own, so a plain
// `node scripts/catalogue/build.mjs` still produces exactly what ships. Production code is
// untouched and the bundle still carries 19 exercises.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCatalogue } from './catalogue/validate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAT = path.join(ROOT, 'catalogue')
const EX = path.join(CAT, 'exercises')
const FX = path.join(CAT, 'test-fixtures')
const MEDIA = path.join(CAT, 'media')
const MEDIA_FX = path.join(CAT, 'media-fixtures')
const SRC = path.join(ROOT, 'frontend/src')
const OUT = path.join(SRC, 'lib/exercises-test-data.js')

if (!fs.existsSync(FX)) {
  console.error('catalogue/test-fixtures/ does not exist.')
  console.error('Restore it first:  node scripts/restore-test-fixtures.mjs')
  process.exit(1)
}

// The app's own exercises, validated exactly as the shipping build validates them.
const app = validateCatalogue(CAT)
if (app.problems.length) {
  console.error('the app catalogue does not validate:\n' + app.problems.join('\n'))
  process.exit(1)
}

// The fixtures. They are upstream data kept as it came, so the vocabulary checks the app's
// own entries must pass are reported rather than enforced — a fixture naming a body part the
// app has never drawn is the point of the fixture.
const fxIds = new Set(fs.readdirSync(FX).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))

// A fixture may name a drawing that is not itself a fixture (an exercise whose female figure
// no test happens to mention). The chain has to resolve: catalogue-continuity.test.js walks
// every fv/mv and fails on the first one that points at nothing. So follow the links out of
// the archive until the set is closed. An id the app's own catalogue already has needs no
// file here — it resolves through exercises/ instead.
const readExercise = id => {
  for (const dir of [FX, EX]) {
    const p = path.join(dir, id + '.json')
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  const arch = path.join(ROOT, 'catalogue/exercises-archive', id + '.json')
  if (fs.existsSync(arch)) return JSON.parse(fs.readFileSync(arch, 'utf8'))
  return null
}
const resolved = new Set()   // ids that resolve, wherever they live
let restored = 0
for (let guard = 0; guard < 10000; guard++) {
  const missing = new Set()
  for (const id of [...fxIds, ...resolved]) {
    const e = readExercise(id)
    if (!e) continue
    for (const key of ['femaleVariant', 'maleVariant', 'variantOf']) {
      const to = e[key]
      if (to && !fxIds.has(to) && !resolved.has(to)) missing.add(to)
    }
  }
  if (!missing.size) break
  let added = 0
  for (const id of missing) {
    if (fs.existsSync(path.join(EX, id + '.json'))) { resolved.add(id); added++; continue }
    const arch = path.join(ROOT, 'catalogue/exercises-archive', id + '.json')
    if (!fs.existsSync(arch)) continue
    fs.copyFileSync(arch, path.join(FX, id + '.json'))
    fxIds.add(id)
    added++
  }
  if (!added) break
  restored++
}
if (restored) console.log(`variant chain closed: +${restored} drawing(s) restored into test-fixtures/`)

const fixtures = [...fxIds].map(id => JSON.parse(fs.readFileSync(path.join(FX, id + '.json'), 'utf8')))

const byId = new Map(app.exercises.map(e => [e.id, e]))
const added = []
for (const e of fixtures) {
  if (byId.has(e.id)) continue
  byId.set(e.id, e)
  added.push(e)
}

const all = [...byId.values()]
const rows = all
  .filter(e => !e.variantOf)
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
  .map(e => {
    const row = {
      id: e.id, n: e.name, bp: e.bodyPart, eq: e.equipment, tg: e.target,
      mg: e.secondaryMuscles[0] || '', sm: e.secondaryMuscles,
      img: e.id + '.webp', gif: e.id + '.mp4',
    }
    if (e.category) row.cat = e.category
    if (e.femaleVariant) row.fv = e.femaleVariant
    if (e.maleVariant) row.mv = e.maleVariant
    return row
  })

// An alias only helps if the exercise it points at is present; drop the rest so an id can
// never resolve to something missing.
const alias = {}
for (const e of all) {
  if (e.variantOf && byId.has(e.variantOf)) alias[e.id] = e.variantOf
}

// The muscle-map corrections, the same file build.mjs emits but over the whole test set.
// build.mjs writes it from catalogue/exercises/ only, so under a pruned catalogue it holds
// the 9 corrections the app's own 19 exercises carry — and the suites that pin the reviewed
// map for a barbell bench press or a leg press would read a file that has never heard of
// them. Written only when it differs, so the app's own copy is untouched.
const muscleMap = {}
for (const e of all) {
  if (!e.muscleMap) continue
  const m = e.muscleMap
  muscleMap[e.id] = {
    ...(m.bodyPart ? { bp: m.bodyPart } : {}),
    ...(m.primaries ? { primaries: m.primaries } : {}),
    ...(m.secondaries ? { secondaries: m.secondaries } : {}),
    ...(m.weights ? { muscleWeights: m.weights } : {}),
  }
}
const muscleMapBody = JSON.stringify(muscleMap, null, 1) + '\n'
const muscleMapPath = path.join(SRC, 'lib/exercise-muscle-map.json')
if (fs.existsSync(muscleMapPath) && fs.readFileSync(muscleMapPath, 'utf8') !== muscleMapBody) {
  fs.writeFileSync(muscleMapPath, muscleMapBody)
  console.log(`muscle-map corrections: ${Object.keys(muscleMap).length} (rewritten for the test set)`)
} else if (!fs.existsSync(muscleMapPath)) {
  fs.writeFileSync(muscleMapPath, muscleMapBody)
  console.log(`muscle-map corrections: ${Object.keys(muscleMap).length}`)
} else {
  console.log(`muscle-map corrections: ${Object.keys(muscleMap).length} (unchanged)`)
}

const header = '// generated by scripts/build-test-catalogue.mjs — the app catalogue plus test fixtures. do not edit\n'
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, header + 'export const EXDB=' + JSON.stringify(rows) + '\n' +
  'export const EXALIAS=' + JSON.stringify(alias) + '\n')

console.log(`app exercises:      ${app.exercises.filter(e => !e.variantOf).length}`)
console.log(`test fixtures:      ${added.length}`)
console.log(`total in test data: ${rows.length} exercises, ${Object.keys(alias).length} aliases`)

// The i18n packs, for every exercise in the test set. Written only when they differ from
// what the app's own build produced, so the app bundle is never touched by a test build.
const pack = obj => header + 'export default ' + JSON.stringify(obj) + '\n'
const byIdPick = pick => Object.fromEntries(all.filter(e => !e.variantOf).map(e => [e.id, pick(e)]).filter(([, v]) => v && (!Array.isArray(v) || v.length)))
const writeIfDifferent = (rel, body) => {
  const p = path.join(SRC, rel)
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
  if (cur === body) return false
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
  return true
}

let changed = 0
if (writeIfDifferent('instr/en.js', pack(byIdPick(e => e.instructions)))) changed++
if (writeIfDifferent('exercise-desc/en.js', pack(byIdPick(e => e.description)))) changed++

for (const [lang, rowsOf] of Object.entries(app.i18n)) {
  const kept = Object.fromEntries(Object.entries(rowsOf).filter(([id]) => byId.has(id)))
  const pick = key => Object.fromEntries(Object.entries(kept).filter(([, r]) => r[key] && (!Array.isArray(r[key]) || r[key].length)).map(([id, r]) => [id, r[key]]))
  const instr = pick('instructions'), names = pick('name'), desc = pick('description')
  if (Object.keys(instr).length && writeIfDifferent(`instr/${lang}.js`, pack(instr))) changed++
  if (Object.keys(names).length && writeIfDifferent(`exercise-names/${lang}.js`, pack(names))) changed++
  if (Object.keys(desc).length && writeIfDifferent(`exercise-desc/${lang}.js`, pack(desc))) changed++
}
console.log(`i18n packs rewritten: ${changed}`)

// Media: the fixtures' stills and clips, restored beside the app's own so the dev server's
// /exercise-media middleware and any test that reads a file find them either way.
let copied = 0
for (const e of added) {
  for (const [dir, ext] of [['still', '.webp'], ['clip', '.mp4']]) {
    const from = path.join(MEDIA_FX, dir, e.id + ext)
    const to = path.join(MEDIA, dir, e.id + ext)
    if (fs.existsSync(from) && !fs.existsSync(to)) { fs.copyFileSync(from, to); copied++ }
  }
}
if (copied) console.log(`copied ${copied} fixture media file(s) into catalogue/media/ (gitignored)`)
console.log(`\nwrote ${path.relative(ROOT, OUT)}`)

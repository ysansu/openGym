#!/usr/bin/env node
// Restores the exercise fixtures the test suite needs out of the prune archive, into
// catalogue/test-fixtures/ and catalogue/media-fixtures/.
//
//   node scripts/restore-test-fixtures.mjs            # restore what the tests reference
//   node scripts/restore-test-fixtures.mjs --check    # report only
//
// The list of ids comes from the source itself: every 'NNNN' literal under frontend/src
// that no longer resolves in catalogue/exercises. That keeps the fixture set honest — an id
// a test stops naming is not kept, and one a new test starts naming is reported as missing
// so it can be added on purpose.
//
// catalogue/test-fixtures/ and catalogue/media-fixtures/ are gitignored: they are a working
// copy of upstream data kept for the tests, not part of the app's catalogue.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'frontend/src')
const CAT = path.join(ROOT, 'catalogue')
const EX = path.join(CAT, 'exercises')
const ARCH = path.join(CAT, 'exercises-archive')
const FX = path.join(CAT, 'test-fixtures')
const MEDIA_ARCH = path.join(CAT, 'media-archive')
const MEDIA_FX = path.join(CAT, 'media-fixtures')

const check = process.argv.includes('--check')

const keep = new Set(fs.readdirSync(EX).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))

// Some tests find an exercise by searching or walking the catalogue instead of naming its
// id, so a literal scan never sees them: search-typo.test.js asserts that first('sqat') is
// the plain "squat" and first('burpee') is the "burpee". Those go in extra-fixtures.json,
// with the reason, so the set stays complete on purpose rather than by accident.
const EXTRA = path.join(ROOT, 'extra-fixtures.json')
const extraList = fs.existsSync(EXTRA)
  ? Object.entries(JSON.parse(fs.readFileSync(EXTRA, 'utf8')))
      .filter(([id]) => /^\d{4,5}$/.test(id))
      .map(([id]) => id)
  : []
if (extraList.length) console.log(`extra fixtures listed on purpose: ${extraList.join(', ')}`)

// Every 4-digit quoted id literal in the source.
const files = []
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(js|jsx|json)$/.test(e.name)) files.push(p)
  }
}
walk(SRC)

const wanted = new Map()   // id -> first file that names it
for (const p of files) {
  const txt = fs.readFileSync(p, 'utf8')
  for (const m of txt.matchAll(/'(\d{4})'/g)) {
    const id = m[1]
    if (keep.has(id) || wanted.has(id)) continue
    wanted.set(id, path.relative(ROOT, p))
  }
}
// The ones listed on purpose, whether or not a literal names them.
for (const id of extraList) if (!keep.has(id) && !wanted.has(id)) wanted.set(id, 'extra-fixtures.json')

const have = [...wanted.keys()].filter(id => fs.existsSync(path.join(ARCH, id + '.json')))
const missing = [...wanted.keys()].filter(id => !fs.existsSync(path.join(ARCH, id + '.json')))

console.log(`ids named by the source but not in the app catalogue: ${wanted.size}`)
console.log(`  recoverable from the archive: ${have.length}`)
if (missing.length) {
  console.log(`  NOT in the archive (a fixture the suite made up, or already gone): ${missing.length}`)
  for (const id of missing) console.log(`    ${id}  first named in ${wanted.get(id)}`)
}

if (check) process.exit(0)

let nEx = 0, nMedia = 0
for (const id of have) {
  const from = path.join(ARCH, id + '.json')
  const to = path.join(FX, id + '.json')
  if (!fs.existsSync(to)) { fs.mkdirSync(FX, { recursive: true }); fs.copyFileSync(from, to); nEx++ }
  for (const [dir, ext] of [['still', '.webp'], ['clip', '.mp4']]) {
    const mf = path.join(MEDIA_ARCH, dir, id + ext)
    const mt = path.join(MEDIA_FX, dir, id + ext)
    if (fs.existsSync(mf) && !fs.existsSync(mt)) { fs.mkdirSync(path.dirname(mt), { recursive: true }); fs.copyFileSync(mf, mt); nMedia++ }
  }
}

console.log(`\nrestored ${nEx} exercise file(s) -> catalogue/test-fixtures/`)
console.log(`restored ${nMedia} media file(s)   -> catalogue/media-fixtures/`)
console.log('\nnext:  node scripts/build-test-catalogue.mjs')

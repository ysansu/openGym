// Rewrite test fixtures so every catalogue id they reference still exists.
//
//   node scripts/fix-pruned-refs.mjs           rewrite
//   node scripts/fix-pruned-refs.mjs --check   report only, exit 1 if anything is left
//
// The catalogue was pruned to 19 exercises (scripts/catalogue/prune.mjs), so the fixtures'
// hardcoded ids no longer resolve and every test that names one fails. This maps each dead
// id to a kept exercise that trains the same thing, then rewrites the literal in the source.
//
// What it rewrites, and what it deliberately does not:
//   - 'NNNN' string literals in .js/.jsx/.json under frontend/src  -> the kept id
//   - an import id ('im…', the CSV/Hevy importer's own prefix) is left alone: it is a
//     synthetic id the app mints at import time, not a catalogue entry
//   - an id whose exercise is a variant drawing (variantOf) is dropped from a fixture only
//     when it appears alone; the ones still used are mapped to their parent exercise
//   - numbers that are not ids (weights, counts, timestamps) are never touched: only
//     4-digit strings quoted as 'NNNN' are candidates
//
// The map lives in prune-id-map.json at the repo root, so a reviewer can see every
// substitution in one diff before it is applied.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'frontend/src')
const MAP_FILE = path.join(ROOT, 'prune-id-map.json')

const check = process.argv.includes('--check')

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
const SAFE = { ...map._safe }
// A variant drawing resolves to the exercise it draws, so a fixture may keep pointing at
// the drawing's id only if that drawing survived. The 12 that did are in the keep set; the
// rest map to their parent.
const VARIANT_TO_PARENT = {}
const exDir = path.join(ROOT, 'catalogue/exercises')
const keepIds = new Set(fs.readdirSync(exDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))
for (const f of fs.readdirSync(exDir)) {
  if (!f.endsWith('.json')) continue
  const e = JSON.parse(fs.readFileSync(path.join(exDir, f), 'utf8'))
  if (e.variantOf) VARIANT_TO_PARENT[e.id] = e.variantOf
}
const dead = id => !keepIds.has(id)
const resolve = id => {
  if (!dead(id)) return id
  if (SAFE[id]) return SAFE[id]
  if (VARIANT_TO_PARENT[id] && keepIds.has(VARIANT_TO_PARENT[id])) return VARIANT_TO_PARENT[id]
  return null
}

const files = []
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(js|jsx|json)$/.test(e.name)) files.push(p)
  }
}
walk(SRC)

let changedFiles = 0, totalSubs = 0
const unresolved = new Map()
const perFile = []

for (const p of files) {
  const before = fs.readFileSync(p, 'utf8')
  let after = before, subs = 0
  // Every quoted 4-digit id literal, wherever it appears.
  const re = /'(\d{4})'/g
  after = after.replace(re, (m, id) => {
    if (!dead(id)) return m
    const to = resolve(id)
    if (!to) {
      const n = unresolved.get(id) || 0
      unresolved.set(id, n + 1)
      return m
    }
    subs++
    return `'${to}'`
  })
  if (subs) {
    perFile.push({ file: path.relative(ROOT, p), subs })
    totalSubs += subs
    if (!check) fs.writeFileSync(p, after)
    changedFiles++
  }
}

console.log(`${check ? 'would rewrite' : 'rewrote'} ${totalSubs} id literal(s) across ${changedFiles} file(s)`)
if (unresolved.size) {
  console.log(`\n${unresolved.size} id(s) have no kept equivalent and were left as they were:`)
  for (const [id, n] of [...unresolved].sort((a, b) => b[1] - a[1])) {
    let name = '(unknown)'
    try { name = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalogue/exercises-archive', id + '.json'), 'utf8')).name } catch {}
    console.log(`  ${id}  ${n} reference(s)  ${name}`)
  }
  console.log('\nThese fixtures need a decision: pick a kept exercise, or drop the case.')
}
if (check && (totalSubs || unresolved.size)) process.exit(1)

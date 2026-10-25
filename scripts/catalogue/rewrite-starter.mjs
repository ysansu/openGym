// Rewrites the four starter plans so every exercise id they reference is one of the
// 19 kept catalogue exercises. The original barbell/machine lifts are replaced by their
// dumbbell equivalents (the user's own plan is dumbbell-only).
//
//   node scripts/catalogue/rewrite-starter.mjs
//
// Idempotent: running it twice makes no further change.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const STARTER = path.join(ROOT, 'frontend/src/lib/starter.js')

// The 19 kept catalogue exercises, by role.
const K = {
  legWarm: '1604',   // world great stretch
  catCow: '4580',    // cat cow stretch
  sldl: '1757',      // dumbbell single leg deadlift
  bulg: '2290',      // dumbbell bulgarian split squat
  goblet: '1760',    // dumbbell goblet squat
  rdl: '1459',       // dumbbell romanian deadlift
  hangRaise: '0472', // hanging leg raise
  shoulderCircle: '4395',
  dbBench: '0289',   // dumbbell bench press
  chestDip: '0251',
  crossover: '1269', // cable standing up straight crossovers
  dbIncline: '0314',
  cableY: '3342',    // cable y raise
  skull: '4151',     // dumbbell lying floor skullcrusher
  oneArmPd: '1204',  // cable one arm lat pulldown
  latPd: '2330',     // cable lat pulldown full range of motion
  row: '0861',       // cable seated row
  wideRow: '0218',   // cable seated wide-grip row
  cableCurl: '0868',
}

// Original id -> replacement, so a substitution is auditable and reversible.
const SUB = {
  '0025': K.dbBench,      // barbell bench press -> dumbbell bench press
  '0047': K.dbIncline,   // barbell incline bench press -> dumbbell incline bench press
  '0043': K.goblet,      // barbell full squat -> dumbbell goblet squat
  '0085': K.rdl,         // barbell romanian deadlift -> dumbbell romanian deadlift
  '0739': K.bulg,        // sled 45 leg press -> dumbbell bulgarian split squat
  '0585': K.sldl,        // lever leg extension -> dumbbell single leg deadlift
  '0586': K.bulg,        // lever lying leg curl -> dumbbell bulgarian split squat
  '0605': K.sldl,        // lever standing calf raise -> dumbbell single leg deadlift
  '0426': K.cableY,      // dumbbell standing overhead press -> cable y raise
  '0334': K.cableY,      // dumbbell lateral raise -> cable y raise
  '0241': K.skull,       // cable triceps pushdown -> dumbbell skullcrusher
  '0027': K.row,         // barbell bent over row -> cable seated row
  '1323': K.row,         // cable rope seated row -> cable seated row
  '0031': K.cableCurl,   // barbell curl -> cable curl
  '0313': K.cableCurl,   // dumbbell hammer curl -> cable curl
  '2330': K.latPd,       // kept
  '0251': K.chestDip,    // kept
}

let src = fs.readFileSync(STARTER, 'utf8')
const before = src

// Replace any occurrence of a dropped id inside a quoted string: '0025' -> '0289'.
for (const [from, to] of Object.entries(SUB)) {
  src = src.split(`'${from}'`).join(`'${to}'`)
}

if (src === before) {
  console.log('starter.js already rewritten — no change')
} else {
  fs.writeFileSync(STARTER, src)
  console.log('starter.js rewritten')
}

// Report what the file now references.
const used = [...new Set([...src.matchAll(/'(\d{4})'/g)].map(m => m[1]))].sort()
console.log(`\n${used.length} exercise ids referenced:`)
for (const id of used) {
  const kept = Object.values(K).includes(id)
  console.log(`  ${id}  ${kept ? 'kept' : '*** NOT IN KEEP SET ***'}`)
}
const bad = used.filter(id => !Object.values(K).includes(id))
if (bad.length) {
  console.error(`\nFAIL: ${bad.length} id(s) outside the keep set: ${bad.join(', ')}`)
  process.exit(1)
}
console.log('\nOK — every referenced id is in the keep set')

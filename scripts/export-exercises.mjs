#!/usr/bin/env node
// Exports catalogue exercises as .ogex files — one per exercise, animation and still included.
//
//   node scripts/export-exercises.mjs --ids 1757,1459
//   node scripts/export-exercises.mjs --all                     every exercise in catalogue/
//   node scripts/export-exercises.mjs --ids 1757 --out exports/
//   node scripts/export-exercises.mjs --all --out exports/ --zip
//
// The output is what frontend/src/lib/import-exercise.js reads, so a file exported here
// imports on a phone that never had the exercise: the pruned build ships 19, and this is how
// the other 6,523 travel to it.
//
// The media are read from catalogue/media (180 px, the only size that may leave the
// repository — catalogue/media/NOTICE.md). Nothing is re-encoded: the bytes that are in the
// repository are the bytes in the file.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAT = path.join(ROOT, 'catalogue')

const args = process.argv.slice(2)
const flag = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const has = name => args.includes(name)

const out = path.resolve(flag('--out', 'exports'))
const asZip = has('--zip')

let ids = []
if (has('--all')) {
  ids = fs.readdirSync(path.join(CAT, 'exercises')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
} else if (flag('--ids')) {
  ids = flag('--ids').split(',').map(s => s.trim()).filter(Boolean)
} else {
  console.error('say what to export:  --ids 1757,1459   or   --all')
  process.exit(1)
}

// A variant drawing is not an exercise of its own; export the exercise it draws instead.
const isVariant = id => {
  const p = path.join(CAT, 'exercises', id + '.json')
  return fs.existsSync(p) ? !!JSON.parse(fs.readFileSync(p, 'utf8')).variantOf : false
}

const b64 = file => fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null

let written = 0, skipped = 0, missingMedia = 0
fs.mkdirSync(out, { recursive: true })

for (const id of ids) {
  if (isVariant(id)) { skipped++; continue }
  const exPath = path.join(CAT, 'exercises', id + '.json')
  if (!fs.existsSync(exPath)) { console.error(`${id}: not in catalogue/exercises/`); skipped++; continue }
  const e = JSON.parse(fs.readFileSync(exPath, 'utf8'))
  const clip = b64(path.join(CAT, 'media/clip', id + '.mp4'))
  const still = b64(path.join(CAT, 'media/still', id + '.webp'))
  if (!clip && !still) missingMedia++
  const doc = {
    opengym_exercise: 1,
    id: e.id,
    name: e.name,
    bodyPart: e.bodyPart,
    equipment: e.equipment,
    ...(e.target ? { target: e.target } : {}),
    ...(e.secondaryMuscles?.length ? { secondaryMuscles: e.secondaryMuscles } : {}),
    ...(e.category ? { category: e.category } : {}),
    ...(e.description ? { description: e.description } : {}),
    ...(e.instructions?.length ? { instructions: e.instructions } : {}),
    ...((clip || still) ? { media: { ...(clip ? { clip } : {}), ...(still ? { still } : {}) } } : {}),
  }
  fs.writeFileSync(path.join(out, `${id}.ogex`), JSON.stringify(doc))
  written++
}

console.log(`wrote ${written} .ogex file(s) -> ${path.relative(ROOT, out) || out}`)
if (skipped) console.log(`skipped ${skipped} (variant drawings, or not in the catalogue)`)
if (missingMedia) console.log(`${missingMedia} without media (no still or animation in catalogue/media)`)

if (asZip && written) {
  // zip is not in node's stdlib; use PowerShell's, which is on every Windows box, or `zip`
  // elsewhere. Kept as one call so a failure is visible rather than silent.
  const zip = path.resolve(out + '.zip')
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-Command',
        `Compress-Archive -Path '${out}\\*.ogex' -DestinationPath '${zip}' -Force`], { stdio: 'ignore' })
    } else {
      execFileSync('zip', ['-j', '-q', zip, ...fs.readdirSync(out).map(f => path.join(out, f))], { stdio: 'ignore' })
    }
    console.log(`zipped -> ${path.relative(ROOT, zip)}`)
  } catch (e) {
    console.error('could not zip: ' + e.message)
  }
}

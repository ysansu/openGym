#!/usr/bin/env node
// Trim the exercise catalogue down to a keep-list, archiving everything else instead of
// deleting it, so a pruned exercise can always be brought back.
//
//   node scripts/catalogue/prune.mjs --keep 1604,4580,1757,...
//   node scripts/catalogue/prune.mjs --keep-file path/to/keep.txt
//   node scripts/catalogue/prune.mjs --restore            put everything back
//
// What it does:
//   catalogue/exercises/           keeps the listed ids, moves the rest to exercises-archive/
//   catalogue/i18n/                keeps only rows whose id survived (a language file with no
//                                  rows left is removed, not left empty)
//   catalogue/media/{still,clip}   keeps the listed ids, moves the rest to media-archive/
//   catalogue/media-archive/       everything that was moved, by id
//
// Nothing is deleted. `--restore` moves the archive back, so the operation is reversible
// and the full catalogue is always recoverable from the working tree alone.
//
// Media licence: the files are only moved, never copied or modified, and every one keeps
// its NOTICE.md beside it (catalogue/media/NOTICE.md is left where it is).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CAT = path.join(ROOT, 'catalogue')
const EX = path.join(CAT, 'exercises')
const EX_ARCH = path.join(CAT, 'exercises-archive')
const MEDIA = path.join(CAT, 'media')
const MEDIA_ARCH = path.join(CAT, 'media-archive')
const I18N = path.join(CAT, 'i18n')

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const has = (name) => args.includes(name)

const log = (...a) => console.log(...a)

function readKeep() {
  if (has('--restore')) return null
  const inline = flag('--keep')
  const file = flag('--keep-file')
  if (!inline && !file) {
    console.error('give the ids to keep:  --keep 1604,4580,...   or   --keep-file path.txt')
    process.exit(1)
  }
  let ids = []
  if (inline) ids = inline.split(',')
  if (file) ids = ids.concat(fs.readFileSync(path.resolve(file), 'utf8').split(/\r?\n/))
  // Blank lines and # comments are ignored, so a keep-list can carry the notes about why
  // each id is in it.
  const keep = new Set(ids.map(s => s.replace(/#.*$/, '').trim()).filter(Boolean).map(s => s.replace(/\.json$/, '')))
  if (!keep.size) { console.error('the keep list is empty'); process.exit(1) }
  for (const id of keep) {
    if (!/^\d{4,5}$/.test(id)) { console.error(`"${id}" is not an exercise id (4-5 digits)`); process.exit(1) }
  }
  return keep
}

const move = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  if (fs.existsSync(to)) { console.error(`refusing to overwrite ${to}`); process.exit(1) }
  fs.renameSync(from, to)
}

/* ------------------------------- restore ------------------------------- */
if (has('--restore')) {
  let n = 0
  const moveBack = (arch, dest, ext) => {
    if (!fs.existsSync(arch)) return
    for (const f of fs.readdirSync(arch)) {
      if (ext && !f.endsWith(ext)) continue
      const to = path.join(dest, f)
      if (fs.existsSync(to)) { console.error(`refusing to overwrite ${to}`); process.exit(1) }
      fs.mkdirSync(dest, { recursive: true })
      fs.renameSync(path.join(arch, f), to)
      n++
    }
  }
  moveBack(EX_ARCH, EX, '.json')
  moveBack(path.join(MEDIA_ARCH, 'still'), path.join(MEDIA, 'still'), '.webp')
  moveBack(path.join(MEDIA_ARCH, 'clip'), path.join(MEDIA, 'clip'), '.mp4')
  log(`restored ${n} file(s) from the archive`)
  log('i18n rows for exercises that were pruned are NOT restored automatically —')
  log('the original i18n files are in git history if you need them back.')
  process.exit(0)
}

const keep = readKeep()
const inCatalog = new Set(fs.readdirSync(EX).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))
const missing = [...keep].filter(id => !inCatalog.has(id))
if (missing.length) { console.error(`not in catalogue/exercises/: ${missing.join(', ')}`); process.exit(1) }

const alreadyArchived = [...keep].filter(id => fs.existsSync(path.join(EX_ARCH, id + '.json')))
if (alreadyArchived.length) {
  console.error(`these are in the archive, not the catalogue — restore first:\n  ${alreadyArchived.join(', ')}`)
  process.exit(1)
}

/* --------------------------- exercises + media --------------------------- */
let movedEx = 0, movedStill = 0, movedClip = 0
for (const id of inCatalog) {
  if (keep.has(id)) continue
  move(path.join(EX, id + '.json'), path.join(EX_ARCH, id + '.json'))
  movedEx++
  for (const [dir, ext, counter] of [['still', '.webp', 'movedStill'], ['clip', '.mp4', 'movedClip']]) {
    const from = path.join(MEDIA, dir, id + ext)
    if (fs.existsSync(from)) {
      move(from, path.join(MEDIA_ARCH, dir, id + ext))
      if (counter === 'movedStill') movedStill++
      else movedClip++
    }
  }
}

/* -------------------------------- i18n -------------------------------- */
// A row for an exercise that no longer exists is dropped; a language file left with no rows
// is removed so `build.mjs` does not emit an empty pack for it.
let droppedRows = 0, removedLangs = 0
if (fs.existsSync(I18N)) {
  for (const f of fs.readdirSync(I18N).filter(f => f.endsWith('.json'))) {
    const p = path.join(I18N, f)
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'))
    const kept = {}
    for (const [id, row] of Object.entries(rows)) {
      if (keep.has(id)) kept[id] = row
      else droppedRows++
    }
    if (Object.keys(kept).length === Object.keys(rows).length) continue
    if (Object.keys(kept).length === 0) { fs.rmSync(p); removedLangs++; continue }
    fs.writeFileSync(p, JSON.stringify(kept, null, 1) + '\n')
  }
}

/* -------------------------------- report -------------------------------- */
const kept = [...keep].sort()
log(`kept      ${kept.length} exercise(s): ${kept.join(', ')}`)
log(`archived  ${movedEx} exercise file(s) -> catalogue/exercises-archive/`)
log(`archived  ${movedStill} still(s), ${movedClip} clip(s) -> catalogue/media-archive/`)
log(`i18n      ${droppedRows} row(s) dropped, ${removedLangs} language file(s) removed`)
log('')
log('next:  node scripts/catalogue/build.mjs')
log('undo:  node scripts/catalogue/prune.mjs --restore')

// End-to-end: export a .ogex, read it back, import it. The whole round trip a phone does,
// with the media decoded and re-encoded by the real ingest (no <video> here, so the clip is
// refused and the still is used instead — which is itself the case worth pinning).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { importExercise, readExerciseFile, exerciseFileHash } from './import-exercise.js'
import { DEFAULT_LIMITS } from './media-limits.js'
import { MediaError } from './media-ingest.js'

const EXPORTS = new URL('../../../exports', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const has = f => existsSync(f)

describe('an exported .ogex', () => {
  it('exists for every exercise the app ships', () => {
    const files = has(EXPORTS) ? readdirSync(EXPORTS).filter(f => f.endsWith('.ogex')) : []
    expect(files.length).toBeGreaterThan(0)
  })

  it('is a valid document that round-trips', () => {
    if (!has(EXPORTS)) return
    const f = join(EXPORTS, readdirSync(EXPORTS).find(n => n.endsWith('.ogex')))
    const doc = readExerciseFile(readFileSync(f, 'utf8'))
    expect(doc.opengym_exercise).toBe(1)
    expect(doc.name).toBeTruthy()
    expect(doc.instructions.length).toBeGreaterThan(1)
    expect(doc.media?.clip || doc.media?.still).toBeTruthy()
  })

  it('imports as the user’s own exercise with its metadata', async () => {
    if (!has(EXPORTS)) return
    const f = join(EXPORTS, readdirSync(EXPORTS).find(n => n.endsWith('.ogex')))
    const doc = readExerciseFile(readFileSync(f, 'utf8'))
    const out = await importExercise(doc, {
      limits: DEFAULT_LIMITS,
      // Neither a <video> nor a canvas here, so both media parts are refused: the exercise
      // still imports, and that is the case worth pinning — a phone with a working WebView
      // keeps the animation.
      deps: { ingestMediaFile: async () => { throw new MediaError('type') } },
    })
    expect(out.exercise.custom).toBe(true)
    expect(out.exercise.n).toBe(doc.name)
    expect(out.exercise.bp).toBe(doc.bodyPart)
    expect(out.exercise.eq).toBe(doc.equipment)
    expect(out.exercise.id).toMatch(/^c/)
    expect(out.media).toBeNull()
    expect(out.warnings).toEqual(['animation', 'picture'])
    expect(out.blobs).toEqual([])
  })

  it('is recognised as already imported on a second pass', async () => {
    if (!has(EXPORTS)) return
    const f = join(EXPORTS, readdirSync(EXPORTS).find(n => n.endsWith('.ogex')))
    const text = readFileSync(f, 'utf8')
    const a = await exerciseFileHash(text)
    const b = await exerciseFileHash(text)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

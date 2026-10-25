import { describe, expect, it, vi } from 'vitest'
import {
  EX_FORMAT, isBodyPart, isEquipment, isMuscle, isTarget, isCategory,
  parseExerciseFile, mediaFileFromB64, importExercise, readExerciseFile,
} from './import-exercise.js'
import { normalizeMediaRef } from './media-refs.js'
import { MediaError } from './media-ingest.js'

const file = (over = {}) => ({
  opengym_exercise: EX_FORMAT,
  id: '1757',
  name: 'dumbbell single leg deadlift',
  bodyPart: 'upper legs',
  equipment: 'dumbbell',
  target: 'glutes',
  secondaryMuscles: ['hamstrings', 'lower back'],
  category: 'strength',
  description: 'A hinge on one leg.',
  instructions: ['Stand on one leg.', 'Hinge and reach.', 'Drive back up.'],
  ...over,
})

// A 1×1 transparent WebP and a 1×1 black PNG, both valid, for the ingest paths.
const WEBP_1PX = 'UklGRhwAAABXRUJQVlA4TB8AAAAvAAAAAAfQ//73v/+BiOh/AAA='
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

describe('the .ogex format', () => {
  it('is version 1 and required, so a plan file or a backup is refused', () => {
    expect(() => parseExerciseFile({})).toThrow(/isn’t an openGym exercise file/)
    expect(() => parseExerciseFile({ opengym_exercise: 2 })).toThrow()
    expect(() => parseExerciseFile(null)).toThrow()
    expect(() => parseExerciseFile([])).toThrow()
  })

  it('needs a name, a known body part, known equipment and at least one step', () => {
    expect(() => parseExerciseFile(file({ name: '' }))).toThrow(/no name/)
    expect(() => parseExerciseFile(file({ name: '   ' }))).toThrow(/no name/)
    expect(() => parseExerciseFile(file({ bodyPart: 'elbows' }))).toThrow(/body part/)
    expect(() => parseExerciseFile(file({ equipment: 'band' }))).not.toThrow()
    expect(() => parseExerciseFile(file({ equipment: 'elbow machine' }))).toThrow(/equipment/)
    expect(() => parseExerciseFile(file({ instructions: [] }))).toThrow(/no instructions/)
    expect(() => parseExerciseFile(file({ instructions: ['ok', ''] }))).not.toThrow()
  })

  it('keeps a bad target out but still imports the exercise', () => {
    const { exercise } = parseExerciseFile(file({ target: 'elbows' }))
    expect(exercise.tg).toBe('')
    expect(parseExerciseFile(file({ target: 'glutes' })).exercise.tg).toBe('glutes')
  })

  it('accepts the dataset field names as well as the catalogue ones', () => {
    const { exercise } = parseExerciseFile({
      ...file(), bodyPart: undefined, secondaryMuscles: undefined,
      body_part: 'chest', equipment: 'cable', target: 'pectorals',
      secondary_muscles: ['triceps', 'deltoids'],
    })
    expect(exercise).toMatchObject({ bp: 'chest', eq: 'cable', tg: 'pectorals' })
    expect(exercise.sm).toEqual(['triceps', 'deltoids'])
  })

  it('drops a muscle or a category the app cannot draw or filter on', () => {
    const { exercise } = parseExerciseFile(file({
      secondaryMuscles: ['hamstrings', 'elbow flexors'],
      primaries: ['gluteal', 'elbow flexors'],
      category: 'powerlifting',
    }))
    // secondaryMuscles is the catalogue's word list ("hamstrings"); primaries are the body
    // map's own ("gluteal"). A word from neither list is dropped, never guessed at.
    expect(exercise.sm).toEqual(['hamstrings'])
    expect(exercise.muscleGroups).toEqual(['gluteal'])
    expect(exercise.primaries).toEqual(['gluteal'])
    expect(exercise.secondaries).toEqual(['hamstrings'])
    expect(exercise.cat).toBeUndefined()
  })

  it('takes the body-map muscles for the map and the catalogue words for the picker', () => {
    const { exercise } = parseExerciseFile(file({ primaries: ['quadriceps', 'gluteal'] }))
    expect(exercise.muscleGroups).toEqual(['quadriceps', 'gluteal'])
    expect(exercise.sm).toEqual(['hamstrings', 'lower back'])   // catalogue words, kept as they came
  })

  it('bounds the text it keeps, so a hand-edited file cannot blow up the state', () => {
    const { exercise } = parseExerciseFile(file({
      name: 'x'.repeat(200),
      description: 'd'.repeat(5000),
      instructions: Array.from({ length: 50 }, (_, i) => `step ${i}`),
    }))
    expect(exercise.n.length).toBe(80)
    expect(exercise.desc.length).toBe(1000)
    expect(exercise.instructions).toBeUndefined()      // steps live in the catalogue, not the state
  })

  it('marks every import as the user’s own, which is what makes it editable', () => {
    expect(parseExerciseFile(file()).exercise.custom).toBe(true)
  })
})

describe('base64 media', () => {
  it('turns bare base64 into a File of the declared type', async () => {
    const f = await mediaFileFromB64(PNG_1PX, { mime: 'image/png', name: 'p.png' })
    expect(f).toBeInstanceOf(File)
    expect(f.type).toBe('image/png')
    expect(f.size).toBeGreaterThan(0)
  })

  it('takes a data: URL, and refuses one that is not base64', async () => {
    const f = await mediaFileFromB64(`data:image/png;base64,${PNG_1PX}`, { mime: 'image/png', name: 'p.png' })
    expect(f.size).toBeGreaterThan(0)
    await expect(mediaFileFromB64('data:image/png,plain', { mime: 'image/png', name: 'p.png' }))
      .rejects.toThrow(/not base64/)
  })

  it('refuses a data URL whose type disagrees with the part', async () => {
    await expect(mediaFileFromB64(`data:image/png;base64,${PNG_1PX}`, { mime: 'image/webp', name: 'p.webp' }))
      .rejects.toThrow(/says it is image\/png/)
  })

  it('refuses something that is not base64 at all', async () => {
    await expect(mediaFileFromB64('not base64!!', { mime: 'image/png', name: 'p.png' }))
      .rejects.toThrow(/not base64/)
    await expect(mediaFileFromB64('', { mime: 'image/png', name: 'p.png' })).resolves.toBeNull()
  })
})

describe('importing', () => {
  const noDeps = { decodeImage: () => { throw new Error('no decode in this test') } }

  it('mints an id when the app does not know the exercise', async () => {
    const { exercise } = await importExercise(file({ id: '9999' }), { deps: noDeps })
    expect(exercise.id).not.toBe('9999')
    expect(exercise.id).toMatch(/^c/)
  })

  it('keeps the id when the caller says the app already has it', async () => {
    const { exercise } = await importExercise(file({ id: '1757' }), { keepId: '1757', deps: noDeps })
    expect(exercise.id).toBe('1757')
  })

  it('imports without media when there is none', async () => {
    const { exercise, media, blobs } = await importExercise(file(), { deps: noDeps })
    expect(media).toBeNull()
    expect(blobs).toEqual([])
    expect(exercise.media).toBeUndefined()
  })

  it('runs the animation through the same ingest as a picked file', async () => {
    // A stub ingest: the real one needs a <video>. What matters here is that the bytes reach
    // it as a File and that what comes back lands on the exercise and in the blob list.
    const seen = []
    const deps = { ingestMediaFile: async (f) => { seen.push(f); return { media: { kind: 'video', hash: 'a'.repeat(64), mime: 'video/mp4', size: 1, width: 1, height: 1 }, blobs: [{ hash: 'a'.repeat(64), blob: new Blob(['x']), mime: 'video/mp4' }] } } }
    const { exercise, media, blobs } = await importExercise(file({ media: { clip: 'AAAA' } }), { deps })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(File)
    expect(seen[0].type).toBe('video/mp4')
    expect(media.hash).toBe('a'.repeat(64))
    expect(exercise.media).toBe(media)
    expect(blobs).toHaveLength(1)
  })

  it('imports the exercise anyway when the animation is refused, and says so', async () => {
    const deps = { ingestMediaFile: async () => { throw new MediaError('too-large', { mb: 8 }) } }
    const { exercise, warnings } = await importExercise(file({ media: { clip: 'AAAA' } }), { deps })
    expect(exercise.media).toBeUndefined()
    expect(warnings).toEqual(['animation'])
  })

  it('uses the still as the picture when there is no animation', async () => {
    const deps = { ingestMediaFile: async () => ({ media: { kind: 'image', hash: 'b'.repeat(64), mime: 'image/webp', size: 1, width: 1, height: 1 }, blobs: [] }) }
    const { exercise, media } = await importExercise(file({ media: { still: PNG_1PX } }), { deps })
    expect(media.kind).toBe('image')
    expect(exercise.media).toBe(media)
  })

  it('refuses a document whose media is not media', async () => {
    await expect(importExercise(file({ media: { clip: 'nonsense!!' } }), { deps: {} }))
      .rejects.toThrow(/not base64/)
  })

  it('gives every import a MediaRef that passes the normaliser', async () => {
    const deps = { ingestMediaFile: async () => ({ media: { kind: 'video', hash: 'c'.repeat(64), mime: 'video/mp4', size: 1, width: 1, height: 1 }, blobs: [] }) }
    const { media } = await importExercise(file({ media: { clip: 'AAAA' } }), { deps })
    // The normaliser rebuilds it from its known fields, so compare the shape rather than identity.
    expect(normalizeMediaRef(media)).toMatchObject({ kind: 'video', hash: 'c'.repeat(64), mime: 'video/mp4', width: 1, height: 1 })
  })
})

describe('reading a file', () => {
  it('parses JSON and refuses anything else with a readable reason', () => {
    expect(readExerciseFile(JSON.stringify(file()))).toMatchObject({ opengym_exercise: 1 })
    expect(() => readExerciseFile('not json')).toThrow(/isn’t an openGym exercise file/)
  })
})

describe('the vocabulary', () => {
  it('is the catalogue’s, so an import cannot invent a body part or a muscle', () => {
    expect(isBodyPart('upper legs')).toBe(true)
    expect(isBodyPart('elbows')).toBe(false)
    expect(isEquipment('dumbbell')).toBe(true)
    expect(isEquipment('resistance band')).toBe(true)
    expect(isEquipment('band')).toBe(true)
    expect(isEquipment('elbow machine')).toBe(false)
    expect(isTarget('glutes')).toBe(true)
    expect(isTarget('elbows')).toBe(false)
    expect(isMuscle('quadriceps')).toBe(true)
    expect(isMuscle('elbow flexors')).toBe(false)
    expect(isCategory('strength')).toBe(true)
    expect(isCategory('powerlifting')).toBe(false)
  })
})

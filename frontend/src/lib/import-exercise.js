/* Importing one exercise from a .ogex file.
 *
 * An .ogex file is a single JSON document holding one exercise and, optionally, its animation
 * and still as base64. It is the unit the catalogue is meant to travel in: a folder of
 * exercises (catalogue/exercises-archive/ after a prune, or the owner's own set) is exported
 * one file at a time, and importing one adds that exercise to the app with its media — which
 * is what makes a pruned build usable without rebuilding it.
 *
 *   {
 *     "opengym_exercise": 1,
 *     "id": "1757",
 *     "name": "dumbbell single leg deadlift",
 *     "bodyPart": "upper legs",
 *     "equipment": "dumbbell",
 *     "target": "glutes",
 *     "secondaryMuscles": ["hamstrings", "lower back"],
 *     "category": "strength",
 *     "description": "...",
 *     "instructions": ["...", "..."],
 *     "media": { "clip": "<base64 mp4>", "still": "<base64 webp>" }   // optional
 *   }
 *
 * An id is kept as it is when the app does not know it: the whole point is that a workout
 * logged against this exercise on another device resolves to the same exercise here. When the
 * app already has that id (its own catalogue, or an exercise imported earlier), the incoming
 * one is treated as an edit of what is there rather than a second copy.
 *
 * The media go through the same ingest as a file picked in the editor (lib/media-ingest.js),
 * so a video is scrubbed, probed and capped exactly as a picked one is, and the state keeps a
 * MediaRef rather than the bytes. A base64 blob that is not a video or an image is refused.
 */
import { normalizeMediaRef } from './media-refs.js'
import { ingestMediaFile, MediaError } from './media-ingest.js'
import { DEFAULT_LIMITS } from './media-limits.js'
import { sha256Hex } from './sha256.js'
import { uid } from './format.js'

export const EX_FORMAT = 1

// The body parts, equipment and muscles the app's own catalogue is allowed to use
// (scripts/catalogue/validate.mjs). An import is someone else's data, so a value outside
// these is kept out rather than drawn as an unknown chip.
const BODY_PARTS = ['back', 'cardio', 'chest', 'lower arms', 'lower legs', 'neck', 'shoulders', 'upper arms', 'upper legs', 'waist', 'full body']
const EQUIPMENT = ['body weight', 'dumbbell', 'cable', 'barbell', 'leverage machine', 'band', 'smith machine', 'kettlebell', 'weighted', 'stability ball', 'ez barbell', 'assisted', 'sled machine', 'medicine ball', 'rope', 'roller', 'resistance band', 'bosu ball', 'olympic barbell', 'wheel roller', 'upper body ergometer', 'skierg machine', 'hammer', 'stationary bike', 'tire', 'trap bar', 'elliptical machine', 'stepmill machine', 'suspension trainer', 'sandbag', 'landmine', 'weight plate', 'clubbell', 'macebell']
const TARGETS = ['abs', 'pectorals', 'biceps', 'glutes', 'delts', 'triceps', 'upper back', 'lats', 'calves', 'quads', 'forearms', 'cardiovascular system', 'hamstrings', 'spine', 'traps', 'adductors', 'serratus anterior', 'abductors', 'levator scapulae']
const SECONDARY = ['shoulders', 'deltoids', 'rear deltoids', 'rotator cuff', 'chest', 'upper chest', 'triceps', 'biceps', 'brachialis', 'forearms', 'wrists', 'wrist flexors', 'wrist extensors', 'grip muscles', 'back', 'upper back', 'lats', 'latissimus dorsi', 'rhomboids', 'trapezius', 'traps', 'lower back', 'core', 'abdominals', 'obliques', 'lower abs', 'hip flexors', 'glutes', 'quadriceps', 'hamstrings', 'adductors', 'inner thighs', 'groin', 'calves', 'soleus', 'shins', 'ankles', 'ankle stabilizers', 'feet', 'hands', 'sternocleidomastoid']
const MUSCLES = ['trapezius', 'deltoids', 'chest', 'upper-back', 'serratus', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'lower-back', 'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis']
const CATEGORIES = ['strength', 'stretching', 'mobility', 'plyometrics', 'cardio', 'olympic', 'calisthenics', 'pilates', 'yoga', 'combat', 'isometric', 'rehab']

export const isBodyPart = v => BODY_PARTS.includes(v)
export const isEquipment = v => EQUIPMENT.includes(v)
export const isTarget = v => TARGETS.includes(v)
export const isMuscle = v => MUSCLES.includes(v)
export const isCategory = v => CATEGORIES.includes(v)

const NAME_MAX = 80
const DESC_MAX = 1000
const STEPS_MAX = 20
const STEP_MAX = 500
// A base64 payload is capped before it is decoded at all: the media caps that follow are on
// the decoded bytes, and a 200 MB video is about 267 MB of base64 that would be held in
// memory twice on the way in.
const B64_MAX = 400 * 1024 * 1024

const one = v => (typeof v === 'string' ? v.trim() : '')
const listOf = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean) : [])

/** A friendly reason a file is not an .ogex, for the caller to show. */
const notExercise = (why = 'this isn’t an openGym exercise file') =>
  Object.assign(new Error(why), { code: 'not-exercise' })

/**
 * base64 → File, for the ingest pipeline. `what` names the part in an error message. A
 * data: URL is accepted as well as bare base64, because that is what a copy-paste carries.
 * Returns null when there is nothing there.
 */
export async function mediaFileFromB64(b64, { mime, name }, what = 'media') {
  const raw = one(b64)
  if (!raw) return null
  let body = raw
  const dataUrl = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(raw)
  if (dataUrl) {
    if (!dataUrl[2]) throw notExercise(`the ${what} is a data URL that is not base64`)
    if (dataUrl[1] && mime && dataUrl[1].toLowerCase() !== mime.toLowerCase()) {
      throw notExercise(`the ${what} says it is ${dataUrl[1]}, not ${mime}`)
    }
    body = dataUrl[3]
  }
  if (body.length > B64_MAX) throw notExercise(`the ${what} is too large to import`)
  if (!/^[A-Za-z0-9+/=\s]+$/.test(body)) throw notExercise(`the ${what} is not base64`)
  let bytes
  try { bytes = Uint8Array.from(atob(body.replace(/\s+/g, '')), c => c.charCodeAt(0)) }
  catch { throw notExercise(`the ${what} is not valid base64`) }
  if (!bytes.length) return null
  return new File([bytes], name, { type: mime })
}

/**
 * Validate and normalise a parsed .ogex document.
 *
 * Returns { exercise, media: { clip?, still? } } where `exercise` is a customEx-shaped record
 * (no id yet when the caller wants a fresh one) and each media part is the File to ingest, or
 * null. Throws Error with code 'not-exercise' and a readable message.
 *
 * Only known fields are kept, so a file with an extra key is still imported — and a file that
 * is not an exercise at all is refused before anything is written.
 */
export function parseExerciseFile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw notExercise()
  if (data.opengym_exercise !== EX_FORMAT) throw notExercise()
  // Text is bounded rather than refused: a name someone typed at 200 characters is still the
  // exercise they meant, and the state has to stay a size it can sync.
  const name = one(data.name)
  if (!name) throw notExercise('the exercise has no name')
  // Either spelling, with the catalogue's own name winning when both are there.
  const bp = one(data.bodyPart) || one(data.body_part)
  if (!isBodyPart(bp)) throw notExercise(`"${bp}" is not a body part this app knows`)
  const eq = one(data.equipment)
  if (!isEquipment(eq)) throw notExercise(`"${eq}" is not equipment this app knows`)
  // A target outside the vocabulary is dropped, not refused: the exercise still imports, and
  // the picker shows it without a target chip rather than losing the whole file.
  const tg = isTarget(one(data.target)) ? one(data.target) : ''

  const instructions = listOf(data.instructions).slice(0, STEPS_MAX).map(s => s.slice(0, STEP_MAX))
  if (!instructions.length) throw notExercise('the exercise has no instructions')

  // Two vocabularies, deliberately: `secondaryMuscles` is the catalogue's own word list
  // (SECONDARY, "hamstrings", "rear deltoids"), while `primaries` are body-map muscles
  // (MUSCLES, "hamstring") because the muscle view draws those. A file may carry either, so
  // each is filtered against the list it belongs to — an unknown word is dropped, never
  // guessed at.
  const sm = [...new Set(listOf(data.secondaryMuscles || data.secondary_muscles))].filter(v => SECONDARY.includes(v))
  const prim = [...new Set(listOf(data.primaries))].filter(isMuscle)
  const description = one(data.description).slice(0, DESC_MAX)

  const exercise = {
    // The caller decides the id: kept for an exercise the app already has, minted otherwise.
    id: one(data.id) || null,
    n: name.slice(0, NAME_MAX),
    bp,
    eq,
    tg: tg && isTarget(tg) ? tg : (prim[0] || ''),
    sm,
    desc: description,
    custom: true,
  }
  // Muscle groups in the map's own vocabulary, so the muscle view credits the exercise the
  // same way it credits one made in the editor. Only the primaries are body-map muscles; the
  // catalogue's secondary words are kept as `sm` and read by the picker, not drawn.
  const groups = [...prim]
  if (groups.length) {
    exercise.muscleGroups = groups
    exercise.primaries = prim
    exercise.secondaries = sm.filter(m => !prim.includes(m))
  }
  if (isCategory(one(data.category))) exercise.cat = one(data.category)

  const media = data.media && typeof data.media === 'object' && !Array.isArray(data.media) ? data.media : {}
  const out = {
    clip: media.clip ? { b64: media.clip, mime: 'video/mp4', name: 'clip.mp4' } : null,
    still: media.still ? { b64: media.still, mime: 'image/webp', name: 'still.webp' } : null,
  }
  return { exercise, media: out }
}

/**
 * One part of the media through the ingest a picked file goes through: scrubbed, probed,
 * capped, hashed. Returns { ref, blobs } to put in the local store as pending, or null when
 * the file was not there. Throws MediaError from the ingest, or an 'not-exercise' error for a
 * payload that is not what it says it is.
 */
export async function ingestExerciseMedia(part, what, limits = DEFAULT_LIMITS, deps = {}) {
  if (!part) return null
  const file = await mediaFileFromB64(part.b64, part, what)
  if (!file) return null
  const ingest = deps.ingestMediaFile || ingestMediaFile
  const { media, blobs } = await ingest(file, limits, deps)
  return { ref: media, blobs }
}

/**
 * The whole import: a parsed .ogex → { exercise, media, blobs, warnings }.
 * The id, decided by the caller through `keepId`:
 *   - a string → the exercise the app already has under that id is edited in place. The file
 *                says "this is the exercise with this id", and the app agrees, so the import
 *                is a new version of it rather than a second copy.
 *   - null     → a fresh id is minted. The id in the file is *not* taken as it is: two people
 *                exporting the same catalogue entry would collide on one id, and a file that
 *                says "0025" must not silently become the app's own barbell bench press. The
 *                caller decides whether an existing exercise is the same one — by name and
 *                body part, or by the id it already holds — and passes it here.
 *
 * `media` is the MediaRef for the animation (or the still), or null. `blobs` are the files to
 * put in the local store, pending, exactly as the editor does.
 */
export async function importExercise(data, {
  keepId = null,
  limits = DEFAULT_LIMITS,
  deps = {},
  mintId = () => 'c' + uid(),
} = {}) {
  const { exercise, media } = parseExerciseFile(data)
  const warnings = []
  let ref = null
  const blobs = []
  if (media.clip) {
    try {
      const out = await ingestExerciseMedia(media.clip, 'animation', limits, deps)
      if (out) { ref = out.ref; blobs.push(...out.blobs) }
    } catch (e) {
      // An animation this app cannot take is not a reason to refuse the exercise: it is
      // imported without it, and the caller says so.
      if (!(e instanceof MediaError)) throw e
      warnings.push('animation')
    }
  }
  if (media.still) {
    try {
      const out = await ingestExerciseMedia(media.still, 'picture', limits, deps)
      if (out && !ref) {
        // A still is the fallback when there is no animation; with one, the poster the probe
        // made is better than a separate file.
        ref = out.ref
        blobs.push(...out.blobs)
      }
    } catch (e) {
      if (!(e instanceof MediaError)) throw e
      warnings.push('picture')
    }
  }
  const imported = { ...exercise, id: keepId || mintId() }
  if (ref) imported.media = ref
  else delete imported.media
  return { exercise: imported, media: ref, blobs, warnings }
}

/** Parse a .ogex file's text. Throws with code 'not-exercise' for anything else. */
export function readExerciseFile(text) {
  let data
  try { data = JSON.parse(text) } catch { throw notExercise() }
  return data
}

/** The sha256 of an .ogex file's bytes, for a "you already have this one" check. */
export async function exerciseFileHash(fileOrText) {
  const bytes = typeof fileOrText === 'string'
    ? new TextEncoder().encode(fileOrText)
    : new Uint8Array(await fileOrText.arrayBuffer())
  return sha256Hex(bytes)
}

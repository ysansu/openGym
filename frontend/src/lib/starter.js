// The starter-plan catalog. Training data only: the chooser's plan names and descriptions are
// written as string literals inside t() calls in sheets.jsx, because check-source-strings.mjs
// only finds them there — copy parked in here would silently ship English in every language.
//
// A routine is [key, name, emoji, [[exerciseId, sets, reps], …]]. The key is what a plan's
// schedule points at, so a weekday never depends on the position of a routine in the array.
// Names stay canonical English — they become ordinary user routines, which are not translated.
//
// This catalogue was pruned to the 19 exercises of the owner's own plan (dumbbell + cable),
// so every id below resolves in this build. The exercises that used to be here are archived
// under catalogue/exercises-archive/ and can be restored with
// `node scripts/catalogue/prune.mjs --restore`.
import { uid } from './format.js'
import { EXIDX } from './exercises.js'
import { eqAvailable, ALL_EQUIPMENT } from './equipment.js'

// The owner's plan, as catalogue ids. Dumbbell-only on the legs and press days, cable for
// the pulls. Sets and reps are the prescription that ships with each plan below.
const EX = {
  legWarm: '1604',      // world great stretch
  catCow: '4580',       // cat cow stretch
  sldl: '1757',         // dumbbell single leg deadlift
  bulg: '2290',         // dumbbell bulgarian split squat
  goblet: '1760',       // dumbbell goblet squat
  rdl: '1459',          // dumbbell romanian deadlift
  hangRaise: '0472',    // hanging leg raise
  shoulderCircle: '4395',
  dbBench: '0289',      // dumbbell bench press
  chestDip: '0251',
  crossover: '1269',    // cable standing up straight crossovers
  dbIncline: '0314',    // dumbbell incline bench press
  cableY: '3342',       // cable y raise
  skull: '4151',        // dumbbell lying floor skullcrusher
  oneArmPd: '1204',     // cable one arm lat pulldown
  latPd: '2330',        // cable lat pulldown full range of motion
  row: '0861',          // cable seated row
  wideRow: '0218',      // cable seated wide-grip row
  cableCurl: '0868',
}

// Cat-cow opens every session, legs and pushes alike.
const catCowPair = [[EX.catCow, 1, 8]]

const PPL = [
  ['push', 'Push Day', 'barbell', [
    ...catCowPair,
    [EX.shoulderCircle, 1, 10],
    [EX.dbBench, 4, 8],
    [EX.chestDip, 3, 10],
    [EX.crossover, 3, 12],
    [EX.dbIncline, 3, 10],
    [EX.cableY, 3, 12],
    [EX.skull, 3, 12],
  ]],
  ['pull', 'Pull Day', 'pullup', [
    ...catCowPair,
    [EX.oneArmPd, 4, 10],
    [EX.latPd, 4, 10],
    [EX.row, 3, 10],
    [EX.wideRow, 3, 12],
    [EX.cableCurl, 3, 12],
  ]],
  ['legs', 'Leg Day', 'legs', [
    ...catCowPair,
    [EX.goblet, 4, 8],
    [EX.bulg, 3, 10],
    [EX.rdl, 3, 10],
    [EX.sldl, 3, 12],
    [EX.hangRaise, 4, 15],
  ]],
]

const UPPER_LOWER = [
  ['upper-a', 'Upper A', 'barbell', [
    ...catCowPair,
    [EX.shoulderCircle, 1, 10],
    [EX.dbBench, 3, 8],
    [EX.latPd, 3, 10],
    [EX.crossover, 3, 12],
    [EX.cableY, 3, 12],
    [EX.skull, 3, 12],
  ]],
  ['lower-a', 'Lower A', 'legs', [
    ...catCowPair,
    [EX.goblet, 3, 8],
    [EX.rdl, 3, 8],
    [EX.sldl, 3, 10],
    [EX.hangRaise, 3, 15],
  ]],
  ['upper-b', 'Upper B', 'barbell', [
    ...catCowPair,
    [EX.shoulderCircle, 1, 10],
    [EX.dbIncline, 3, 8],
    [EX.row, 3, 10],
    [EX.wideRow, 3, 12],
    [EX.cableY, 3, 12],
    [EX.cableCurl, 3, 12],
  ]],
  ['lower-b', 'Lower B', 'legs', [
    ...catCowPair,
    [EX.bulg, 3, 10],
    [EX.sldl, 3, 10],
    [EX.goblet, 2, 12],
    [EX.hangRaise, 3, 15],
  ]],
]

const FULL_BODY = [
  ['fb-a', 'Full Body A', 'figureStrength', [
    ...catCowPair,
    [EX.shoulderCircle, 1, 10],
    [EX.goblet, 3, 8],
    [EX.dbBench, 3, 8],
    [EX.latPd, 3, 10],
    [EX.cableY, 2, 12],
    [EX.cableCurl, 2, 12],
  ]],
  ['fb-b', 'Full Body B', 'figureStrength', [
    ...catCowPair,
    [EX.shoulderCircle, 1, 10],
    [EX.rdl, 3, 8],
    [EX.dbIncline, 3, 10],
    [EX.row, 3, 10],
    [EX.cableY, 2, 12],
    [EX.skull, 2, 12],
  ]],
  ['fb-c', 'Full Body C', 'figureStrength', [
    ...catCowPair,
    [EX.shoulderCircle, 1, 10],
    [EX.bulg, 3, 10],
    [EX.dbBench, 2, 10],
    [EX.wideRow, 3, 10],
    [EX.hangRaise, 3, 15],
  ]],
]

const FIVE_BY_FIVE = [
  ['5x5-a', '5×5 A', 'barbell', [...catCowPair, [EX.goblet, 5, 5], [EX.dbBench, 5, 5], [EX.row, 5, 5]]],
  ['5x5-b', '5×5 B', 'barbell', [...catCowPair, [EX.rdl, 5, 5], [EX.dbIncline, 5, 5], [EX.latPd, 5, 5]]],
  ['5x5-c', '5×5 C', 'barbell', [...catCowPair, [EX.bulg, 5, 5], [EX.dbBench, 5, 5], [EX.wideRow, 5, 5]]],
]

// [weekday, routineKey] — weekday is a DAYN index, so 1 is Monday. Fixed weeks only: every
// plan repeats the same seven days, which is all the weekly plan model can represent.
const PLANS = {
  ppl: { routines: PPL, schedule: [[1, 'push'], [3, 'pull'], [5, 'legs']] },
  'upper-lower': { routines: UPPER_LOWER, schedule: [[1, 'upper-a'], [2, 'lower-a'], [4, 'upper-b'], [5, 'lower-b']] },
  'full-body': { routines: FULL_BODY, schedule: [[1, 'fb-a'], [3, 'fb-b'], [5, 'fb-c']] },
  '5x5': { routines: FIVE_BY_FIVE, schedule: [[1, '5x5-a'], [3, '5x5-b'], [5, '5x5-c']] }
}

const build = routines =>
  routines.map(([, name, emoji, list]) => ({ id: uid(), name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }))

// Fresh routine objects (new ids) — [push, pull, legs]. The demo build seeds a history on
// top of exactly these three, so this entry point keeps its shape.
export const starterRoutines = () => build(PPL)

// [{ id, days }] for the chooser. The day count is read off the schedule rather than stored
// beside it, so the two can never disagree.
export const starterPlanOptions = () =>
  Object.entries(PLANS).map(([id, { schedule }]) => ({ id, days: schedule.length }))

// The weekdays a plan would claim, or null for an unknown id.
export const starterPlanDays = id => PLANS[id]?.schedule.map(([day]) => day) ?? null

// Words that name the equipment, not the movement ("barbell", "lever", "machine"…), so that
// "barbell bench press" and "dumbbell bench press" read as the same lift.
const EQ_WORDS = new Set(ALL_EQUIPMENT.flatMap(e => e.split(/[^a-z0-9]+/)).concat(['lever', 'leverage', 'machine', 'sled']))
const words = ex => new Set(ex.n.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !EQ_WORDS.has(w)))
const jaccard = (a, b) => {
  const inter = [...a].filter(x => b.has(x)).length
  return inter ? inter / (a.size + b.size - inter) : 0
}

// Names that are not working sets: stretches, holds, mobility and warm-up drills. Never a
// stand-in for a lift, whatever body part and muscle they share with it.
const NOT_A_LIFT = /stretch|isometric|squeeze|yoga|\bpose\b|toe touch|\broll(er)?\b|mobility|circles|warm-?up|boxing|against wall/i
// "… on exercise ball" is tagged with its weight (dumbbell), but needs a ball nobody ticked.
const NEEDS_BALL = /exercise ball|stability ball|swiss ball|bosu/i

// The best stand-in for `ex` among exercises the equipment list allows. Same body part, and it
// has to share the target muscle, the main muscle or a helper muscle with `ex`. Closest wins:
// same target muscle, then the movement by name, then helper muscles. When `ex` is a loaded
// lift, one that is loaded too beats a body-weight drill — a push-up is not a bench press.
// `taken` keeps a routine from ending up with the same exercise twice. null when nothing fits.
export const substituteFor = (ex, equipment, taken) => {
  const hasBall = equipment.includes('stability ball') || equipment.includes('bosu ball')
  const exWords = words(ex), exSm = new Set([ex.mg, ...(ex.sm || [])])
  const loaded = ex.eq !== 'body weight'
  let best = null, bestScore = -Infinity
  for (const c of Object.values(EXIDX)) {
    if (c.bp !== ex.bp || taken.has(c.id) || !eqAvailable(equipment, c)) continue
    if (NOT_A_LIFT.test(c.n) || (!hasBall && NEEDS_BALL.test(c.n))) continue
    const sm = jaccard(exSm, new Set([c.mg, ...(c.sm || [])]))
    if (c.tg !== ex.tg && c.mg !== ex.mg && !sm) continue
    const score = 2 * (c.tg === ex.tg) + (c.mg === ex.mg) + 3 * jaccard(exWords, words(c)) + 2 * sm
      - (loaded && c.eq === 'body weight' ? 3 : 0)
    // id as the last key: the same equipment always gives the same plan
    if (score > bestScore || (score === bestScore && c.id < best.id)) { best = c; bestScore = score }
  }
  return best
}

// Re-cuts a routine list for an equipment list: what you can already do stays, what you can't
// is swapped for its closest match, and what has no match is dropped (with its routine, when
// that leaves it empty). Sets and reps carry over unchanged.
//
// The warm-up block (cat-cow, shoulder circles) is body-weight by definition and never
// swapped: fitting is about what a lift needs, and a warm-up nobody ticked equipment for is
// still a warm-up. It is recognised by its 1×N prescription rather than by an id list, so
// adding a second opener does not need a change here.
const isWarmup = ([, sets, reps]) => sets === 1 && reps <= 10
const fitRoutines = (routines, equipment) => {
  let swapped = 0, dropped = 0
  const fitted = routines.map(([key, name, emoji, list]) => {
    const taken = new Set(list.map(([id]) => id))
    const out = []
    for (const [id, sets, reps] of list) {
      const ex = EXIDX[id]
      if (!ex || isWarmup([id, sets, reps]) || eqAvailable(equipment, ex)) { out.push([id, sets, reps]); continue }
      const sub = substituteFor(ex, equipment, taken)
      if (!sub) { dropped++; continue }
      taken.add(sub.id)
      swapped++
      out.push([sub.id, sets, reps])
    }
    return [key, name, emoji, out]
  }).filter(([, , , list]) => list.length)
  return { routines: fitted, swapped, dropped }
}

// Fresh routines plus the weekdays to put them on, or null for an unknown id — a caller that
// treats null as "change nothing" can never half-apply a plan. With an equipment list the
// plan is fitted to it first, and `fit` reports how many exercises that swapped or dropped.
export const buildStarterPlan = (id, equipment) => {
  const plan = PLANS[id]
  if (!plan) return null
  const fit = equipment ? fitRoutines(plan.routines, equipment) : null
  const source = fit ? fit.routines : plan.routines
  const routines = build(source)
  // key → the id just minted for it, so the schedule below names its routine
  const byKey = Object.fromEntries(source.map(([key], i) => [key, routines[i].id]))
  return {
    routines,
    schedule: plan.schedule.filter(([, key]) => byKey[key]).map(([day, key]) => ({ day, routineId: byKey[key] })),
    ...(fit && { fit: { swapped: fit.swapped, dropped: fit.dropped } })
  }
}

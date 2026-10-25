import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { ALL_EQUIPMENT, eqAvailable } from './equipment.js'
import { buildStarterPlan, starterPlanDays, starterPlanOptions, starterRoutines } from './starter.js'

// The catalogue in this build is pruned to the owner's 19 exercises (see scripts/catalogue/
// prune.mjs), so the plans are defined against those ids. The test below pins the approved
// prescription the way it always did — written out again rather than imported, so a test that
// reads the same table as the code would pass no matter what that table said.
// [weekday, name, sets].
const APPROVED = {
  ppl: [
    [1, 'Push Day', [['4580', 1, 8], ['4395', 1, 10], ['0289', 4, 8], ['0251', 3, 10], ['1269', 3, 12], ['0314', 3, 10], ['3342', 3, 12], ['4151', 3, 12]]],
    [3, 'Pull Day', [['4580', 1, 8], ['1204', 4, 10], ['2330', 4, 10], ['0861', 3, 10], ['0218', 3, 12], ['0868', 3, 12]]],
    [5, 'Leg Day', [['4580', 1, 8], ['1760', 4, 8], ['2290', 3, 10], ['1459', 3, 10], ['1757', 3, 12], ['0472', 4, 15]]],
  ],
  'upper-lower': [
    [1, 'Upper A', [['4580', 1, 8], ['4395', 1, 10], ['0289', 3, 8], ['2330', 3, 10], ['1269', 3, 12], ['3342', 3, 12], ['4151', 3, 12]]],
    [2, 'Lower A', [['4580', 1, 8], ['1760', 3, 8], ['1459', 3, 8], ['1757', 3, 10], ['0472', 3, 15]]],
    [4, 'Upper B', [['4580', 1, 8], ['4395', 1, 10], ['0314', 3, 8], ['0861', 3, 10], ['0218', 3, 12], ['3342', 3, 12], ['0868', 3, 12]]],
    [5, 'Lower B', [['4580', 1, 8], ['2290', 3, 10], ['1757', 3, 10], ['1760', 2, 12], ['0472', 3, 15]]],
  ],
  'full-body': [
    [1, 'Full Body A', [['4580', 1, 8], ['4395', 1, 10], ['1760', 3, 8], ['0289', 3, 8], ['2330', 3, 10], ['3342', 2, 12], ['0868', 2, 12]]],
    [3, 'Full Body B', [['4580', 1, 8], ['4395', 1, 10], ['1459', 3, 8], ['0314', 3, 10], ['0861', 3, 10], ['3342', 2, 12], ['4151', 2, 12]]],
    [5, 'Full Body C', [['4580', 1, 8], ['4395', 1, 10], ['2290', 3, 10], ['0289', 2, 10], ['0218', 3, 10], ['0472', 3, 15]]],
  ],
  '5x5': [
    [1, '5×5 A', [['4580', 1, 8], ['1760', 5, 5], ['0289', 5, 5], ['0861', 5, 5]]],
    [3, '5×5 B', [['4580', 1, 8], ['1459', 5, 5], ['0314', 5, 5], ['2330', 5, 5]]],
    [5, '5×5 C', [['4580', 1, 8], ['2290', 5, 5], ['0289', 5, 5], ['0218', 5, 5]]],
  ],
}

const shape = r => r.ex.map(e => [e.id, e.sets, e.reps])

describe('starter plan catalog', () => {
  it('offers exactly the four plans, with the day count read off the schedule', () => {
    expect(starterPlanOptions()).toEqual([
      { id: 'ppl', days: 3 }, { id: 'upper-lower', days: 4 },
      { id: 'full-body', days: 3 }, { id: '5x5', days: 3 },
    ])
    for (const { id, days } of starterPlanOptions()) expect(starterPlanDays(id)).toHaveLength(days)
  })

  it('changes nothing for an unknown plan id', () => {
    expect(buildStarterPlan('nope')).toBeNull()
    expect(buildStarterPlan(undefined)).toBeNull()
    // A click handler wired straight to a loader would hand the event in as the plan.
    expect(buildStarterPlan({ type: 'click' })).toBeNull()
    expect(starterPlanDays('nope')).toBeNull()
  })

  it('references only exercises the pruned catalogue still ships', () => {
    for (const { id } of starterPlanOptions()) {
      for (const r of buildStarterPlan(id).routines) {
        for (const e of r.ex) expect(EXIDX[e.id], `${id} -> ${e.id}`).toBeTruthy()
      }
    }
  })
})

describe.each(Object.keys(APPROVED))('%s', planId => {
  const approved = APPROVED[planId]

  it('builds the approved exercises, sets and reps in order', () => {
    const { routines } = buildStarterPlan(planId)
    expect(routines.map(r => r.name)).toEqual(approved.map(([, name]) => name))
    routines.forEach((r, i) => expect(shape(r)).toEqual(approved[i][2]))
  })

  it('puts each routine on its approved weekday, by identity not position', () => {
    const { routines, schedule } = buildStarterPlan(planId)
    const nameOf = Object.fromEntries(routines.map(r => [r.id, r.name]))
    expect(schedule.map(({ day, routineId }) => [day, nameOf[routineId]]))
      .toEqual(approved.map(([day, name]) => [day, name]))
  })

  it('references only real exercises and starts every one at weight 0', () => {
    for (const r of buildStarterPlan(planId).routines) {
      for (const e of r.ex) {
        expect(EXIDX[e.id], e.id).toBeTruthy()
        expect(e.sets).toBeGreaterThan(0)
        expect(e.reps).toBeGreaterThan(0)
        expect(e.weight).toBe(0)
      }
    }
  })

  it('mints fresh ids and independent objects on every build', () => {
    const first = buildStarterPlan(planId)
    const second = buildStarterPlan(planId)
    const ids = first.routines.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(second.routines.some(r => ids.includes(r.id))).toBe(false)
    expect(first.routines[0].ex[0]).not.toBe(second.routines[0].ex[0])
    // and the static definition survives a caller mutating what it got back
    first.routines[0].ex[0].sets = 99
    expect(buildStarterPlan(planId).routines[0].ex[0].sets).toBe(approved[0][2][0][1])
  })
})

describe('starterRoutines (the demo build entry point)', () => {
  it('still returns push, pull and legs unchanged', () => {
    const routines = starterRoutines()
    expect(routines.map(r => r.name)).toEqual(['Push Day', 'Pull Day', 'Leg Day'])
    routines.forEach((r, i) => expect(shape(r)).toEqual(APPROVED.ppl[i][2]))
    expect(routines.map(r => r.emoji)).toEqual(['barbell', 'pullup', 'legs'])
  })

  it('mints fresh ids on every invocation', () => {
    const first = starterRoutines().map(r => r.id)
    const second = starterRoutines().map(r => r.id)
    expect(new Set([...first, ...second]).size).toBe(6)
  })
})

describe('fitting a starter plan to equipment', () => {
  const ids = plan => plan.routines.flatMap(r => r.ex.map(e => e.id))

  it('changes nothing when the equipment already covers the plan', () => {
    const all = ALL_EQUIPMENT
    const fitted = buildStarterPlan('ppl', all)
    expect(fitted.routines.map(shape)).toEqual(APPROVED.ppl.map(([, , list]) => list))
    expect(fitted.fit).toEqual({ swapped: 0, dropped: 0 })
  })

  it('has no fit report when no equipment is given', () => {
    expect(buildStarterPlan('ppl').fit).toBeUndefined()
  })

  it('swaps only what the equipment cannot do, keeping sets and reps', () => {
    // The plan is dumbbell + cable, so a dumbbell-only profile swaps every cable exercise
    // for the nearest dumbbell lift of the same body part and muscle. The warm-up block is
    // body-weight by definition and is left where it is, and a body-weight lift such as the
    // chest dip needs no equipment either.
    const fitted = buildStarterPlan('ppl', ['dumbbell'])
    const push = fitted.routines[0]
    expect(push.ex.slice(0, 2).map(e => e.id)).toEqual(['4580', '4395'])   // cat-cow, circles
    const work = push.ex.slice(2)
    expect(work.every(e => ['dumbbell', 'body weight'].includes(EXIDX[e.id].eq))).toBe(true)
    expect(work.some(e => EXIDX[e.id].eq === 'dumbbell')).toBe(true)
    expect(fitted.fit.swapped).toBeGreaterThan(0)
  })

  it('only ever uses exercises the equipment allows (body weight is always allowed)', () => {
    for (const eq of [['dumbbell'], ['barbell', 'dumbbell'], ['band'], []]) {
      for (const { id } of starterPlanOptions()) {
        const fitted = buildStarterPlan(id, eq)
        for (const exId of ids(fitted)) expect(eqAvailable(eq, EXIDX[exId])).toBe(true)
      }
    }
  })

  it('never repeats an exercise inside one routine', () => {
    for (const eq of [['dumbbell'], ['band'], []]) {
      for (const { id } of starterPlanOptions()) {
        for (const r of buildStarterPlan(id, eq).routines) {
          const own = r.ex.map(e => e.id)
          expect(new Set(own).size).toBe(own.length)
        }
      }
    }
  })

  it('never stands in with a stretch, a hold or a drill that needs a ball nobody ticked', () => {
    // What gets *swapped in* is never a warm-up drill: a substitute for a lift has to be a
    // lift. The plan's own opener (cat-cow) is a stretch on purpose and stays.
    const bad = /stretch|isometric|squeeze|yoga|toe touch|exercise ball|bosu/i
    for (const eq of [['dumbbell'], ['band'], []]) {
      for (const { id } of starterPlanOptions()) {
        for (const r of buildStarterPlan(id, eq).routines) {
          const opener = r.ex[0].id                       // the warm-up block, 1×8
          for (const ex of r.ex.slice(1)) {
            expect(EXIDX[ex.id].n, `${id}: ${ex.id}`).not.toMatch(bad)
          }
          expect(opener).toBe('4580')
        }
      }
    }
  })

  it('is deterministic', () => {
    const a = buildStarterPlan('upper-lower', ['dumbbell']).routines.map(shape)
    const b = buildStarterPlan('upper-lower', ['dumbbell']).routines.map(shape)
    expect(a).toEqual(b)
  })

  it('keeps every scheduled day pointing at a routine that exists', () => {
    const fitted = buildStarterPlan('5x5', [])
    const have = new Set(fitted.routines.map(r => r.id))
    for (const { routineId } of fitted.schedule) expect(have.has(routineId)).toBe(true)
  })
})

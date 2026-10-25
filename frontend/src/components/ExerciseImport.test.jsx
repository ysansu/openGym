// @vitest-environment happy-dom
// The import sheet is where a file from outside becomes an exercise in the library. The
// cases that matter: a file that is not an .ogex is refused with a sentence and nothing is
// written; a valid one is previewed before anything happens; and importing runs the media
// into the local store and the exercise into the state, as the user's own.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { ExerciseImportForm } from './ExerciseImport.jsx'
import { EX_FORMAT } from '../lib/import-exercise.js'
import { mediaStore, _setMediaStore, memoryBackend, createMediaStore } from '../lib/media-store.js'

const mounted = []

const doc = (over = {}) => ({
  opengym_exercise: EX_FORMAT,
  id: '9999',
  name: 'kettlebell halos',
  bodyPart: 'shoulders',
  equipment: 'kettlebell',
  target: 'delts',
  secondaryMuscles: ['core'],
  category: 'mobility',
  description: 'A ring of weight around the head.',
  instructions: ['Hold the bell by the horns.', 'Circle it around your head.', 'Keep the ribs down.'],
  ...over,
})

// The ingest itself — base64 to a File, the scrub, the hash, the MediaRef — is pinned by
// lib/import-exercise.test.js, which can inject the browser parts. Here the sheet is tested
// for what it does with the result: nothing is written before the confirm, and what is
// written is the user's own exercise with the id the app minted.

// A FileReader that reads the text we hand it, so the sheet's own read path is exercised.
const fakePick = text => {
  const file = { name: 'x.ogex', type: 'application/json' }
  globalThis.FileReader = class {
    readAsText() { setTimeout(() => { this.result = text; this.onload() }, 0) }
  }
  return file
}

function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<ExerciseImportForm close={() => {}} />))
  return host
}

const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent === label)

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  _setMediaStore(createMediaStore(memoryBackend()))
  useStore.setState(s => ({ S: { ...s.S, customEx: [], routines: [], workouts: [] } }))
  document.body.innerHTML = ''
})

afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('the exercise import sheet', () => {
  it('offers a file picker and nothing else to begin with', () => {
    const host = render()
    expect(button(host, 'Choose file')).toBeTruthy()
    // No preview, no confirm: nothing is known about the file yet.
    expect(host.textContent).not.toContain('kettlebell halos')
    expect(button(host, 'Import')).toBeFalsy()
  })

  it('refuses a file that is not an .ogex, and writes nothing', async () => {
    const host = render()
    const input = host.querySelector('input[type=file]')
    // A plan file, not an exercise file.
    Object.defineProperty(input, 'files', { value: [fakePick(JSON.stringify({ opengym_plan: 1 }))] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))
    })
    expect(host.textContent).toMatch(/isn’t an openGym exercise file/)
    expect(useStore.getState().S.customEx).toEqual([])
  })

  it('refuses a file that is not JSON at all', async () => {
    const host = render()
    const input = host.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [fakePick('not json at all')] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))
    })
    expect(host.textContent).toMatch(/isn’t an openGym exercise file/)
  })

  it('previews the exercise before anything is written', async () => {
    const host = render()
    const input = host.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [fakePick(JSON.stringify(doc()))] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))
    })
    expect(host.textContent).toContain('kettlebell halos')
    expect(host.textContent).toContain('shoulders')
    expect(useStore.getState().S.customEx).toEqual([])      // nothing yet
    expect(button(host, 'Import')).toBeTruthy()
  })

  it('says so when the app already has an exercise with that name', async () => {
    useStore.setState(s => ({ S: { ...s.S, customEx: [{ id: 'c1', n: 'kettlebell halos', bp: 'shoulders', custom: true }] } }))
    const host = render()
    const input = host.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [fakePick(JSON.stringify(doc()))] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))
    })
    // The preview is shown, with the replacement warning beside it.
    expect(host.textContent).toContain('kettlebell halos')
    expect(host.textContent).toMatch(/Importing replaces it/)
  })

  it('imports the exercise as the user’s own, with a fresh id', async () => {
    const host = render()
    const input = host.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [fakePick(JSON.stringify(doc()))] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))
    })
    await act(async () => { button(host, 'Import').click() })
    const own = useStore.getState().S.customEx
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({
      n: 'kettlebell halos', bp: 'shoulders', eq: 'kettlebell', tg: 'delts', custom: true,
    })
    expect(own[0].id).not.toBe('9999')      // the file's id is never taken as it is
    expect(own[0].sm).toEqual(['core'])
    expect(own[0]._srcHash).toMatch(/^[0-9a-f]{64}$/)   // so a second import is recognised
    expect(host.textContent).toMatch(/is in your library/)
  })

  it('replaces what is there when the file names an exercise the app already has', async () => {
    useStore.setState(s => ({ S: { ...s.S, customEx: [{ id: 'c1', n: 'kettlebell halos', bp: 'shoulders', custom: true, eq: 'body weight' }] } }))
    const host = render()
    const input = host.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [fakePick(JSON.stringify(doc({ id: 'c1' })))] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))
    })
    await act(async () => { button(host, 'Import').click() })
    const own = useStore.getState().S.customEx
    expect(own).toHaveLength(1)                                  // not a second copy
    expect(own[0].eq).toBe('kettlebell')                         // the imported version won
    expect(own[0].id).toBe('c1')
  })
})

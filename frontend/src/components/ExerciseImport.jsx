// The "Import an exercise" flow: pick a .ogex file, see what is in it, and add it.
//
// One exercise per file, because that is the unit the catalogue travels in
// (catalogue/exercises-archive/ after a prune, or the owner's own set). The animation and the
// still are base64 in the same file, so sending one file to a phone is the whole job — and
// importing it runs the media through the same ingest a file picked in the editor goes
// through, so the state keeps a MediaRef and the local store keeps the bytes.
//
// The three states a file can be in, each shown before anything is written:
//   - not an .ogex at all          → a sentence, and nothing else happens
//   - an exercise the app already  → "replace what you have?" (same id = the same exercise)
//     has, by id or by name
//   - a new exercise               → a preview, then Import
import { useState, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX, isCustomEx } from '../lib/exercises.js'
import { importExercise, readExerciseFile, exerciseFileHash } from '../lib/import-exercise.js'
import { limitsFrom } from '../lib/media-limits.js'
import { mediaStore } from '../lib/media-store.js'
import { syncMedia } from '../lib/media-sync.js'
import { uid } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'
import { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'

/** The bytes of a picked .ogex, read once and kept for the confirm step. */
const readText = file => new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(String(fr.result || ''))
  fr.onerror = () => reject(fr.error || new Error('read failed'))
  fr.readAsText(file)
})

const KB = n => (n < 1024 ? n + ' B' : Math.round(n / 1024) + ' KB')
const MB = n => (n < 1024 * 1024 ? KB(n) : (n / 1024 / 1024).toFixed(1) + ' MB')

// The size of the base64 in a file, before it is decoded — what a phone receives.
const mediaSize = doc => {
  const m = doc?.media
  if (!m || typeof m !== 'object') return 0
  return ['clip', 'still'].reduce((n, k) => n + (typeof m[k] === 'string' ? Math.floor(m[k].length * 3 / 4) : 0), 0)
}

export function ExerciseImportForm({ onDone, close }) {
  const update = useStore(s => s.update)
  const fileRef = useRef(null)
  const [state, setState] = useState({ phase: 'pick' })   // pick | ready | working | done
  const [doc, setDoc] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const limits = limitsFrom(useStore.getState().config)

  // An exercise the app already has: the same id (so this file is a new version of it), or
  // the same name and body part (so it is the same lift under a different id). Either way the
  // import is offered as a replacement rather than a second copy — a library with "dumbbell
  // row" twice is worse than one with the imported version of it.
  const own = () => (useStore.getState().S.customEx || []).filter(isCustomEx)
  const existing = parsed && (
    (useStore.getState().S.customEx || []).find(c => c.id === parsed.exercise.id)
    || own().find(c => c.n.toLowerCase() === parsed.exercise.n.toLowerCase() && c.bp === parsed.exercise.bp)
  )

  const pick = async ev => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    setState({ phase: 'working' })
    setError('')
    try {
      const text = await readText(f)
      const data = readExerciseFile(text)
      const hash = await exerciseFileHash(text)
      // The file's id is adopted only when the app already has an exercise under it: the
      // import is then a new version of that one, not a second copy. Otherwise a fresh id is
      // minted, so a file that says "0025" cannot become the app's own barbell bench press.
      const own = useStore.getState().S.customEx || []
      const sameId = own.find(c => c.id === data.id)
      const out = await importExercise(data, {
        keepId: sameId ? sameId.id : null,
        limits,
        mintId: () => 'c' + uid(),
      })
      setDoc(data)
      setParsed({ ...out, hash })
      setState({ phase: 'ready' })
      const have = own.some(c => c._srcHash === hash)
      setNote(have ? t('You have already imported this file.') : '')
    } catch (e) {
      setError(e?.code === 'not-exercise' ? e.message : t('That file could not be read'))
      setState({ phase: 'pick' })
    }
  }

  const confirm = async () => {
    if (!parsed) return
    setState({ phase: 'working' })
    try {
      // The bytes go into the local store first, as pending, exactly as the editor does — an
      // <img src> cannot carry the phone's Authorization header, a fetch can.
      for (const b of parsed.blobs) await mediaStore.put(b.hash, b.blob, { mime: b.mime, pending: true })
      update(s => {
        const own = (s.customEx = s.customEx || [])
        const ex = { ...parsed.exercise, _srcHash: parsed.hash }
        const at = own.findIndex(c => c.id === ex.id)
        if (at >= 0) own[at] = ex                     // same id: a replacement
        else own.push(ex)
      })
      if (parsed.blobs.length) syncMedia({ force: true })
      setState({ phase: 'done' })
      setNote('')
      onDone && onDone(EXIDX[parsed.exercise.id] || parsed.exercise)
    } catch (e) {
      setError(e?.code === 'not-exercise' ? e.message : t('That file could not be read'))
      setState({ phase: 'ready' })
    }
  }

  const preview = parsed?.exercise
  return <>
    <h3>{t('Import an exercise')}</h3>

    {state.phase === 'pick' && <>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {t('Pick an .ogex file — one exercise, with its animation. Send it to this device any way you like.')}
      </div>
      <Button variant="primary" icon="download" onClick={() => fileRef.current.click()}>
        {t('Choose file')}
      </Button>
    </>}

    {state.phase === 'working' && <div className="muted small">{t('Reading…')}</div>}

    {state.phase === 'ready' && preview && <>
      <div className="list" style={{ margin: '12px 0' }}>
        <div className="item">
          <span className="lrow-i" style={{ background: 'var(--surface-3)' }}>
            {parsed.media ? <Thumb ex={preview} /> : <Icon name="figureStrength" />}
          </span>
          <div className="grow">
            <div className="tt">{preview.n}</div>
            <div className="ss">
              {t(preview.bp)}{preview.eq ? ` · ${t(preview.eq)}` : ''}{preview.tg ? ` · ${t(preview.tg)}` : ''}
            </div>
          </div>
        </div>
      </div>

      <dl className="kv small" style={{ margin: '0 0 12px' }}>
        <dt>{t('Steps')}</dt><dd>{doc?.instructions?.length || 0}</dd>
        <dt>{t('Animation')}</dt>
        <dd>{parsed.media ? `${MB(parsed.media.size)} · ${t(parsed.media.kind)}` : t('none')}</dd>
        {mediaSize(doc) > 0 && <><dt>{t('File size')}</dt><dd>{MB(mediaSize(doc))}</dd></>}
      </dl>

      {existing && <div className="small dim" style={{ marginBottom: 12 }}>
        {t('“{0}” is already in your library. Importing replaces it with this version.', exerciseNameFor(existing))}
      </div>}

      {note && <div className="small dim" style={{ marginBottom: 12 }}>{note}</div>}
      {parsed.warnings.length > 0 && <div className="small dim" style={{ marginBottom: 12 }}>
        {parsed.warnings.includes('animation') ? t('The animation could not be imported (too large or not a video this app can read). The exercise is imported without it.') : ''}
        {parsed.warnings.includes('picture') ? t('The picture could not be imported.') : ''}
      </div>}

      <div className="row" style={{ gap: 8 }}>
        <Button variant="primary" icon="download" onClick={confirm}>{t('Import')}</Button>
        <Button onClick={() => { setParsed(null); setDoc(null); setState({ phase: 'pick' }) }}>{t('Pick another')}</Button>
      </div>
    </>}

    {state.phase === 'done' && <>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {t('“{0}” is in your library. It works like any other exercise, and you can edit or delete it.', preview?.n || '')}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button variant="primary" onClick={() => { setState({ phase: 'pick' }); setParsed(null); setDoc(null) }}>
          {t('Import another')}
        </Button>
        <Button onClick={close}>{t('Done')}</Button>
      </div>
    </>}

    {error && <div className="small" style={{ color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    <input ref={fileRef} type="file" accept=".ogex,.json,application/json" style={{ display: 'none' }} onChange={pick} />
  </>
}

export const exerciseImportSheet = (onDone) => useUI.getState().openSheet(close =>
  <ExerciseImportForm onDone={onDone} close={close} />)

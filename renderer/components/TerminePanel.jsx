import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDatum(datum) {
  return new Date(datum + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

function TerminForm({ initial, klassen, onSpeichern, onAbbrechen }) {
  const [titel, setTitel]     = useState(initial?.titel ?? '')
  const [datum, setDatum]     = useState(initial?.datum ?? localDateStr(new Date()))
  const [uhrzeit, setUhrzeit] = useState(initial?.uhrzeit ?? '')
  const [notiz, setNotiz]     = useState(initial?.notiz ?? '')
  const [klasseId, setKlasseId] = useState(initial?.klasse_id ? String(initial.klasse_id) : '')
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const speichern = async () => {
    const t = titel.trim()
    if (!t || !datum) return
    await onSpeichern({
      titel: t, datum,
      uhrzeit: uhrzeit || null,
      notiz: notiz.trim() || null,
      klasseId: klasseId ? parseInt(klasseId) : null,
    })
  }

  return (
    <div className="space-y-1.5 bg-zinc-800 rounded-lg p-2.5 border border-blue-700/60">
      <input
        ref={inputRef}
        className="w-full text-sm bg-transparent outline-none text-zinc-100 placeholder:text-zinc-500"
        placeholder="Titel…"
        value={titel}
        onChange={e => setTitel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') speichern(); if (e.key === 'Escape') onAbbrechen() }}
      />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 flex-shrink-0">Datum:</span>
        <input
          type="date"
          className="flex-1 text-xs bg-transparent outline-none text-zinc-400 cursor-pointer"
          value={datum}
          onChange={e => setDatum(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 flex-shrink-0">Uhrzeit:</span>
        <input
          type="time"
          className="flex-1 text-xs bg-transparent outline-none text-zinc-400 cursor-pointer"
          value={uhrzeit}
          onChange={e => setUhrzeit(e.target.value)}
        />
      </div>
      {klassen.length > 0 && (
        <select
          className="w-full text-xs bg-zinc-800 outline-none text-zinc-400"
          value={klasseId}
          onChange={e => setKlasseId(e.target.value)}
        >
          <option value="">Keine Klasse</option>
          {klassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      )}
      <input
        className="w-full text-xs bg-transparent outline-none text-zinc-400 placeholder:text-zinc-600 border-t border-zinc-700 pt-1.5"
        placeholder="Notiz (optional)"
        value={notiz}
        onChange={e => setNotiz(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') speichern(); if (e.key === 'Escape') onAbbrechen() }}
      />
      <div className="flex gap-1.5 pt-0.5">
        <button
          className="flex-1 text-xs py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          onClick={speichern}
        >
          {initial ? 'Speichern' : 'Hinzufügen'}
        </button>
        <button
          className="text-xs px-2 py-1 rounded-md text-zinc-500 hover:bg-zinc-700 transition-colors"
          onClick={onAbbrechen}
        >✕</button>
      </div>
    </div>
  )
}

function TerminKarte({ termin, klassen, onDelete, onEdit, flashRef, flashed }) {
  const [editModus, setEditModus] = useState(false)
  const heute = localDateStr(new Date())
  const vergangen = termin.datum < heute

  if (editModus) {
    return (
      <TerminForm
        initial={termin}
        klassen={klassen}
        onSpeichern={async (data) => { await onEdit(termin.id, data); setEditModus(false) }}
        onAbbrechen={() => setEditModus(false)}
      />
    )
  }

  return (
    <div
      ref={flashRef}
      className={`group flex items-start gap-2 p-2 rounded-lg bg-zinc-800 border transition-all ${vergangen ? 'opacity-50' : ''} ${flashed ? 'border-blue-400 ring-2 ring-blue-400/40' : 'border-zinc-700/60'}`}
    >
      <div className="flex-shrink-0 text-center min-w-[36px]">
        <div className="text-[10px] font-semibold text-blue-400 leading-tight">
          {new Date(termin.datum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
        </div>
        {termin.uhrzeit && (
          <div className="text-[9px] text-zinc-500 leading-tight">{termin.uhrzeit}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 leading-snug truncate">{termin.titel}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {termin.klasse_name && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-900/40 text-blue-400 font-medium">
              {termin.klasse_name}
            </span>
          )}
          {termin.notiz && (
            <span className="text-[10px] text-zinc-500 truncate">{termin.notiz}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        <button
          className="text-zinc-600 hover:text-zinc-300 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={() => setEditModus(true)}
          title="Bearbeiten"
        >✎</button>
        <button
          className="text-zinc-600 hover:text-red-400 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={() => onDelete(termin.id)}
          title="Löschen"
        >✕</button>
      </div>
    </div>
  )
}

export default function TerminePanel({ hoehe = 256, highlightedTerminId, onHighlightCleared }) {
  const { termine, ladeTermine, klassen, aktuellesSchuljahr } = useStore()
  const [neueingabe, setNeueingabe] = useState(false)
  const [vergangeneOffen, setVergangeneOffen] = useState(false)
  const [flashedId, setFlashedId] = useState(null)
  const itemRefs = useRef({})

  useEffect(() => { ladeTermine() }, [])

  useEffect(() => {
    if (!highlightedTerminId) return
    const termin = termine.find(t => t.id === highlightedTerminId)
    if (!termin) return
    const heute = localDateStr(new Date())
    if (termin.datum < heute) setVergangeneOffen(true)
    setFlashedId(highlightedTerminId)
    setTimeout(() => {
      itemRefs.current[highlightedTerminId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
    const t = setTimeout(() => { setFlashedId(null); onHighlightCleared?.() }, 1800)
    return () => clearTimeout(t)
  }, [highlightedTerminId])

  const terminErstellen = async (data) => {
    if (!aktuellesSchuljahr) { console.warn('[TerminePanel] kein aktuellesSchuljahr'); return }
    try {
      console.log('[TerminePanel] create:', { ...data, schuljahrId: aktuellesSchuljahr.id })
      await window.api.termine.create({ ...data, schuljahrId: aktuellesSchuljahr.id })
      await ladeTermine()
      setNeueingabe(false)
    } catch (err) {
      console.error('[TerminePanel] Fehler beim Erstellen:', err)
    }
  }

  const terminBearbeiten = async (id, data) => {
    try {
      await window.api.termine.update(id, data)
      await ladeTermine()
    } catch (err) {
      console.error('[TerminePanel] Fehler beim Bearbeiten:', err)
    }
  }

  const terminLoeschen = async (id) => {
    try {
      await window.api.termine.delete(id)
      await ladeTermine()
    } catch (err) {
      console.error('[TerminePanel] Fehler beim Löschen:', err)
    }
  }

  const heute = localDateStr(new Date())
  const sortiert = [...termine].sort((a, b) => {
    const d = a.datum.localeCompare(b.datum)
    return d !== 0 ? d : (a.uhrzeit ?? '').localeCompare(b.uhrzeit ?? '')
  })
  const kommend   = sortiert.filter(t => t.datum >= heute)
  const vergangen = sortiert.filter(t => t.datum < heute).reverse()

  return (
    <div className="flex flex-col bg-zinc-800 border-t border-zinc-700/60 flex-shrink-0" style={{ height: hoehe }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between flex-shrink-0 border-b border-zinc-700/60">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Termine</span>
        <button
          className="text-zinc-500 hover:text-zinc-200 text-sm w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={() => setNeueingabe(v => !v)}
          title="Termin hinzufügen"
        >+</button>
      </div>

      {/* Liste */}
      <div className="overflow-y-auto flex-1">
        <div className="px-3 py-2 space-y-1.5">
          {neueingabe && (
            <TerminForm
              klassen={klassen}
              onSpeichern={terminErstellen}
              onAbbrechen={() => setNeueingabe(false)}
            />
          )}

          {kommend.length === 0 && !neueingabe && (
            <p className="text-[11px] text-zinc-600 text-center py-2">Keine bevorstehenden Termine</p>
          )}

          {kommend.map(t => (
            <TerminKarte
              key={t.id}
              termin={t}
              klassen={klassen}
              onDelete={terminLoeschen}
              onEdit={terminBearbeiten}
              flashRef={el => { itemRefs.current[t.id] = el }}
              flashed={flashedId === t.id}
            />
          ))}

          {vergangen.length > 0 && (
            <div className="border-t border-zinc-700/60 pt-1">
              <button
                className="w-full text-left text-[10px] text-zinc-600 hover:text-zinc-400 py-1 flex items-center gap-1 transition-colors"
                onClick={() => setVergangeneOffen(o => !o)}
              >
                <span>{vergangeneOffen ? '▾' : '▸'}</span>
                Vergangene ({vergangen.length})
              </button>
              {vergangeneOffen && (
                <div className="space-y-1.5 mt-1">
                  {vergangen.map(t => (
                    <TerminKarte
                      key={t.id}
                      termin={t}
                      klassen={klassen}
                      onDelete={terminLoeschen}
                      onEdit={terminBearbeiten}
                      flashRef={el => { itemRefs.current[t.id] = el }}
                      flashed={flashedId === t.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function TerminForm({ initial, klassen, stundenzeiten, onSpeichern, onAbbrechen }) {
  const hatStundeInitial = !!initial?.stunde_id
  const [titel, setTitel]         = useState(initial?.titel ?? '')
  const [datum, setDatum]         = useState(initial?.datum ?? localDateStr(new Date()))
  const [zeitModus, setZeitModus] = useState(hatStundeInitial ? 'stunde' : 'uhrzeit')
  const [uhrzeit, setUhrzeit]     = useState(initial?.uhrzeit ?? '')
  const [stundeId, setStundeId]   = useState(initial?.stunde_id ? String(initial.stunde_id) : '')
  const [notiz, setNotiz]         = useState(initial?.notiz ?? '')
  const [klasseId, setKlasseId]   = useState(initial?.klasse_id ? String(initial.klasse_id) : '')
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const speichern = async () => {
    const t = titel.trim()
    if (!t || !datum) return
    await onSpeichern({
      titel: t, datum,
      uhrzeit: zeitModus === 'uhrzeit' ? (uhrzeit || null) : null,
      stundeId: zeitModus === 'stunde' ? (stundeId ? parseInt(stundeId) : null) : null,
      notiz: notiz.trim() || null,
      klasseId: klasseId ? parseInt(klasseId) : null,
    })
  }

  return (
    <div className="space-y-2 bg-coral-50 dark:bg-ink-800 rounded-2xl p-3 border border-coral-200 dark:border-coral-700/60 shadow-softer animate-pop-in">
      <input
        ref={inputRef}
        className="w-full text-sm bg-transparent outline-none text-ink-800 dark:text-paper-100 placeholder:text-ink-400 dark:placeholder:text-ink-500 border-b border-coral-200 dark:border-ink-700 pb-1 font-medium"
        placeholder="Titel…"
        value={titel}
        onChange={e => setTitel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') speichern(); if (e.key === 'Escape') onAbbrechen() }}
      />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-ink-500 dark:text-ink-500 flex-shrink-0">📅 Datum:</span>
        <input
          type="date"
          className="flex-1 text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 cursor-pointer"
          value={datum}
          onChange={e => setDatum(e.target.value)}
        />
      </div>

      {/* Zeit-Modus Toggle */}
      <div className="flex rounded-lg overflow-hidden border border-coral-200 dark:border-ink-700 text-[10px]">
        <button
          className={`flex-1 py-1 transition-colors font-medium ${zeitModus === 'uhrzeit' ? 'bg-coral-500 text-white' : 'text-ink-600 dark:text-ink-400 hover:bg-coral-100 dark:hover:bg-ink-700'}`}
          onClick={() => setZeitModus('uhrzeit')}
          type="button"
        >Uhrzeit</button>
        <button
          className={`flex-1 py-1 transition-colors font-medium ${zeitModus === 'stunde' ? 'bg-coral-500 text-white' : 'text-ink-600 dark:text-ink-400 hover:bg-coral-100 dark:hover:bg-ink-700'}`}
          onClick={() => setZeitModus('stunde')}
          type="button"
        >Unterrichtsstunde</button>
      </div>

      {zeitModus === 'uhrzeit' ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-500 flex-shrink-0">🕐 Uhrzeit:</span>
          <input
            type="time"
            className="flex-1 text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 cursor-pointer"
            value={uhrzeit}
            onChange={e => setUhrzeit(e.target.value)}
          />
        </div>
      ) : (
        <select
          className="w-full text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-1"
          value={stundeId}
          onChange={e => setStundeId(e.target.value)}
        >
          <option value="">Stunde wählen…</option>
          {stundenzeiten.map(s => (
            <option key={s.id} value={s.id}>{s.stunde}. Stunde {s.beginn ? `(${s.beginn})` : ''}</option>
          ))}
        </select>
      )}

      {klassen.length > 0 && (
        <select
          className="w-full text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-1"
          value={klasseId}
          onChange={e => setKlasseId(e.target.value)}
        >
          <option value="">Keine Klasse</option>
          {klassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      )}
      <input
        className="w-full text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 placeholder:text-ink-400 dark:placeholder:text-ink-600 border-t border-coral-200 dark:border-ink-700 pt-1.5"
        placeholder="Notiz (optional)"
        value={notiz}
        onChange={e => setNotiz(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') speichern(); if (e.key === 'Escape') onAbbrechen() }}
      />
      <div className="flex gap-1.5 pt-0.5">
        <button
          className="flex-1 text-xs py-1.5 rounded-xl bg-coral-500 text-white hover:bg-coral-600 active:scale-[0.98] transition-all font-semibold shadow-softer"
          onClick={speichern}
        >
          {initial ? 'Speichern' : 'Hinzufügen'}
        </button>
        <button
          className="text-xs px-2.5 py-1.5 rounded-xl text-ink-500 hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
          onClick={onAbbrechen}
        >✕</button>
      </div>
    </div>
  )
}

function TerminKarte({ termin, klassen, stundenzeiten, onDelete, onEdit, flashRef, flashed }) {
  const [editModus, setEditModus] = useState(false)
  const heute = localDateStr(new Date())
  const vergangen = termin.datum < heute

  const stundeNummer = termin.stunde_id
    ? stundenzeiten.find(s => s.id === termin.stunde_id)?.stunde
    : null
  const stundeLabel = stundeNummer != null ? `${stundeNummer}. Std` : null
  const klassenFarbe = klassen.find(k => k.id === termin.klasse_id)?.farbe ?? null

  if (editModus) {
    return (
      <TerminForm
        initial={termin}
        klassen={klassen}
        stundenzeiten={stundenzeiten}
        onSpeichern={async (data) => { await onEdit(termin.id, data); setEditModus(false) }}
        onAbbrechen={() => setEditModus(false)}
      />
    )
  }

  // Default-Farbe (kein klassenFarbe): subtiler Coral-Hauch
  const bgColor  = klassenFarbe ? klassenFarbe + '1a' : 'rgb(251 105 54 / 0.06)'
  const leftCol  = klassenFarbe ?? '#fb6936'

  return (
    <div
      ref={flashRef}
      className={`group flex items-start gap-2 p-2 rounded-xl border transition-all hover:shadow-soft ${vergangen ? 'opacity-50' : ''} ${flashed ? 'border-coral-400 ring-2 ring-coral-400/40 animate-pop-in' : 'border-transparent'}`}
      style={{ backgroundColor: bgColor, borderLeftColor: leftCol, borderLeftWidth: 3 }}
    >
      <div className="flex-shrink-0 text-center min-w-[36px]">
        <div className="text-[10px] font-bold text-coral-600 dark:text-coral-400 leading-tight">
          {new Date(termin.datum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
        </div>
        {stundeLabel && (
          <div className="text-[9px] text-ink-500 leading-tight">{stundeLabel}</div>
        )}
        {!stundeLabel && termin.uhrzeit && (
          <div className="text-[9px] text-ink-500 leading-tight">{termin.uhrzeit}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-800 dark:text-paper-200 leading-snug truncate">{termin.titel}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {termin.klasse_name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-400 font-semibold">
              {termin.klasse_name}
            </span>
          )}
          {termin.notiz && (
            <span className="text-[10px] text-ink-500 truncate">{termin.notiz}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        <button
          className="text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={() => setEditModus(true)}
          title="Bearbeiten"
        >✎</button>
        <button
          className="text-ink-500 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
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
  const [stundenzeiten, setStundenzeiten] = useState([])
  const itemRefs = useRef({})

  useEffect(() => {
    ladeTermine()
    window.api.stundenzeiten.getAll().then(setStundenzeiten)
      .catch(e => console.error('stundenzeiten.getAll:', e))
  }, [])

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
    <div
      className={`flex flex-col bg-white dark:bg-ink-900 ${hoehe == null ? 'flex-1' : 'flex-shrink-0 border-t border-paper-200 dark:border-ink-800'}`}
      style={hoehe == null ? undefined : { height: hoehe }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-paper-200 dark:border-ink-800">
        <span className="text-sm font-bold text-ink-800 dark:text-paper-100 flex items-center gap-2">
          <span aria-hidden>📅</span> Termine
        </span>
        <button
          className="text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 w-7 h-7 flex items-center justify-center rounded-xl hover:bg-coral-50 dark:hover:bg-coral-900/30 transition-all active:scale-95"
          onClick={() => setNeueingabe(v => !v)}
          title="Termin hinzufügen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Liste */}
      <div className="overflow-y-auto flex-1">
        <div className="px-3 py-3 space-y-1.5">
          {neueingabe && (
            <TerminForm
              klassen={klassen}
              stundenzeiten={stundenzeiten}
              onSpeichern={terminErstellen}
              onAbbrechen={() => setNeueingabe(false)}
            />
          )}

          {kommend.length === 0 && !neueingabe && (
            <div className="text-center py-8 text-ink-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-xs">Keine bevorstehenden Termine</p>
            </div>
          )}

          {kommend.map(t => (
            <TerminKarte
              key={t.id}
              termin={t}
              klassen={klassen}
              stundenzeiten={stundenzeiten}
              onDelete={terminLoeschen}
              onEdit={terminBearbeiten}
              flashRef={el => { itemRefs.current[t.id] = el }}
              flashed={flashedId === t.id}
            />
          ))}

          {vergangen.length > 0 && (
            <div className="border-t border-paper-200 dark:border-ink-800 pt-1.5 mt-1.5">
              <button
                className="w-full text-left text-[11px] text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 py-1 flex items-center gap-1 transition-colors"
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
                      stundenzeiten={stundenzeiten}
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

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
    const onKey = e => { if (e.key === 'Escape') onAbbrechen() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAbbrechen])

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

  const labelCls = 'block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1'

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onAbbrechen()}>
      <div className="modal-box">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-5">{initial ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>

        <div className="mb-4">
          <label className={labelCls}>Titel</label>
          <input
            ref={inputRef}
            className="input"
            placeholder="z.B. Elternabend"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') speichern() }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls}>Datum</label>
            <input type="date" className="input" value={datum} onChange={e => setDatum(e.target.value)} />
          </div>
          {klassen.length > 0 && (
            <div>
              <label className={labelCls}>Klasse</label>
              <select className="input" value={klasseId} onChange={e => setKlasseId(e.target.value)}>
                <option value="">Keine Klasse</option>
                {klassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className={labelCls}>Zeit</label>
          <div className="flex rounded-lg overflow-hidden border border-paper-200 dark:border-ink-700 text-xs mb-2">
            <button type="button" className={`flex-1 py-1.5 font-medium transition-colors ${zeitModus === 'uhrzeit' ? 'bg-coral-500 text-white' : 'text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700'}`} onClick={() => setZeitModus('uhrzeit')}>Uhrzeit</button>
            <button type="button" className={`flex-1 py-1.5 font-medium transition-colors ${zeitModus === 'stunde' ? 'bg-coral-500 text-white' : 'text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700'}`} onClick={() => setZeitModus('stunde')}>Unterrichtsstunde</button>
          </div>
          {zeitModus === 'uhrzeit' ? (
            <input type="time" className="input" value={uhrzeit} onChange={e => setUhrzeit(e.target.value)} />
          ) : (
            <select className="input" value={stundeId} onChange={e => setStundeId(e.target.value)}>
              <option value="">Stunde wählen…</option>
              {stundenzeiten.map(s => <option key={s.id} value={s.id}>{s.stunde}. Stunde {s.beginn ? `(${s.beginn})` : ''}</option>)}
            </select>
          )}
        </div>

        <div className="mb-6">
          <label className={labelCls}>Notiz <span className="font-normal text-ink-400">(optional)</span></label>
          <input
            className="input"
            placeholder="Notiz"
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') speichern() }}
          />
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onAbbrechen}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={speichern} disabled={!titel.trim() || !datum}>
            {initial ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TerminKarte({ termin, klassen, stundenzeiten, onDelete, onEdit, flashRef, flashed }) {
  const heute = localDateStr(new Date())
  const vergangen = termin.datum < heute

  const stundeNummer = termin.stunde_id
    ? stundenzeiten.find(s => s.id === termin.stunde_id)?.stunde
    : null
  const stundeLabel = stundeNummer != null ? `${stundeNummer}. Std` : null
  const klassenFarbe = klassen.find(k => k.id === termin.klasse_id)?.farbe ?? null

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
          onClick={() => onEdit(termin)}
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
  const [formModal, setFormModal] = useState(null) // null | { initial: null|termin }
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

  const terminSpeichern = async (data) => {
    try {
      if (formModal?.initial) {
        await window.api.termine.update(formModal.initial.id, data)
      } else {
        if (!aktuellesSchuljahr) { console.warn('[TerminePanel] kein aktuellesSchuljahr'); return }
        await window.api.termine.create({ ...data, schuljahrId: aktuellesSchuljahr.id })
      }
      await ladeTermine()
      setFormModal(null)
    } catch (err) {
      console.error('[TerminePanel] Fehler beim Speichern:', err)
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
          onClick={() => setFormModal({ initial: null })}
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
          {kommend.length === 0 && (
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
              onEdit={t => setFormModal({ initial: t })}
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
                      onEdit={t => setFormModal({ initial: t })}
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

      {formModal && (
        <TerminForm
          initial={formModal.initial}
          klassen={klassen}
          stundenzeiten={stundenzeiten}
          onSpeichern={terminSpeichern}
          onAbbrechen={() => setFormModal(null)}
        />
      )}
    </div>
  )
}

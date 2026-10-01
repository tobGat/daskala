// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Termin anlegen/bearbeiten. Zeitmodus: Uhrzeit · Unterrichtsstunde · Ganztägig.
// Optionales „bis"-Datum für mehrtägige Termine. Wird vom Termine-Panel und vom
// Kalender genutzt. `initial` = bestehender Termin (Bearbeiten) | null (neu);
// `preset` = Vorbelegung für einen neuen Termin ({ datum, uhrzeit }).
import React, { useState, useEffect, useRef } from 'react'

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TerminForm({ initial, preset, klassen, stundenzeiten, onSpeichern, onAbbrechen, onLoeschen }) {
  const start = initial || preset || {}
  const initModus = initial?.ganztags ? 'ganztags' : (start.stunde_id ? 'stunde' : 'uhrzeit')

  const [titel, setTitel]           = useState(start.titel ?? '')
  const [datum, setDatum]           = useState(start.datum ?? localDateStr(new Date()))
  const [bisDatum, setBisDatum]     = useState(initial?.bis_datum ?? '')
  const [zeitModus, setZeitModus]   = useState(initModus)
  const [uhrzeit, setUhrzeit]       = useState(start.uhrzeit ?? '')
  const [bisUhrzeit, setBisUhrzeit] = useState(start.bis_uhrzeit ?? '')
  const [stundeId, setStundeId]     = useState(start.stunde_id ? String(start.stunde_id) : '')
  const [notiz, setNotiz]           = useState(start.notiz ?? '')
  const [klasseId, setKlasseId]     = useState(start.klasse_id ? String(start.klasse_id) : '')
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
    // Ungültiges bis-Datum (vor dem Start) verwerfen.
    const bd = bisDatum && bisDatum > datum ? bisDatum : null
    await onSpeichern({
      titel: t, datum,
      bisDatum: bd,
      ganztags: zeitModus === 'ganztags' ? 1 : 0,
      uhrzeit: zeitModus === 'uhrzeit' ? (uhrzeit || null) : null,
      bisUhrzeit: zeitModus === 'uhrzeit' && uhrzeit ? (bisUhrzeit || null) : null,
      stundeId: zeitModus === 'stunde' ? (stundeId ? parseInt(stundeId) : null) : null,
      notiz: notiz.trim() || null,
      klasseId: klasseId ? parseInt(klasseId) : null,
    })
  }

  const labelCls = 'block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1'
  const modusBtn = (id, label) => (
    <button
      type="button"
      className={`flex-1 py-1.5 font-medium transition-colors ${zeitModus === id ? 'bg-coral-500 text-white' : 'text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700'}`}
      onClick={() => setZeitModus(id)}
    >{label}</button>
  )

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
          <div>
            <label className={labelCls}>Bis <span className="font-normal text-ink-400">(optional, mehrtägig)</span></label>
            <input type="date" className="input" value={bisDatum} min={datum} onChange={e => setBisDatum(e.target.value)} />
          </div>
        </div>

        {klassen.length > 0 && (
          <div className="mb-4">
            <label className={labelCls}>Klasse</label>
            <select className="input" value={klasseId} onChange={e => setKlasseId(e.target.value)}>
              <option value="">Keine Klasse</option>
              {klassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
        )}

        <div className="mb-4">
          <label className={labelCls}>Zeit</label>
          <div className="flex rounded-lg overflow-hidden border border-paper-200 dark:border-ink-700 text-xs mb-2">
            {modusBtn('uhrzeit', 'Uhrzeit')}
            {modusBtn('stunde', 'Unterrichtsstunde')}
            {modusBtn('ganztags', 'Ganztägig')}
          </div>
          {zeitModus === 'uhrzeit' && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <span className="block text-[10px] text-ink-400 mb-0.5">Von</span>
                <input type="time" className="input" value={uhrzeit} onChange={e => setUhrzeit(e.target.value)} />
              </div>
              <span className="text-ink-400 pb-2.5">–</span>
              <div className="flex-1">
                <span className="block text-[10px] text-ink-400 mb-0.5">Bis <span className="font-normal">(optional)</span></span>
                <input type="time" className="input" value={bisUhrzeit} onChange={e => setBisUhrzeit(e.target.value)} disabled={!uhrzeit} />
              </div>
            </div>
          )}
          {zeitModus === 'stunde' && (
            <select className="input" value={stundeId} onChange={e => setStundeId(e.target.value)}>
              <option value="">Stunde wählen…</option>
              {stundenzeiten.map(s => <option key={s.id} value={s.id}>{s.stunde}. Stunde {s.beginn ? `(${s.beginn})` : ''}</option>)}
            </select>
          )}
          {zeitModus === 'ganztags' && (
            <p className="text-[11px] text-ink-400 leading-snug">Ganztägiger Termin{bisDatum && bisDatum > datum ? ' über mehrere Tage' : ''} – ohne feste Uhrzeit.</p>
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
          {initial && onLoeschen && (
            <button className="btn-danger" onClick={() => onLoeschen(initial.id)} title="Termin löschen">Löschen</button>
          )}
          <button className="btn-primary flex-1" onClick={speichern} disabled={!titel.trim() || !datum}>
            {initial ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}

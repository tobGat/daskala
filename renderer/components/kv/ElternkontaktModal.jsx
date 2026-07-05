// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import { toLocalDateStr } from '../../utils/datum'

const ART = [
  { id: 'telefon',         label: '☎️ Telefon' },
  { id: 'mail',            label: '✉️ Mail' },
  { id: 'persoenlich',     label: '🤝 Persönlich' },
  { id: 'elternsprechtag', label: '📅 Elternsprechtag' },
]

const INITIATOR = [
  { id: 'kv',     label: 'KV' },
  { id: 'eltern', label: 'Eltern' },
]

export default function ElternkontaktModal({ schueler, initial = null, onClose, onSaved }) {
  const [datum,     setDatum]     = useState(initial?.datum ?? toLocalDateStr(new Date()))
  const [art,       setArt]       = useState(initial?.art ?? 'telefon')
  const [initiator, setInitiator] = useState(initial?.initiator ?? 'kv')
  const [thema,     setThema]     = useState(initial?.thema ?? '')
  const [inhalt,    setInhalt]    = useState(initial?.inhalt ?? '')
  const [erledigt,  setErledigt]  = useState(initial?.erledigt ?? 1)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSpeichern = async () => {
    if (!thema.trim()) return
    setSaving(true)
    try {
      const data = {
        schuelerId: schueler.id,
        datum, art, initiator,
        thema: thema.trim(),
        inhalt: inhalt.trim() || null,
        erledigt: erledigt ? 1 : 0,
      }
      if (initial) {
        await window.api.kv.elternkontakte.update(initial.id, data)
      } else {
        await window.api.kv.elternkontakte.create(data)
      }
      onSaved?.()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink-900 dark:text-white">
            {initial ? 'Elternkontakt bearbeiten' : 'Elternkontakt protokollieren'}
          </h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-paper-200 dark:hover:bg-ink-800">✕</button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-ink-500">Für: <span className="font-semibold text-ink-700 dark:text-paper-200">{schueler.nachname} {schueler.vorname}</span></p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Datum</label>
              <input type="date" className="input" value={datum} onChange={e => setDatum(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Art</label>
              <select className="input" value={art} onChange={e => setArt(e.target.value)}>
                {ART.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Initiator</label>
            <div className="flex gap-1.5">
              {INITIATOR.map(o => (
                <button
                  key={o.id}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ${
                    initiator === o.id
                      ? 'bg-coral-500 text-white border-coral-500'
                      : 'bg-white dark:bg-ink-800 border-paper-300 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-coral-300'
                  }`}
                  onClick={() => setInitiator(o.id)}
                  type="button"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Thema *</label>
            <input className="input" value={thema} onChange={e => setThema(e.target.value)} placeholder="z.B. Leistung, Verhalten, Absprache" autoFocus />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Inhalt / Notiz</label>
            <textarea className="input resize-none" rows={4} value={inhalt} onChange={e => setInhalt(e.target.value)} placeholder="Worum ging es konkret? Vereinbarungen?" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={!erledigt} onChange={e => setErledigt(e.target.checked ? 0 : 1)} />
            <span className="text-sm text-ink-700 dark:text-paper-200">Rückruf offen (noch zu erledigen)</span>
          </label>
          {!erledigt && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
              ℹ️ Offene Rückrufe erzeugen nach 3 Tagen automatisch einen Trigger.
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn-primary flex-1" disabled={saving || !thema.trim()} onClick={handleSpeichern}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

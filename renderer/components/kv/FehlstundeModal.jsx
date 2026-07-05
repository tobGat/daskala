// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import { toLocalDateStr } from '../../utils/datum'

export default function FehlstundeModal({ schueler, initial = null, onClose, onSaved }) {
  const [datum,        setDatum]        = useState(initial?.datum ?? toLocalDateStr(new Date()))
  const [stunden,      setStunden]      = useState(String(initial?.stunden ?? 1))
  const [entschuldigt, setEntschuldigt] = useState(initial?.entschuldigt ?? 0)
  const [grund,        setGrund]        = useState(initial?.grund ?? '')
  const [saving,       setSaving]       = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSpeichern = async () => {
    const stundenZahl = parseInt(stunden, 10)
    if (!datum || !(stundenZahl >= 1)) return
    setSaving(true)
    try {
      const data = {
        schuelerId: schueler.id,
        datum,
        stunden: stundenZahl,
        entschuldigt: entschuldigt ? 1 : 0,
        grund: grund.trim() || null,
      }
      if (initial) {
        await window.api.kv.fehlstunden.update(initial.id, data)
      } else {
        await window.api.kv.fehlstunden.create(data)
      }
      onSaved?.()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink-900 dark:text-white">
            {initial ? 'Fehlstunde bearbeiten' : 'Fehlstunden eintragen'}
          </h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-paper-200 dark:hover:bg-ink-800">✕</button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-ink-500">Für: <span className="font-semibold text-ink-700 dark:text-paper-200">{schueler.nachname} {schueler.vorname}</span></p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Datum</label>
              <input type="date" className="input" value={datum} onChange={e => setDatum(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Stunden</label>
              <input type="number" min="1" max="10" className="input tabular-nums" value={stunden} onChange={e => setStunden(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Status</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ${
                  entschuldigt
                    ? 'bg-mint-100 dark:bg-mint-900/40 text-mint-700 dark:text-mint-300 border-mint-300 dark:border-mint-700'
                    : 'bg-white dark:bg-ink-800 border-paper-300 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-mint-300'
                }`}
                onClick={() => setEntschuldigt(1)}
              >
                Entschuldigt
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ${
                  !entschuldigt
                    ? 'bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-300 border-coral-300 dark:border-coral-700'
                    : 'bg-white dark:bg-ink-800 border-paper-300 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-coral-300'
                }`}
                onClick={() => setEntschuldigt(0)}
              >
                Unentschuldigt
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Grund (optional)</label>
            <input className="input" value={grund} onChange={e => setGrund(e.target.value)} placeholder="z.B. Krankheit, Termin" />
          </div>

          {!entschuldigt && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
              ℹ️ Unentschuldigte Stunden ≥ 15 (warn) bzw. ≥ 30 (kritisch) erzeugen automatisch einen Trigger.
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn-primary flex-1" disabled={saving || !(parseInt(stunden) >= 1)} onClick={handleSpeichern}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

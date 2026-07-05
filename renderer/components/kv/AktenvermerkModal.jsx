// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import { toLocalDateStr } from '../../utils/datum'

const TYPEN = [
  { id: 'vorfall',              label: 'Vorfall',                      emoji: '⚠️' },
  { id: 'gespraech_eltern',     label: 'Gespräch mit Eltern',          emoji: '💬' },
  { id: 'gespraech_schueler',   label: 'Gespräch mit Schüler:in',      emoji: '🗣️' },
  { id: 'beobachtung',          label: 'Beobachtung',                  emoji: '👁️' },
  { id: 'erziehungsmassnahme',  label: 'Erziehungsmaßnahme',           emoji: '🎯' },
]

export default function AktenvermerkModal({ klasseId, schueler, schuelerListe = [], initial = null, onClose, onSaved }) {
  const [schuelerId,    setSchuelerId]    = useState(initial?.schueler_id ?? schueler?.id ?? '')
  const [datum,         setDatum]         = useState(initial?.datum ?? toLocalDateStr(new Date()))
  const [typ,           setTyp]           = useState(initial?.typ ?? 'beobachtung')
  const [titel,         setTitel]         = useState(initial?.titel ?? '')
  const [beschreibung,  setBeschreibung]  = useState(initial?.beschreibung ?? '')
  const [zeugen,        setZeugen]        = useState(initial?.zeugen ?? '')
  const [folgemassnahme, setFolgemassnahme] = useState(initial?.folgemassnahme ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSpeichern = async () => {
    if (!titel.trim() || !beschreibung.trim()) return
    setSaving(true)
    try {
      const data = {
        schuelerId: schuelerId ? parseInt(schuelerId) : null,
        klasseId,
        datum, typ,
        titel: titel.trim(),
        beschreibung: beschreibung.trim(),
        zeugen: zeugen.trim() || null,
        folgemassnahme: folgemassnahme.trim() || null,
      }
      if (initial) {
        await window.api.kv.aktenvermerke.update(initial.id, data)
      } else {
        await window.api.kv.aktenvermerke.create(data)
      }
      onSaved?.()
      onClose()
    } finally { setSaving(false) }
  }

  const istVorfall = typ === 'vorfall'

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink-900 dark:text-white">
            {initial ? 'Aktenvermerk bearbeiten' : 'Neuer Aktenvermerk'}
          </h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-paper-200 dark:hover:bg-ink-800">✕</button>
        </div>

        <div className="space-y-3">
          {/* Schüler-Auswahl (wenn nicht fest) */}
          {!schueler && schuelerListe.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Schüler:in (optional, falls klassenweit)</label>
              <select className="input" value={schuelerId} onChange={e => setSchuelerId(e.target.value)}>
                <option value="">— Klasse allgemein —</option>
                {schuelerListe.map(s => <option key={s.id} value={s.id}>{s.nachname} {s.vorname}</option>)}
              </select>
            </div>
          )}
          {schueler && (
            <p className="text-xs text-ink-500">Für: <span className="font-semibold text-ink-700 dark:text-paper-200">{schueler.nachname} {schueler.vorname}</span></p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Datum</label>
              <input type="date" className="input" value={datum} onChange={e => setDatum(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Typ</label>
              <select className="input" value={typ} onChange={e => setTyp(e.target.value)}>
                {TYPEN.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Titel *</label>
            <input className="input" value={titel} onChange={e => setTitel(e.target.value)} placeholder="Kurzbezeichnung" autoFocus />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Beschreibung *</label>
            <textarea className="input resize-none" rows={4} value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Was ist passiert? Wann? Wo? Wer war beteiligt?" />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Zeugen</label>
            <input className="input" value={zeugen} onChange={e => setZeugen(e.target.value)} placeholder="Optional: anwesende Personen" />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Folgemaßnahme</label>
            <textarea className="input resize-none" rows={2} value={folgemassnahme} onChange={e => setFolgemassnahme(e.target.value)} placeholder="Optional: nächste Schritte" />
          </div>

          {istVorfall && !initial && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              ℹ️ Bei Typ „Vorfall" wird automatisch ein Trigger erzeugt.
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn-primary flex-1" disabled={saving || !titel.trim() || !beschreibung.trim()} onClick={handleSpeichern}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

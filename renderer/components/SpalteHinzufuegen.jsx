// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

const KATEGORIEN = [
  { id: 'MA', label: 'Mitarbeit', kuerzel: 'MA', farbe: 'bg-green-100 text-green-800' },
  { id: 'HÜ', label: 'Hausübung', kuerzel: 'HÜ', farbe: 'bg-coral-100 text-coral-800' },
  { id: 'T', label: 'Test', kuerzel: 'T', farbe: 'bg-purple-100 text-purple-800' },
  { id: 'SA', label: 'Schularbeit', kuerzel: 'SA', farbe: 'bg-orange-100 text-orange-800' },
  { id: 'CUSTOM', label: 'Individuell', kuerzel: '', farbe: 'bg-paper-100 text-ink-800' },
]

export default function SpalteHinzufuegen({ onClose }) {
  const { aktivesFach, aktiveSemester, ladeSpalten, refreshZeugnisnoten, gewichtungGlobal, openModal } = useStore()
  const [kategorie, setKategorie] = useState('MA')
  const [kuerzel, setKuerzel] = useState('MA')
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [notiz, setNotiz] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const kat = KATEGORIEN.find(k => k.id === kategorie)
    if (kat && kat.id !== 'CUSTOM') {
      setKuerzel(kat.kuerzel)
    }
  }, [kategorie])

  // MA & HÜ zählen als Einfluss (keine Gewichtung) → keine 0%-Warnung.
  // Nur SA/Test/Individuell bilden die Note und haben ein effektives Gewicht.
  const istEinfluss = kategorie === 'MA' || kategorie === 'HÜ'
  const fachKey = { SA: 'gewichtung_sa', T: 'gewichtung_t', CUSTOM: 'gewichtung_custom' }[kategorie]
  const effektivesGewicht = istEinfluss ? null : (aktivesFach?.[fachKey] ?? gewichtungGlobal?.[kategorie] ?? 0)
  const zeigeNullGewichtHinweis = !istEinfluss && effektivesGewicht === 0

  const handleSpeichern = async () => {
    if (!kuerzel.trim()) return
    if (!aktivesFach) return
    setLoading(true)
    try {
      await window.api.spalten.create({
        fachId: aktivesFach.id,
        semester: aktiveSemester,
        kategorie,
        kuerzel: kuerzel.trim(),
        datum: datum || null,
        notiz: notiz.trim() || null,
      })
      await ladeSpalten()
      await refreshZeugnisnoten()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-5">Spalte hinzufügen</h2>

        {/* Kategorie-Auswahl */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Kategorie</label>
          <div className="grid grid-cols-2 gap-2">
            {KATEGORIEN.map(kat => (
              <button
                key={kat.id}
                className={`px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors border-2
                  ${kategorie === kat.id
                    ? 'border-coral-500 bg-coral-50 dark:bg-coral-900 text-coral-700 dark:text-coral-300'
                    : 'border-transparent bg-paper-100 dark:bg-ink-700 text-ink-700 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-600'}`}
                onClick={() => setKategorie(kat.id)}
              >
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-2 ${kat.farbe}`}>{kat.kuerzel || 'IND'}</span>
                {kat.label}
              </button>
            ))}
          </div>
        </div>


        {/* Hinweis bei 0%-Gewicht */}
        {zeigeNullGewichtHinweis && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 text-xs leading-snug">
            ⚠ Die Kategorie <strong>{KATEGORIEN.find(k => k.id === kategorie)?.label}</strong> hat aktuell 0 % Gewichtung — Einträge fliessen nicht in die ZN ein.{' '}
            <button
              type="button"
              className="underline hover:text-amber-900 dark:hover:text-amber-200"
              onClick={() => { onClose(); openModal('einstellungen') }}
            >
              In Einstellungen anpassen
            </button>
          </div>
        )}

        {/* Kürzel */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">
            Kürzel {kategorie !== 'CUSTOM' && <span className="text-ink-400 font-normal">(anpassbar)</span>}
          </label>
          <input
            className="input"
            value={kuerzel}
            onChange={e => setKuerzel(e.target.value)}
            placeholder="z.B. SA, T, MA"
            maxLength={10}
          />
        </div>

        {/* Datum */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">Datum</label>
          <input
            className="input"
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
          />
        </div>

        {/* Thema / Notiz */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">
            {istEinfluss ? 'Notiz' : 'Thema'} <span className="text-ink-400 font-normal">(optional, erscheint als Tooltip)</span>
          </label>
          <textarea
            className="input resize-none"
            rows={2}
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={istEinfluss ? 'z.B. Hinweise…' : 'z.B. Rechtschreibung, Bruchrechnen…'}
          />
        </div>

        {/* Semester */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">Semester</label>
          <span className="text-sm text-ink-500 dark:text-ink-400 bg-paper-100 dark:bg-ink-700 px-3 py-1.5 rounded">
            Semester {aktiveSemester} (aktuell)
          </span>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading || !kuerzel.trim()}>
            {loading ? 'Speichern…' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}

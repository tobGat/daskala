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

// Default-Symbole + Stufen-Labels der 4-stufigen Mitarbeit (Reihenfolge sehr+ … sehr−).
const MA_SMILEYS = ['😄', '🙂', '🙁', '😞']
const MA_STUFEN_LABEL = ['sehr positiv', 'positiv', 'negativ', 'sehr negativ']
// Default-Symbole der Mitarbeitsnote (Noten 1…5).
const MA_NOTE_DEFAULT = ['1', '2', '3', '4', '5']

// Info-Texte für den Hover-Tooltip je Bewertungsskala.
const SKALA_INFO = {
  pm: { titel: '+ / − (Einfluss)', text: 'Bonus/Malus: verschiebt die Note leicht. Zählt nicht als eigene Note.' },
  pfeil: { titel: '↗ / ↘ (Einfluss)', text: 'Wie + / − – nur andere Darstellung. Bonus/Malus, keine eigene Note.' },
  smiley: { titel: '4-stufig (Einfluss)', text: 'Vier Stufen von sehr positiv bis sehr negativ (Bonus/Malus). Symbole frei wählbar.' },
  note: { titel: 'Note 1–5 (echte Note)', text: 'Benotete Mitarbeit: zählt wie SA/Test als vollwertige Note mit eigener Gewichtung, niveau-fähig. Symbole frei wählbar.' },
}

export default function SpalteHinzufuegen({ onClose }) {
  const { aktivesFach, aktiveSemester, spalten, ladeSpalten, refreshZeugnisnoten, gewichtungGlobal, openModal, modalData } = useStore()
  // Vorauswahl der Kategorie (z. B. aus dem mobilen Speed-Dial); Fallback MA.
  // Bei Vorauswahl entfällt die Kategorie-Auswahl im Modal – nur die Überschrift zeigt die Kategorie.
  const vorgewaehlt = KATEGORIEN.some(k => k.id === modalData?.kategorie)
  const initialKat = vorgewaehlt ? modalData.kategorie : 'MA'
  const [kategorie, setKategorie] = useState(initialKat)
  const [kuerzel, setKuerzel] = useState(KATEGORIEN.find(k => k.id === initialKat)?.kuerzel ?? '')
  // Variante der Mitarbeits-Skala: 'pm' (+ / −), 'pfeil' (↗ / ↘), 'smiley' (vierstufig).
  // Vorauswahl = zuletzt in einer MA-Spalte gewählte Variante.
  const letzteMaVariante = (() => {
    const maSp = (spalten || []).filter(s => s.kategorie === 'MA')
    if (!maSp.length) return 'pm'
    const last = maSp.reduce((a, b) => (b.id > a.id ? b : a))
    if (last.ma_stufen === 4) return 'smiley'
    return last.ma_symbol === 'pfeil' ? 'pfeil' : 'pm'
  })()
  const [maVariante, setMaVariante] = useState(letzteMaVariante)
  // Eigene 4-stufige Symbole: Vorauswahl = zuletzt genutzte eigene Symbole, sonst Smileys.
  const letzteMaSymbole = (() => {
    const maVier = (spalten || []).filter(s => s.kategorie === 'MA' && s.ma_stufen === 4 && s.ma_symbole)
    if (!maVier.length) return null
    const last = maVier.reduce((a, b) => (b.id > a.id ? b : a))
    try {
      const arr = JSON.parse(last.ma_symbole)
      if (Array.isArray(arr) && arr.length === 4) return arr
    } catch { /* Default */ }
    return null
  })()
  const [maSymbole, setMaSymbole] = useState(letzteMaSymbole ?? MA_SMILEYS)
  // Eigene Symbole der Mitarbeitsnote (5 Stück): Vorauswahl = zuletzt genutzte, sonst 1…5.
  const letzteNoteSymbole = (() => {
    const man = (spalten || []).filter(s => s.kategorie === 'MAN' && s.ma_symbole)
    if (!man.length) return null
    const last = man.reduce((a, b) => (b.id > a.id ? b : a))
    try {
      const arr = JSON.parse(last.ma_symbole)
      if (Array.isArray(arr) && arr.length === 5) return arr
    } catch { /* Default */ }
    return null
  })()
  const [noteSymbole, setNoteSymbole] = useState(letzteNoteSymbole ?? MA_NOTE_DEFAULT)
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [notiz, setNotiz] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const kat = KATEGORIEN.find(k => k.id === kategorie)
    if (kat && kat.id !== 'CUSTOM') {
      setKuerzel(kat.kuerzel)
    }
  }, [kategorie])

  // Mitarbeit mit Skala „Note (1–5)" ist eine echte Note (Kategorie MAN), kein Einfluss.
  const istNoteMA = kategorie === 'MA' && maVariante === 'note'
  const effektiveKategorie = istNoteMA ? 'MAN' : kategorie
  const kategorieLabel = istNoteMA ? 'Mitarbeitsnote' : KATEGORIEN.find(k => k.id === kategorie)?.label

  // MA (+/−, Smileys) & HÜ zählen als Einfluss (keine Gewichtung) → keine 0%-Warnung.
  // SA/Test/Individuell/Mitarbeitsnote bilden die Note und haben ein effektives Gewicht.
  const istEinfluss = (kategorie === 'MA' && !istNoteMA) || kategorie === 'HÜ'
  const fachKey = { SA: 'gewichtung_sa', T: 'gewichtung_t', CUSTOM: 'gewichtung_custom', MAN: 'gewichtung_man' }[effektiveKategorie]
  const effektivesGewicht = istEinfluss ? null : (aktivesFach?.[fachKey] ?? gewichtungGlobal?.[effektiveKategorie] ?? 0)
  const zeigeNullGewichtHinweis = !istEinfluss && effektivesGewicht === 0

  // 4-stufige Symbole: nur bei „smiley"-Skala relevant. Gültig = 4 nicht-leere, verschiedene Symbole.
  const istVierstufig = kategorie === 'MA' && maVariante === 'smiley'
  const symboleTrim = maSymbole.map(s => (s ?? '').trim())
  const symboleGueltig = !istVierstufig ||
    (symboleTrim.every(s => s.length >= 1 && s.length <= 4) && new Set(symboleTrim).size === 4)
  const istDefaultSmileys = symboleTrim.join(' ') === MA_SMILEYS.join(' ')

  // Note-Symbole: nur bei „note"-Skala. Gültig = 5 nicht-leere, verschiedene Symbole.
  const noteSymboleTrim = noteSymbole.map(s => (s ?? '').trim())
  const noteSymboleGueltig = !istNoteMA ||
    (noteSymboleTrim.every(s => s.length >= 1 && s.length <= 4) && new Set(noteSymboleTrim).size === 5)
  const istDefaultNoten = noteSymboleTrim.join(' ') === MA_NOTE_DEFAULT.join(' ')

  // Eigene Symbole an die Spalte übergeben: 4 (smiley) bzw. 5 (note), nur wenn nicht Default.
  const maSymboleSubmit = istVierstufig && !istDefaultSmileys ? symboleTrim
    : istNoteMA && !istDefaultNoten ? noteSymboleTrim
      : undefined

  const handleSpeichern = async () => {
    if (!kuerzel.trim()) return
    if (!aktivesFach) return
    if (!symboleGueltig || !noteSymboleGueltig) return
    setLoading(true)
    try {
      await window.api.spalten.create({
        fachId: aktivesFach.id,
        semester: aktiveSemester,
        kategorie: effektiveKategorie,
        kuerzel: kuerzel.trim(),
        datum: datum || null,
        notiz: notiz.trim() || null,
        maStufen: istVierstufig ? 4 : 2,
        maSymbol: kategorie === 'MA' && maVariante === 'pfeil' ? 'pfeil' : 'pm',
        maSymbole: maSymboleSubmit,
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
      <div className="modal-box max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-5 flex items-center gap-2">
          {vorgewaehlt ? (
            <>
              <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${KATEGORIEN.find(k => k.id === kategorie)?.farbe}`}>
                {KATEGORIEN.find(k => k.id === kategorie)?.kuerzel || 'IND'}
              </span>
              {KATEGORIEN.find(k => k.id === kategorie)?.label} hinzufügen
            </>
          ) : 'Spalte hinzufügen'}
        </h2>

        {/* Kategorie-Auswahl – nur ohne Vorauswahl (Desktop / generisches „+") */}
        {!vorgewaehlt && (
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
        )}


        {/* Bewertungsskala – nur für Mitarbeit */}
        {kategorie === 'MA' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Bewertungsskala</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'pm', label: '+ / −' },
                { id: 'pfeil', label: '↗ / ↘' },
                { id: 'smiley', label: '😄 🙂 🙁 😞' },
                { id: 'note', label: 'Note (1–5)' },
              ].map(v => {
                const info = SKALA_INFO[v.id]
                const istNoteOpt = v.id === 'note'   // echte Note → farblich (teal) abgesetzt
                const aktiv = maVariante === v.id
                const cls = aktiv
                  ? (istNoteOpt
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-200'
                    : 'border-coral-500 bg-coral-50 dark:bg-coral-900 text-coral-700 dark:text-coral-300')
                  : (istNoteOpt
                    ? 'border-teal-200 dark:border-teal-800/60 bg-teal-50/60 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40'
                    : 'border-transparent bg-paper-100 dark:bg-ink-700 text-ink-700 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-600')
                return (
                  <div key={v.id} className="relative group">
                    <button
                      type="button"
                      className={`w-full px-2 py-2 rounded-lg text-sm font-medium transition-colors border-2 ${cls}`}
                      onClick={() => setMaVariante(v.id)}
                    >
                      {v.label}
                    </button>
                    {/* Hover-Tooltip mit Info zur Bewertungsvariante */}
                    <div className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1.5 w-44 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-xl p-2 text-[11px] leading-snug text-ink-600 dark:text-paper-300 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-0.5">{info.titel}</p>
                      {info.text}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-500 dark:text-ink-400 leading-snug">
              {maVariante === 'smiley'
                ? '4-stufig von sehr positiv bis sehr negativ. Standard sind Smileys 😄🙂🙁😞 – du kannst sie unten durch eigene Symbole ersetzen (z. B. +, +~, -~, -). Einfluss je Stufe in den Einstellungen (Erweitert).'
                : maVariante === 'note'
                  ? 'Benotete Mitarbeit: echte Note 1–5 mit eigener Gewichtung – niveau-fähig (AHS/ST). Ermöglicht eine Zeugnisnote auch in Fächern ohne Schularbeiten/Tests.'
                  : '↗ / ↘ ist nur eine andere Darstellung von + / − – die Bewertung ist identisch.'}
            </p>

            {/* Eigene Symbole für die 4-stufige Skala */}
            {maVariante === 'smiley' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-ink-600 dark:text-paper-300 mb-1.5">Symbole (sehr positiv → sehr negativ)</label>
                <div className="grid grid-cols-4 gap-2">
                  {MA_STUFEN_LABEL.map((stufe, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <input
                        className={`input text-center px-1 py-1.5 text-base ${!symboleGueltig ? 'border-red-400 dark:border-red-500' : ''}`}
                        value={maSymbole[i] ?? ''}
                        maxLength={4}
                        onChange={e => setMaSymbole(prev => prev.map((s, j) => (j === i ? e.target.value : s)))}
                      />
                      <span className="text-[9px] text-ink-400 leading-tight text-center">{stufe}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-400"
                    onClick={() => setMaSymbole(MA_SMILEYS)}
                  >
                    Smileys zurücksetzen
                  </button>
                  {!symboleGueltig && (
                    <span className="text-[11px] text-red-500">4 verschiedene, nicht-leere Symbole nötig.</span>
                  )}
                </div>
              </div>
            )}

            {/* Eigene Symbole für die Note-Skala (Noten 1…5) */}
            {maVariante === 'note' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-ink-600 dark:text-paper-300 mb-1.5">Symbole (Note 1 → 5)</label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <input
                        className={`input text-center px-1 py-1.5 text-base ${!noteSymboleGueltig ? 'border-red-400 dark:border-red-500' : ''}`}
                        value={noteSymbole[i] ?? ''}
                        maxLength={4}
                        onChange={e => setNoteSymbole(prev => prev.map((s, j) => (j === i ? e.target.value : s)))}
                      />
                      <span className="text-[9px] text-ink-400 leading-tight text-center">Note {n}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-400"
                    onClick={() => setNoteSymbole(MA_NOTE_DEFAULT)}
                  >
                    Ziffern 1–5 zurücksetzen
                  </button>
                  {!noteSymboleGueltig && (
                    <span className="text-[11px] text-red-500">5 verschiedene, nicht-leere Symbole nötig.</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-400 dark:text-ink-500 leading-snug">
                  Die Symbole ersetzen nur die Anzeige/Eingabe – intern zählt die Position als Note 1–5.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Hinweis bei 0%-Gewicht */}
        {zeigeNullGewichtHinweis && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 text-xs leading-snug">
            ⚠ Die Kategorie <strong>{kategorieLabel}</strong> hat aktuell 0 % Gewichtung — Einträge fliessen nicht in die ZN ein.{' '}
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
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading || !kuerzel.trim() || !symboleGueltig || !noteSymboleGueltig}>
            {loading ? 'Speichern…' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
// Default-Symbole + Labels der 3-stufigen Mitarbeit (positiv, neutral, negativ).
const MA_DREI = ['+', '~', '-']
const MA_DREI_LABEL = ['positiv', 'neutral', 'negativ']

// Info-Texte für den Hover-Tooltip je Bewertungsskala. Alle Stufen bilden gemeinsam die
// Mitarbeitsnote (§ 4 Abs. 2 LBVO) – keine Einzelnoten mehr.
const SKALA_INFO = {
  pm: { titel: '+ / −', text: 'Zwei Stufen (positiv/negativ). Alle Aufzeichnungen ergeben zusammen die Mitarbeitsnote.' },
  pfeil: { titel: '↗ / ↘', text: 'Wie + / − – nur andere Darstellung. Bildet gemeinsam die Mitarbeitsnote.' },
  dreistufig: { titel: '+ / ~ / −', text: 'Drei Stufen: positiv, neutral (~ = Note 3), negativ. Symbole frei wählbar.' },
  smiley: { titel: '4-stufig', text: 'Vier Stufen von sehr positiv bis sehr negativ (😄 zählt stärker als 🙂). Symbole frei wählbar.' },
}

export default function SpalteHinzufuegen({ onClose }) {
  const { aktivesFach, aktiveSemester, spalten, ladeSpalten, refreshZeugnisnoten, gewichtungGlobal, openModal, modalData } = useStore()
  // Vorauswahl der Kategorie (z. B. aus dem mobilen Speed-Dial); Fallback MA.
  // Bei Vorauswahl entfällt die Kategorie-Auswahl im Modal – nur die Überschrift zeigt die Kategorie.
  const vorgewaehlt = KATEGORIEN.some(k => k.id === modalData?.kategorie)
  const initialKat = vorgewaehlt ? modalData.kategorie : 'MA'
  const [kategorie, setKategorie] = useState(initialKat)
  const [kuerzel, setKuerzel] = useState(KATEGORIEN.find(k => k.id === initialKat)?.kuerzel ?? '')
  // Variante der Mitarbeits-Skala: 'pm' (+ / −), 'pfeil' (↗ / ↘), 'dreistufig' (+ / ~ / −),
  // 'smiley' (vierstufig). Vorauswahl = zuletzt in einer MA-Spalte gewählte Variante.
  const letzteMaVariante = (() => {
    const maSp = (spalten || []).filter(s => s.kategorie === 'MA')
    if (!maSp.length) return 'pm'
    const last = maSp.reduce((a, b) => (b.id > a.id ? b : a))
    if (last.ma_stufen === 4) return 'smiley'
    if (last.ma_stufen === 3) return 'dreistufig'
    return last.ma_symbol === 'pfeil' ? 'pfeil' : 'pm'
  })()
  const [maVariante, setMaVariante] = useState(letzteMaVariante)
  // Eigene Symbole je Skala: Vorauswahl = zuletzt genutzte eigene Symbole, sonst Default.
  const letzteSymboleVon = (stufen, laenge, fallback) => {
    const cols = (spalten || []).filter(s => s.kategorie === 'MA' && s.ma_stufen === stufen && s.ma_symbole)
    if (!cols.length) return fallback
    const last = cols.reduce((a, b) => (b.id > a.id ? b : a))
    try {
      const arr = JSON.parse(last.ma_symbole)
      if (Array.isArray(arr) && arr.length === laenge) return arr
    } catch { /* Default */ }
    return fallback
  }
  const [maSymbole, setMaSymbole] = useState(() => letzteSymboleVon(4, 4, MA_SMILEYS))
  const [dreiSymbole, setDreiSymbole] = useState(() => letzteSymboleVon(3, 3, MA_DREI))
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [notiz, setNotiz] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const kat = KATEGORIEN.find(k => k.id === kategorie)
    if (kat && kat.id !== 'CUSTOM') {
      setKuerzel(kat.kuerzel)
    }
  }, [kategorie])

  const kategorieLabel = KATEGORIEN.find(k => k.id === kategorie)?.label
  // Mitarbeit/Hausübung: freie Notiz; SA/Test/Individuell: Thema der Leistung.
  const istMitarbeit = kategorie === 'MA' || kategorie === 'HÜ'

  // Alle Kategorien sind note-bildend. MA (Bonus/Malus, alle Skalen) UND HÜ ergeben zusammen die
  // Mitarbeitsnote mit Gewicht gewichtung_ma; SA/Test/Individuell haben ihr eigenes Gewicht.
  const gewGlobalKey = (kategorie === 'MA' || kategorie === 'HÜ') ? 'MA' : kategorie
  const fachKey = { SA: 'gewichtung_sa', T: 'gewichtung_t', CUSTOM: 'gewichtung_custom', MA: 'gewichtung_ma', 'HÜ': 'gewichtung_ma' }[kategorie]
  const effektivesGewicht = aktivesFach?.[fachKey] ?? gewichtungGlobal?.[gewGlobalKey] ?? 0
  const zeigeNullGewichtHinweis = effektivesGewicht === 0

  // 4-stufige Symbole: nur bei „smiley"-Skala. Gültig = 4 nicht-leere, verschiedene Symbole.
  const istVierstufig = kategorie === 'MA' && maVariante === 'smiley'
  const symboleTrim = maSymbole.map(s => (s ?? '').trim())
  const symboleGueltig = !istVierstufig ||
    (symboleTrim.every(s => s.length >= 1 && s.length <= 4) && new Set(symboleTrim).size === 4)
  const istDefaultSmileys = symboleTrim.join(' ') === MA_SMILEYS.join(' ')

  // 3-stufige Symbole: nur bei „dreistufig"-Skala. Gültig = 3 nicht-leere, verschiedene Symbole.
  const istDreistufig = kategorie === 'MA' && maVariante === 'dreistufig'
  const dreiTrim = dreiSymbole.map(s => (s ?? '').trim())
  const dreiGueltig = !istDreistufig ||
    (dreiTrim.every(s => s.length >= 1 && s.length <= 4) && new Set(dreiTrim).size === 3)
  const istDefaultDrei = dreiTrim.join(' ') === MA_DREI.join(' ')

  // Eigene Symbole an die Spalte übergeben: 4 (smiley) bzw. 3 (dreistufig), nur wenn nicht Default.
  const maSymboleSubmit = istVierstufig && !istDefaultSmileys ? symboleTrim
    : istDreistufig && !istDefaultDrei ? dreiTrim
      : undefined

  const handleSpeichern = async () => {
    if (!kuerzel.trim()) return
    if (!aktivesFach) return
    if (!symboleGueltig || !dreiGueltig) return
    setLoading(true)
    try {
      await window.api.spalten.create({
        fachId: aktivesFach.id,
        semester: aktiveSemester,
        kategorie,
        kuerzel: kuerzel.trim(),
        datum: datum || null,
        notiz: notiz.trim() || null,
        maStufen: istVierstufig ? 4 : (istDreistufig ? 3 : 2),
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
                { id: 'dreistufig', label: '+ / ~ / −' },
                { id: 'smiley', label: '😄 🙂 🙁 😞' },
              ].map(v => {
                const info = SKALA_INFO[v.id]
                const aktiv = maVariante === v.id
                const cls = aktiv
                  ? 'border-coral-500 bg-coral-50 dark:bg-coral-900 text-coral-700 dark:text-coral-300'
                  : 'border-transparent bg-paper-100 dark:bg-ink-700 text-ink-700 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-600'
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
                ? '4-stufig von sehr positiv bis sehr negativ (😄 zählt stärker als 🙂). Standard sind Smileys 😄🙂🙁😞 – unten durch eigene Symbole ersetzbar.'
                : maVariante === 'dreistufig'
                  ? 'Drei Stufen: positiv (Note 1), neutral ~ (Note 3), negativ (Note 5). Symbole unten frei wählbar.'
                  : maVariante === 'pfeil'
                    ? '↗ / ↘ ist nur eine andere Darstellung von + / − – die Bewertung ist identisch.'
                    : 'Positiv (+) und negativ (−). Alle Aufzeichnungen ergeben zusammen die Mitarbeitsnote.'}
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

            {/* Eigene Symbole für die 3-stufige Skala (positiv → negativ) */}
            {maVariante === 'dreistufig' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-ink-600 dark:text-paper-300 mb-1.5">Symbole (positiv → negativ)</label>
                <div className="grid grid-cols-3 gap-2">
                  {MA_DREI_LABEL.map((stufe, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <input
                        className={`input text-center px-1 py-1.5 text-base ${!dreiGueltig ? 'border-red-400 dark:border-red-500' : ''}`}
                        value={dreiSymbole[i] ?? ''}
                        maxLength={4}
                        onChange={e => setDreiSymbole(prev => prev.map((s, j) => (j === i ? e.target.value : s)))}
                      />
                      <span className="text-[9px] text-ink-400 leading-tight text-center">{stufe}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-400"
                    onClick={() => setDreiSymbole(MA_DREI)}
                  >
                    Standard (+ ~ −) zurücksetzen
                  </button>
                  {!dreiGueltig && (
                    <span className="text-[11px] text-red-500">3 verschiedene, nicht-leere Symbole nötig.</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-400 dark:text-ink-500 leading-snug">
                  Die Symbole ersetzen nur die Anzeige/Eingabe – intern zählt die Position (positiv/neutral/negativ).
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
            {istMitarbeit ? 'Notiz' : 'Thema'} <span className="text-ink-400 font-normal">(optional, erscheint als Tooltip)</span>
          </label>
          <textarea
            className="input resize-none"
            rows={2}
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={istMitarbeit ? 'z.B. Hinweise…' : 'z.B. Rechtschreibung, Bruchrechnen…'}
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
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading || !kuerzel.trim() || !symboleGueltig || !dreiGueltig}>
            {loading ? 'Speichern…' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}

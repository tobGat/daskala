// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef, useEffect, memo } from 'react'
import useStore from '../store/useStore'
import { niveauZurZeit, niveauBgKlasse } from '../utils/niveau'

// ─── Klick-Cycle-Werte ────────────────────────────────────────────────────────
const MA_CYCLE = ['+', '-', '']
const HUE_CYCLE = ['✓', '✗', '—', '']
// 4-stufige Mitarbeit: sehr fröhlich … sehr traurig (Gewichte in notenberechnung.js).
const MA_SMILEYS = ['😄', '🙂', '🙁', '😞']
const MA_SMILEY_TITEL = { '😄': 'sehr fröhlich (+0,1)', '🙂': 'mäßig fröhlich (+0,05)', '🙁': 'mäßig traurig (−0,05)', '😞': 'sehr traurig (−0,1)' }
// Stufen-Labels für eigene Symbole (Reihenfolge sehr+ … sehr−).
const MA_STUFEN_TITEL = ['sehr positiv (+0,1)', 'positiv (+0,05)', 'negativ (−0,05)', 'sehr negativ (−0,1)']

// Symbolliste einer 4-stufigen MA-Spalte: eigene Symbole (spalten.ma_symbole als JSON) oder Default-Smileys.
function maSymboleVon(spalte) {
  if (spalte?.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === 4) return arr
    } catch { /* Default */ }
  }
  return MA_SMILEYS
}

// Eigene 5 Symbole einer Mitarbeitsnote (MAN) für die Noten 1…5, oder null (normale Zahleneingabe).
function manSymboleVon(spalte) {
  if (spalte?.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === 5) return arr
    } catch { /* Zahleneingabe */ }
  }
  return null
}

function naechsterWert(cycle, aktuell) {
  const idx = cycle.indexOf(aktuell)
  return cycle[(idx + 1) % cycle.length]
}

// ─── Zahlen-Popup für SA/T ────────────────────────────────────────────────────
function ZahlenPopup({ wert, onSelect, onClose, anchorRef }) {
  const popupRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-xl p-1 flex gap-1"
      style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 2 }}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          className={`w-8 h-8 rounded font-bold text-sm transition-colors
            ${wert === String(n)
              ? 'bg-coral-600 text-white'
              : 'hover:bg-paper-100 dark:hover:bg-paper-200 dark:hover:bg-ink-700 text-ink-700 dark:text-paper-300'}`}
          onClick={() => onSelect(String(n))}
        >
          {n}
        </button>
      ))}
      <button
        className="w-8 h-8 rounded text-xs text-ink-400 hover:bg-paper-100 dark:hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
        onClick={() => onSelect('')}
        title="Leeren"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Symbol-Popup für 4-stufige Mitarbeit bzw. Mitarbeitsnote (eigene Symbole) ────
function SmileyPopup({ wert, onSelect, onClose, anchorRef, symbole = MA_SMILEYS, titel }) {
  const popupRef = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-xl p-1 flex gap-1"
      style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 2 }}
    >
      {symbole.map((sm, i) => (
        <button
          key={i}
          className={`min-w-[2rem] h-8 px-1 rounded text-base leading-none transition-colors
            ${wert === sm ? 'bg-coral-600' : 'hover:bg-paper-100 dark:hover:bg-ink-700'}`}
          title={titel ? titel(sm, i) : (MA_SMILEY_TITEL[sm] ?? MA_STUFEN_TITEL[i])}
          onClick={() => onSelect(sm)}
        >
          {sm}
        </button>
      ))}
      <button
        className="w-8 h-8 rounded text-xs text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-700 transition-colors"
        onClick={() => onSelect('')}
        title="Leeren"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Farb-Klassen für Noten ───────────────────────────────────────────────────
function noteKlasse(n) {
  const num = parseInt(n)
  if (num === 1) return 'note-1'
  if (num === 2) return 'note-2'
  if (num === 3) return 'note-3'
  if (num === 4) return 'note-4'
  if (num === 5) return 'note-5'
  return ''
}

// ─── Haupt-Zelle ─────────────────────────────────────────────────────────────
const Zelle = memo(function Zelle({ spalte, schueler }) {
  const { eintraege, setEintrag, aktivesFach, niveaus, niveauHistorie } = useStore()
  const [popupOffen, setPopupOffen] = useState(false)
  const cellRef = useRef(null)

  const key = `${spalte.id}_${schueler.id}`
  const wert = eintraege[key] ?? ''

  const isDifferenziert = aktivesFach?.benotungssystem === 'differenziert'
  // Niveau zur Zeit der Eintragung: nutze Spalten-Datum + Historie
  // Fallback: aktuelles Niveau aus niveaus-Map
  const niveauHier = isDifferenziert
    ? niveauZurZeit(niveauHistorie?.[schueler.id], spalte.datum, niveaus[schueler.id] ?? 'AHS')
    : null

  const istMaVier = spalte.kategorie === 'MA' && spalte.ma_stufen === 4
  // Mitarbeitsnote mit eigenen Symbolen (5 Stück für Note 1…5) statt Zahleneingabe.
  const manSymbole = spalte.kategorie === 'MAN' ? manSymboleVon(spalte) : null
  const istManSymbol = !!manSymbole

  const handleClick = () => {
    if (spalte.kategorie === 'MA') {
      if (istMaVier) { setPopupOffen(true); return }
      const naechster = naechsterWert(MA_CYCLE, wert)
      setEintrag(spalte.id, schueler.id, naechster)
    } else if (spalte.kategorie === 'HÜ') {
      const naechster = naechsterWert(HUE_CYCLE, wert)
      setEintrag(spalte.id, schueler.id, naechster)
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T' || spalte.kategorie === 'CUSTOM' || spalte.kategorie === 'MAN') {
      setPopupOffen(true)
    }
  }

  const handleZahlSelect = async (val) => {
    await setEintrag(spalte.id, schueler.id, val)
    setPopupOffen(false)
  }

  // Anzeige-Inhalt & Farbe
  let anzeigeText = wert
  let anzeigeKlasse = ''

  if (spalte.kategorie === 'MA') {
    if (istMaVier) {
      if (wert) {
        anzeigeText = wert
        // Farbe positionsbasiert: Stufe 0/1 positiv, 2/3 negativ (unabhängig vom Symbol).
        const idx = maSymboleVon(spalte).indexOf(wert)
        anzeigeKlasse = (idx === 0 || idx === 1) ? 'zelle-plus' : (idx === 2 || idx === 3) ? 'zelle-minus' : ''
      }
    } else {
      // Pfeil-Darstellung ist rein optisch – gespeichert bleibt +/−.
      const pfeil = spalte.ma_symbol === 'pfeil'
      if (wert === '+') { anzeigeText = pfeil ? '↗' : '+'; anzeigeKlasse = 'zelle-plus' }
      else if (wert === '-') { anzeigeText = pfeil ? '↘' : '−'; anzeigeKlasse = 'zelle-minus' }
    }
  } else if (spalte.kategorie === 'HÜ') {
    if (wert === '✓') anzeigeKlasse = 'zelle-haken'
    else if (wert === '✗') anzeigeKlasse = 'zelle-kreuz'
    else if (wert === '—') anzeigeKlasse = 'zelle-strich'
  } else if (istManSymbol) {
    // Mitarbeitsnote mit eigenem Symbol: anzeigen + Farbe nach Note (Position+1).
    if (wert) { anzeigeText = wert; anzeigeKlasse = noteKlasse(manSymbole.indexOf(wert) + 1) }
  } else if (wert) {
    anzeigeKlasse = noteKlasse(wert)
  }

  // Niveau-Hintergrund (grünlich AHS / gelblich ST) — Note hat Vorrang bei MA-Farben
  const niveauKlasse = isDifferenziert && !anzeigeKlasse.startsWith('zelle-')
    ? niveauBgKlasse(niveauHier)
    : ''

  const hueHinweis = spalte.kategorie === 'HÜ' ? ' · ✓ gemacht / ✗ nicht gemacht / — nicht gewertet' : ''
  const titleStr = (isDifferenziert
    ? `${schueler.nachname} ${schueler.vorname} | ${spalte.kuerzel} ${spalte.datum ?? ''} · Niveau: ${niveauHier}`
    : `${schueler.nachname} ${schueler.vorname} | ${spalte.kuerzel} ${spalte.datum ?? ''}`) + hueHinweis

  return (
    <td className="p-0 relative" style={{ width: 38, minWidth: 38 }}>
      <div
        ref={cellRef}
        className={`zelle ${niveauKlasse} ${anzeigeKlasse}`}
        onClick={handleClick}
        title={titleStr}
      >
        {anzeigeText}
      </div>
      {popupOffen && (istMaVier
        ? (
          <SmileyPopup
            wert={wert}
            symbole={maSymboleVon(spalte)}
            onSelect={handleZahlSelect}
            onClose={() => setPopupOffen(false)}
            anchorRef={cellRef}
          />
        ) : istManSymbol ? (
          <SmileyPopup
            wert={wert}
            symbole={manSymbole}
            titel={(sm, i) => `Note ${i + 1}`}
            onSelect={handleZahlSelect}
            onClose={() => setPopupOffen(false)}
            anchorRef={cellRef}
          />
        ) : (
          <ZahlenPopup
            wert={wert}
            onSelect={handleZahlSelect}
            onClose={() => setPopupOffen(false)}
            anchorRef={cellRef}
          />
        ))}
    </td>
  )
})

export default Zelle

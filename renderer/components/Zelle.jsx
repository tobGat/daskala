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

// ─── Smiley-Popup für 4-stufige Mitarbeit ─────────────────────────────────────
function SmileyPopup({ wert, onSelect, onClose, anchorRef }) {
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
      {MA_SMILEYS.map(sm => (
        <button
          key={sm}
          className={`w-8 h-8 rounded text-lg leading-none transition-colors
            ${wert === sm ? 'bg-coral-600' : 'hover:bg-paper-100 dark:hover:bg-ink-700'}`}
          title={MA_SMILEY_TITEL[sm]}
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

  const handleClick = () => {
    if (spalte.kategorie === 'MA') {
      if (istMaVier) { setPopupOffen(true); return }
      const naechster = naechsterWert(MA_CYCLE, wert)
      setEintrag(spalte.id, schueler.id, naechster)
    } else if (spalte.kategorie === 'HÜ') {
      const naechster = naechsterWert(HUE_CYCLE, wert)
      setEintrag(spalte.id, schueler.id, naechster)
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T' || spalte.kategorie === 'CUSTOM') {
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
      if (wert) { anzeigeText = wert; anzeigeKlasse = (wert === '😄' || wert === '🙂') ? 'zelle-plus' : 'zelle-minus' }
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

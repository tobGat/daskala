// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import useStore from '../store/useStore'
import { niveauOffset, niveauZurZeit, niveauBgKlasse } from '../utils/niveau'

function noteKlasse(n) {
  const num = Math.round(n)
  if (num === 1) return 'note-1'
  if (num === 2) return 'note-2'
  if (num === 3) return 'note-3'
  if (num === 4) return 'note-4'
  if (num === 5) return 'note-5'
  return ''
}

function TooltipPortal({ anchorRef, children }) {
  const rect = anchorRef.current?.getBoundingClientRect()
  if (!rect) return null

  const tooltipW = 248
  const estimatedH = 220

  let left = rect.right - tooltipW
  let top = rect.top - estimatedH - 8

  if (left < 8) left = 8
  if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - 8 - tooltipW
  if (top < 8) top = rect.bottom + 8

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', left, top, zIndex: 9999, width: tooltipW, pointerEvents: 'none' }}>
      {children}
    </div>,
    document.body
  )
}

function useZNBreakdown(semester, schuelerId, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus) {
  return useMemo(() => {
    if (semester === 3) return null
    const fachSpalten = spalten.filter(s => s.semester === semester)
    if (!fachSpalten.length) return null

    const istDifferenziert = aktivesFach?.benotungssystem === 'differenziert'
    const maxNote = istDifferenziert ? 7 : 5
    const niveauFallback = niveaus?.[schuelerId] ?? 'AHS'
    const offsetFor = (datum) => istDifferenziert
      ? niveauOffset(niveauZurZeit(niveauHistorie?.[schuelerId], datum, niveauFallback))
      : 0

    // MA & HÜ getrennt gedeckelt: Fach-Wert vor global, global fällt auf Alt-Wert zurück.
    const globalAltEinfluss = einstellungen?.ma_hue_max_einfluss
    const maxMaEinfluss = aktivesFach?.ma_max_einfluss != null
      ? aktivesFach.ma_max_einfluss
      : parseFloat(einstellungen?.ma_max_einfluss ?? globalAltEinfluss ?? '0.5')
    const maxHueEinfluss = aktivesFach?.hue_max_einfluss != null
      ? aktivesFach.hue_max_einfluss
      : parseFloat(einstellungen?.hue_max_einfluss ?? globalAltEinfluss ?? '0.5')
    const einflussSchritt = parseFloat(einstellungen?.ma_hue_schritt ?? '0.1')

    // Nur SA/Test/Individuell bilden die Basisnote. MA/HÜ verschieben sie nur (niveau-frei).
    const gew = {
      SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
      T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
      CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.0,
    }
    const KAT_LABEL = { SA: 'SA', T: 'T', CUSTOM: 'Ind.' }

    const basis = { SA: { werte: [], eingaben: [] }, T: { werte: [], eingaben: [] }, CUSTOM: { werte: [], eingaben: [] } }
    let maPlus = 0, maMinus = 0, huePos = 0, hueNeg = 0

    for (const spalte of fachSpalten) {
      const wert = eintraege[`${spalte.id}_${schuelerId}`] ?? ''
      if (!wert) continue
      if (spalte.kategorie === 'MA') {
        if      (wert === '+') maPlus++
        else if (wert === '-') maMinus++
      } else if (spalte.kategorie === 'HÜ') {
        if      (wert === '✓') huePos++
        else if (wert === '✗') hueNeg++
        // '—' = "nicht gewertet / entfällt": bewusst ohne Noteneinfluss, zählt nicht mit.
      } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
        const n = parseInt(wert)
        if (n >= 1 && n <= 5) { basis[spalte.kategorie].werte.push(n + offsetFor(spalte.datum)); basis[spalte.kategorie].eingaben.push(n) }
      } else if (spalte.kategorie === 'CUSTOM') {
        const n = parseInt(wert)
        if (!isNaN(n) && n >= 1 && n <= 5) { basis.CUSTOM.werte.push(n + offsetFor(spalte.datum)); basis.CUSTOM.eingaben.push(n) }
      }
    }

    // Basisnote (gewichtet, nur vorhandene Kategorien)
    const beitraege = []
    let gesamtGewichtung = 0, summe = 0
    for (const kat of ['SA', 'T', 'CUSTOM']) {
      const werte = basis[kat].werte
      if (!werte.length || gew[kat] <= 0) continue
      const avg = werte.reduce((a, b) => a + b, 0) / werte.length
      beitraege.push({ kat: KAT_LABEL[kat], detail: basis[kat].eingaben.join(', '), avg, w: gew[kat] })
      summe += avg * gew[kat]
      gesamtGewichtung += gew[kat]
    }
    const hatBasis = gesamtGewichtung > 0
    const basisIntern = hatBasis ? summe / gesamtGewichtung : null

    // MA-/HÜ-Einfluss "pro Eintrag" (niveau-frei). MA und HÜ unabhängig, je eigene Deckelung, dann summiert.
    const maGesamt = maPlus + maMinus
    const hueGesamt = huePos + hueNeg
    const hatMAHUE = maGesamt > 0 || hueGesamt > 0
    let maEinfluss = maGesamt > 0 ? (maPlus - maMinus) * einflussSchritt : 0
    maEinfluss = Math.max(-maxMaEinfluss, Math.min(maxMaEinfluss, maEinfluss))
    let hueEinfluss = hueGesamt > 0 ? (huePos - hueNeg) * einflussSchritt : 0
    hueEinfluss = Math.max(-maxHueEinfluss, Math.min(maxHueEinfluss, hueEinfluss))
    const einflussPunkte = maEinfluss + hueEinfluss  // positiv = verbessert

    return {
      beitraege, gesamtGewichtung, maxNote, basisIntern, hatBasis,
      ma: { plus: maPlus, minus: maMinus }, hue: { pos: huePos, neg: hueNeg },
      hatMAHUE, einflussPunkte,
    }
  }, [semester, schuelerId, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus])
}

export default function ZeugnisnoteZelle({ schueler, semester }) {
  const {
    zeugnisnoten, aktivesFach, refreshZeugnisnoten,
    einstellungen, spalten, eintraege, gewichtungGlobal,
    niveaus, niveauHistorie,
  } = useStore()

  const isDifferenziert = aktivesFach?.benotungssystem === 'differenziert'
  const niveau = isDifferenziert ? (niveaus[schueler.id] ?? 'AHS') : null
  const offset = niveauOffset(niveau)
  // Skala der angezeigten Auswahl im Manuell-Popup: bei standard 1-5, bei differenziert ebenfalls 1-5 (auf Niveau)
  const maxNote = 5

  // Mappt internen Wert (1-7 bei differenziert) auf angezeigte Note (1-5) mit Deckelung.
  const internZuAnzeige = (intern) => {
    if (intern == null) return null
    const a = intern - offset
    if (a < 1) return 1
    if (a > 5) return 5
    return a
  }

  const [contextMenu, setContextMenu] = useState(null)
  const [manuellPopup, setManuellPopup] = useState(false)
  const [hovered, setHovered] = useState(false)
  const cellRef = useRef(null)

  const key = `${schueler.id}_${semester}`
  const zn = zeugnisnoten[key]
  const noteBerechnet = zn?.note_berechnet          // intern 1-7 bei differenziert
  const noteManuell   = zn?.note_manuell            // intern 1-7 bei differenziert
  const istManuell    = noteManuell !== null && noteManuell !== undefined

  // Angezeigte Werte (auf aktuellem Niveau)
  const noteBerechnetAnzeige = noteBerechnet != null ? noteBerechnet - offset : null
  const noteManuellAnzeige = istManuell ? internZuAnzeige(noteManuell) : null

  const s1Zn = zeugnisnoten[`${schueler.id}_1`]
  const s2Zn = zeugnisnoten[`${schueler.id}_2`]
  // S1/S2-Werte für die Endnote-Anzeige im Tooltip: aufs aktuelle Niveau gemappt
  const s1NoteExakt   = s1Zn?.note_manuell ?? s1Zn?.note_berechnet ?? null
  const s2NoteExakt   = s2Zn?.note_manuell ?? s2Zn?.note_berechnet ?? null
  const s1NoteExaktAnz = s1NoteExakt != null ? s1NoteExakt - offset : null
  const s2NoteExaktAnz = s2NoteExakt != null ? s2NoteExakt - offset : null
  const s1NoteAnzeige = s1Zn?.note_manuell != null ? internZuAnzeige(s1Zn.note_manuell) : (s1Zn?.note_berechnet != null ? Math.max(1, Math.min(5, Math.round(s1Zn.note_berechnet - offset))) : null)
  const s2NoteAnzeige = s2Zn?.note_manuell != null ? internZuAnzeige(s2Zn.note_manuell) : (s2Zn?.note_berechnet != null ? Math.max(1, Math.min(5, Math.round(s2Zn.note_berechnet - offset))) : null)
  const s1Gewichtung  = parseFloat(einstellungen?.s1_gewichtung ?? '0.5')

  // Endgültig in der Zelle angezeigte (sichtbare) Note: gerundet & gedeckelt 1-5
  const anzeigeNote = istManuell
    ? noteManuellAnzeige
    : (noteBerechnet != null ? Math.max(1, Math.min(5, Math.round(noteBerechnet - offset))) : null)

  // "Zwischennote": die berechnete Anzeige liegt exakt auf x,5 (z. B. 2,5) → Lehrer:in wählt
  // die bessere oder schlechtere Note. Bis dahin wird die Kommazahl ausgegraut gezeigt.
  const rohAnzeige = noteBerechnetAnzeige
  const istTie = rohAnzeige != null && rohAnzeige >= 1 && rohAnzeige <= 5 && Math.abs((rohAnzeige % 1) - 0.5) < 0.01
  const tieBesser = istTie ? Math.max(1, Math.floor(rohAnzeige)) : null
  const tieSchlechter = istTie ? Math.min(5, Math.ceil(rohAnzeige)) : null
  const tieLabel = istTie ? rohAnzeige.toFixed(1).replace('.', ',') : null

  const znBreakdown = useZNBreakdown(semester, schueler.id, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus)

  const handleClick         = () => setManuellPopup(true)
  const handleContextMenu   = (e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }

  // Lehrer-Eingabe (1-5 auf aktuellem Niveau) → intern speichern (+ offset bei differenziert)
  const handleManuellSelect = async (note) => {
    if (!aktivesFach) return
    if (note === '') {
      await window.api.zeugnisnoten.setManuell(aktivesFach.id, schueler.id, semester, null)
    } else {
      const intern = parseInt(note) + offset
      await window.api.zeugnisnoten.setManuell(aktivesFach.id, schueler.id, semester, intern)
    }
    await refreshZeugnisnoten()
    setManuellPopup(false)
  }

  const handleReset = async () => {
    if (!aktivesFach) return
    await window.api.zeugnisnoten.clearManuell(aktivesFach.id, schueler.id, semester)
    await refreshZeugnisnoten()
    setContextMenu(null)
  }

  // ── Tooltip-Inhalt ─────────────────────────────────────────────────────────
  const tooltipContent = semester === 3 ? (
    // Zeugnisnote (Jahresnote)
    <div className="bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-2.5">Zeugnisnote – Berechnung</p>

      {/* SN 1 / SN 2 Zeilen — angezeigte Werte sind aufs aktuelle Niveau gemappt */}
      <div className="space-y-1 mb-2.5">
        {[{ label: 'SN 1', exakt: s1NoteExaktAnz, anzeige: s1NoteAnzeige, manuell: s1Zn?.note_manuell != null },
          { label: 'SN 2', exakt: s2NoteExaktAnz, anzeige: s2NoteAnzeige, manuell: s2Zn?.note_manuell != null }
        ].map(({ label, exakt, anzeige, manuell }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-ink-500 dark:text-ink-400">
              {label}{manuell ? <span className="ml-1 text-yellow-500">M</span> : null}
            </span>
            <span className={`font-medium tabular-nums ${anzeige ? noteKlasse(anzeige) : 'text-ink-400'}`}>
              {exakt != null ? exakt.toFixed(2) : '–'}
            </span>
          </div>
        ))}
      </div>

      {/* Formel */}
      <div className="border-t border-paper-100 dark:border-ink-700 pt-2 mb-2.5">
        {s1NoteExaktAnz != null && s2NoteExaktAnz != null ? (
          <p className="font-mono text-[10px] text-ink-400 dark:text-ink-500 leading-relaxed">
            {s1NoteExaktAnz.toFixed(2)} × {Math.round(s1Gewichtung * 100)}%
            {' + '}
            {s2NoteExaktAnz.toFixed(2)} × {Math.round((1 - s1Gewichtung) * 100)}%
          </p>
        ) : s1NoteExaktAnz != null ? (
          <p className="text-[10px] text-ink-400">Nur SN 1 vorhanden → direkt übernommen</p>
        ) : s2NoteExaktAnz != null ? (
          <p className="text-[10px] text-ink-400">Nur SN 2 vorhanden → direkt übernommen</p>
        ) : (
          <p className="text-[10px] text-ink-400">Keine Semesternoten vorhanden</p>
        )}
      </div>

      {/* Ergebnis */}
      <div className="border-t border-paper-100 dark:border-ink-700 pt-2 flex items-center justify-between gap-3">
        <span className="font-semibold text-ink-700 dark:text-paper-200">
          Zeugnisnote{isDifferenziert && <span className="text-ink-400 ml-1 font-normal">({niveau})</span>}{istManuell ? <span className="text-yellow-500 ml-1 font-normal">(manuell)</span> : null}
        </span>
        <span className="tabular-nums">
          {noteBerechnetAnzeige != null
            ? <span className={`font-bold ${anzeigeNote ? noteKlasse(anzeigeNote) : ''}`}>{noteBerechnetAnzeige.toFixed(2)}</span>
            : <span className="text-ink-400">–</span>}
          {istManuell && <span className="text-yellow-500 font-bold ml-1.5">→ {noteManuellAnzeige}</span>}
        </span>
      </div>
    </div>
  ) : (
    // ZN S1 / S2 – Basisnote (SA/Test/Individuell) + Einfluss von Mitarbeit/Hausübung
    <div className="bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-2.5">
        ZN Semester {semester} – Berechnung{isDifferenziert && <span className="text-ink-400 font-normal ml-1">({niveau})</span>}
      </p>

      {znBreakdown && (znBreakdown.hatBasis || znBreakdown.hatMAHUE) ? (
        <>
          {/* Basisnote aus SA / Test / Individuell (avg intern → aufs aktuelle Niveau gemappt) */}
          {znBreakdown.beitraege.length > 0 ? (
            <div className="space-y-1 mb-2">
              {znBreakdown.beitraege.map(({ kat, detail, avg, w }) => {
                const avgAnzeige = avg - offset
                return (
                  <div key={kat} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '3rem 1fr auto auto' }}>
                    <span className="font-semibold text-ink-600 dark:text-ink-400">{kat}</span>
                    <span className="text-ink-400 dark:text-ink-500 truncate">{detail}</span>
                    <span className={`font-medium tabular-nums text-right ${noteKlasse(Math.max(1, Math.min(5, Math.round(avgAnzeige))))}`}>{avgAnzeige.toFixed(2)}</span>
                    <span className="tabular-nums text-right text-ink-400">{Math.round(w * 100)}%</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[10px] text-ink-400 dark:text-ink-500 mb-2 italic">Noch keine Noten (SA/Test/Individuell) – grobe Note aus Mitarbeit/Hausübung.</p>
          )}

          {/* Mitarbeit & Hausübung – nur Einfluss, keine eigene Note */}
          {znBreakdown.hatMAHUE && (
            <div className="border-t border-paper-100 dark:border-ink-700 pt-2 mb-2 space-y-1">
              {(znBreakdown.ma.plus > 0 || znBreakdown.ma.minus > 0) && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-ink-500 dark:text-ink-400">Mitarbeit</span>
                  <span className="tabular-nums text-ink-500 dark:text-ink-400">+{znBreakdown.ma.plus} / −{znBreakdown.ma.minus}</span>
                </div>
              )}
              {(znBreakdown.hue.pos > 0 || znBreakdown.hue.neg > 0) && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-ink-500 dark:text-ink-400">Hausübung</span>
                  <span className="tabular-nums text-ink-500 dark:text-ink-400">✓{znBreakdown.hue.pos} / ✗{znBreakdown.hue.neg}</span>
                </div>
              )}
              {znBreakdown.hatBasis && (
                <div className="flex justify-between text-[10px] font-medium">
                  <span className="text-ink-600 dark:text-ink-300">Einfluss</span>
                  <span className={`tabular-nums ${znBreakdown.einflussPunkte > 0.001 ? 'text-mint-600 dark:text-mint-400' : znBreakdown.einflussPunkte < -0.001 ? 'text-rose-600 dark:text-rose-400' : 'text-ink-400'}`}>
                    {znBreakdown.einflussPunkte > 0.001
                      ? `−${znBreakdown.einflussPunkte.toFixed(2)} (besser)`
                      : znBreakdown.einflussPunkte < -0.001
                        ? `+${Math.abs(znBreakdown.einflussPunkte).toFixed(2)} (schlechter)`
                        : 'neutral'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Ergebnis */}
          <div className="border-t border-paper-100 dark:border-ink-700 pt-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-ink-700 dark:text-paper-200">
              {znBreakdown.hatBasis ? 'Ergebnis' : 'Grobe Note'}{istManuell ? <span className="text-yellow-500 ml-1 font-normal">(manuell)</span> : null}
            </span>
            <span className="tabular-nums">
              {noteBerechnetAnzeige != null
                ? <span className={`font-bold ${anzeigeNote ? noteKlasse(anzeigeNote) : ''}`}>{noteBerechnetAnzeige.toFixed(2)}</span>
                : <span className="text-ink-400">–</span>}
              {istManuell && <span className="text-yellow-500 font-bold ml-1.5">→ {noteManuellAnzeige}</span>}
            </span>
          </div>
        </>
      ) : (
        <p className="text-ink-400 dark:text-ink-500">Noch keine Einträge vorhanden.</p>
      )}
    </div>
  )

  // Bei differenziert: Niveau-Hintergrund nutzt das AKTUELLE Niveau (ZN ist Aggregat → "jetzt"-Sicht)
  const niveauKlasse = isDifferenziert && !istManuell ? niveauBgKlasse(niveau) : ''

  // EN (semester=3) ist sticky-right, damit sie beim horizontalen Scrollen sichtbar bleibt.
  // Eigener BG ist nötig, damit beim Vorbeiscrollen keine Inhalte durchscheinen.
  const istEN = semester === 3
  const tdClassName = istEN
    ? 'p-0 relative bg-white dark:bg-ink-900 border-l-2 border-coral-300 dark:border-coral-700/60'
    : 'p-0 relative'
  const tdStyle = istEN
    ? {
        width: 46, minWidth: 46,
        position: 'sticky', right: 0, zIndex: 4,
        boxShadow: '-3px 0 8px -2px rgba(46, 42, 38, 0.08)',
      }
    : { width: 46, minWidth: 46 }

  return (
    <td className={tdClassName} style={tdStyle}>
      <div
        ref={cellRef}
        className={`zn-zelle cursor-pointer select-none
          ${istManuell ? 'zn-manuell' : niveauKlasse}
          ${istTie && !istManuell ? 'text-ink-400 dark:text-ink-500 italic' : (anzeigeNote ? noteKlasse(anzeigeNote) : 'text-ink-600 dark:text-paper-300')}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={istTie && !istManuell ? 'Zwischennote – bitte bessere oder schlechtere Note wählen' : undefined}
      >
        {istTie && !istManuell ? (
          <span className="tabular-nums">{tieLabel}</span>
        ) : istTie && istManuell ? (
          <span className="flex flex-col items-center justify-center leading-none">
            <span>{anzeigeNote}</span>
            <span className="text-[8px] font-normal text-ink-400 dark:text-ink-500 tabular-nums mt-px" title={`Zwischennote ${tieLabel}`}>{tieLabel}</span>
          </span>
        ) : (
          anzeigeNote != null ? anzeigeNote : '–'
        )}
      </div>

      {/* Hover-Tooltip via Portal */}
      {hovered && (
        <TooltipPortal anchorRef={cellRef}>
          {tooltipContent}
        </TooltipPortal>
      )}

      {/* Manuell-Eingabe Popup */}
      {manuellPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setManuellPopup(false)} />
          <div className="absolute z-50 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-xl p-2"
            style={{ top: '100%', right: 0, marginTop: 2, minWidth: 140 }}>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-2 px-1">
              {semester === 3 ? 'Zeugnisnote' : `Semesternote ${semester}`}
            </p>
            {noteBerechnetAnzeige != null && (
              <p className="text-xs text-ink-400 mb-2 px-1">
                Berechnet: {noteBerechnetAnzeige.toFixed(1)}{isDifferenziert && <span className="ml-1">({niveau})</span>}
              </p>
            )}
            {istTie && (
              <div className="mb-2">
                <p className="text-[11px] text-ink-500 dark:text-ink-400 mb-1 px-1">
                  Zwischennote {tieLabel} – bitte wählen:
                </p>
                <div className="flex gap-1">
                  <button
                    className={`flex-1 h-9 rounded-md font-bold text-sm transition-colors flex items-center justify-center gap-1
                      ${istManuell && noteManuellAnzeige === tieBesser
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60'}`}
                    onClick={() => handleManuellSelect(tieBesser)}
                  >
                    {tieBesser}<span className="text-[10px] font-normal">besser</span>
                  </button>
                  <button
                    className={`flex-1 h-9 rounded-md font-bold text-sm transition-colors flex items-center justify-center gap-1
                      ${istManuell && noteManuellAnzeige === tieSchlechter
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60'}`}
                    onClick={() => handleManuellSelect(tieSchlechter)}
                  >
                    {tieSchlechter}<span className="text-[10px] font-normal">schlechter</span>
                  </button>
                </div>
                <p className="text-[10px] text-ink-400 dark:text-ink-500 mt-1.5 px-1">oder andere Note:</p>
              </div>
            )}
            <div className="flex gap-1 mb-2">
              {Array.from({ length: maxNote }, (_, i) => i + 1).map(n => {
                const istAusgewaehlt = istManuell
                  ? noteManuellAnzeige === n
                  : (noteBerechnetAnzeige != null && Math.max(1, Math.min(5, Math.round(noteBerechnetAnzeige))) === n)
                return (
                  <button
                    key={n}
                    className={`w-8 h-8 rounded font-bold text-sm transition-colors
                      ${istAusgewaehlt
                        ? 'bg-coral-600 text-white'
                        : 'hover:bg-paper-100 dark:hover:bg-paper-200 dark:hover:bg-ink-700 text-ink-700 dark:text-paper-300'}`}
                    onClick={() => handleManuellSelect(n)}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            {istManuell && (
              <button
                className="w-full text-xs text-red-500 hover:text-red-700 py-1"
                onClick={() => handleManuellSelect('')}
              >
                Überschreibung zurücksetzen
              </button>
            )}
          </div>
        </>
      )}

      {/* Rechtsklick-Menü */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y, position: 'fixed' }}>
            {istManuell && (
              <div className="context-menu-item" onClick={handleReset}>
                Berechnung wiederherstellen
              </div>
            )}
            <div className="context-menu-item" onClick={() => { setManuellPopup(true); setContextMenu(null) }}>
              Note manuell setzen
            </div>
          </div>
        </>
      )}
    </td>
  )
}

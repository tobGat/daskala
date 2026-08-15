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

// Mitarbeitsnote-Symbol → Note 1–5 (eigene Symbole via spalten.ma_symbole) oder parseInt.
function manNoteVon(spalte, wert) {
  if (spalte.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === 5) { const i = arr.indexOf(wert); return i >= 0 ? i + 1 : NaN }
    } catch { /* Zahleneingabe */ }
  }
  return parseInt(wert)
}

// Spiegelt core: Symbolliste einer 4-stufigen MA-Spalte (eigene oder Default-Smileys).
const MA_SMILEYS_DEFAULT = ['😄', '🙂', '🙁', '😞']
function maSymboleVon(spalte) {
  if (spalte.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === 4) return arr
    } catch { /* Default */ }
  }
  return MA_SMILEYS_DEFAULT
}

// Spiegelt core maBewertung: { w (vorzeichenbehaftetes Gewicht), dir (±1) } oder null.
// g = { plus, minus, vpos, pos, neg, vneg } aus den Einstellungen.
function maBewertung(spalte, wert, g) {
  if (spalte.ma_stufen === 4) {
    const idx = maSymboleVon(spalte).indexOf(wert)
    if (idx === 0) return { w: g.vpos, dir: 1 }
    if (idx === 1) return { w: g.pos, dir: 1 }
    if (idx === 2) return { w: -g.neg, dir: -1 }
    if (idx === 3) return { w: -g.vneg, dir: -1 }
    return null
  }
  if (wert === '+') return { w: g.plus, dir: 1 }
  if (wert === '-') return { w: -g.minus, dir: -1 }
  return null
}

// Spiegelt core/services/notenberechnung.js:gewichteterSchnitt (§ 20 LBVO), damit die
// Tooltip-Vorschau exakt der berechneten Note entspricht. werte = [{ n, datum, semester, reihenfolge }].
function gewichteterSchnitt(werte, faktor) {
  const m = werte.length
  if (m === 0) return 0
  const f = Number(faktor)
  if (!(f > 1) || m < 2) return werte.reduce((a, w) => a + w.n, 0) / m
  const sortiert = [...werte].sort((a, b) => {
    const da = a.datum || '', db2 = b.datum || ''
    if (da !== db2) return da < db2 ? -1 : 1
    if ((a.semester ?? 0) !== (b.semester ?? 0)) return (a.semester ?? 0) - (b.semester ?? 0)
    return (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0)
  })
  let summe = 0, gew = 0
  sortiert.forEach((w, i) => {
    const g = 1 + (f - 1) * (i / (m - 1))
    summe += w.n * g
    gew += g
  })
  return summe / gew
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

function useZNBreakdown(schuelerId, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus) {
  return useMemo(() => {
    // Die eine durchgehende Note läuft über ALLE Aufzeichnungen beider Semester.
    const fachSpalten = spalten
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
    const rezenzFaktor = parseFloat(einstellungen?.rezenz_faktor ?? '1')
    // Mitarbeits-Gewichte je Stufe wie im Kern (ladeMaGewichte) – Default = bisheriges Verhalten.
    const num = (key, def) => { const v = parseFloat(einstellungen?.[key]); return isNaN(v) ? def : v }
    const maGew = {
      plus: num('ma_w_plus', 0.1), minus: num('ma_w_minus', 0.1),
      vpos: num('ma_w_smiley_vpos', 0.1), pos: num('ma_w_smiley_pos', 0.05),
      neg: num('ma_w_smiley_neg', 0.05), vneg: num('ma_w_smiley_vneg', 0.1),
    }

    // SA/Test/Individuell/Mitarbeitsnote bilden die Basisnote. Symbolische MA/HÜ verschieben sie nur (niveau-frei).
    const gew = {
      SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
      T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
      CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.1,
      MAN:    aktivesFach?.gewichtung_man    ?? gewichtungGlobal?.MAN    ?? 0.3,
    }
    const KAT_LABEL = { SA: 'SA', T: 'T', CUSTOM: 'Ind.', MAN: 'MA-Note' }

    const basis = { SA: { werte: [], eingaben: [] }, T: { werte: [], eingaben: [] }, CUSTOM: { werte: [], eingaben: [] }, MAN: { werte: [], eingaben: [] } }
    // Mitarbeit positionsbasiert wie im Kern: maScore = Roh-Summe der Gewichte, maCount/maDir für Zählung.
    let maScore = 0, maCount = 0, maPlusCount = 0, maMinusCount = 0, huePos = 0, hueNeg = 0

    for (const spalte of fachSpalten) {
      const wert = eintraege[`${spalte.id}_${schuelerId}`] ?? ''
      if (!wert) continue
      if (spalte.kategorie === 'MA') {
        const b = maBewertung(spalte, wert, maGew)
        if (b !== null) { maScore += b.w; maCount++; if (b.dir > 0) maPlusCount++; else maMinusCount++ }
      } else if (spalte.kategorie === 'HÜ') {
        if      (wert === '✓') huePos++
        else if (wert === '✗') hueNeg++
        // '—' = "nicht gewertet / entfällt": bewusst ohne Noteneinfluss, zählt nicht mit.
      } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
        const n = parseInt(wert)
        if (n >= 1 && n <= 5) { basis[spalte.kategorie].werte.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge }); basis[spalte.kategorie].eingaben.push(n) }
      } else if (spalte.kategorie === 'CUSTOM') {
        const n = parseInt(wert)
        if (!isNaN(n) && n >= 1 && n <= 5) { basis.CUSTOM.werte.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge }); basis.CUSTOM.eingaben.push(n) }
      } else if (spalte.kategorie === 'MAN') {
        const n = manNoteVon(spalte, wert)
        if (n >= 1 && n <= 5) { basis.MAN.werte.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge }); basis.MAN.eingaben.push(n) }
      }
    }

    // Basisnote (gewichtet, nur vorhandene Kategorien)
    const beitraege = []
    let gesamtGewichtung = 0, summe = 0
    for (const kat of ['SA', 'T', 'CUSTOM', 'MAN']) {
      const werte = basis[kat].werte
      if (!werte.length || gew[kat] <= 0) continue
      const avg = gewichteterSchnitt(werte, rezenzFaktor)
      beitraege.push({ kat: KAT_LABEL[kat], detail: basis[kat].eingaben.join(', '), avg, w: gew[kat] })
      summe += avg * gew[kat]
      gesamtGewichtung += gew[kat]
    }
    const hatBasis = gesamtGewichtung > 0
    const basisIntern = hatBasis ? summe / gesamtGewichtung : null

    // MA-/HÜ-Einfluss wie im Kern: MA aus der Roh-Summe (maScore), HÜ pro Eintrag; je eigene Deckelung.
    const maGesamt = maCount
    const hueGesamt = huePos + hueNeg
    const hatMA = maGesamt > 0
    const hatMAHUE = maGesamt > 0 || hueGesamt > 0
    let maEinfluss = maGesamt > 0 ? maScore : 0
    maEinfluss = Math.max(-maxMaEinfluss, Math.min(maxMaEinfluss, maEinfluss))
    let hueEinfluss = hueGesamt > 0 ? (huePos - hueNeg) * einflussSchritt : 0
    hueEinfluss = Math.max(-maxHueEinfluss, Math.min(maxHueEinfluss, hueEinfluss))
    const einflussPunkte = maEinfluss + hueEinfluss  // positiv = verbessert

    return {
      beitraege, gesamtGewichtung, maxNote, basisIntern, hatBasis,
      ma: { plus: maPlusCount, minus: maMinusCount }, hue: { pos: huePos, neg: hueNeg },
      hatMAHUE, hatMA, einflussPunkte,
      hatMAN: basis.MAN.werte.length > 0,
    }
  }, [schuelerId, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus])
}

export default function ZeugnisnoteZelle({ schueler }) {
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

  // Die eine durchgehende Note (laufender Jahresstand) – Slot 3.
  const key = `${schueler.id}_3`
  const zn = zeugnisnoten[key]
  const noteBerechnet = zn?.note_berechnet          // intern 1-7 bei differenziert
  const noteManuell   = zn?.note_manuell            // intern 1-7 bei differenziert
  const istManuell    = noteManuell !== null && noteManuell !== undefined

  // Angezeigte Werte (auf aktuellem Niveau)
  const noteBerechnetAnzeige = noteBerechnet != null ? noteBerechnet - offset : null
  const noteManuellAnzeige = istManuell ? internZuAnzeige(noteManuell) : null

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

  const znBreakdown = useZNBreakdown(schueler.id, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus)

  // § 3 LBVO: schriftliche Leistungen dürfen nicht alleinige Beurteilungsgrundlage sein.
  // Warnung, wenn Noten (SA/Test/Individuell) vorliegen, aber KEINE Mitarbeit erfasst wurde.
  // „Mitarbeit" = symbolische Mitarbeit (hatMA) ODER benotete Mitarbeit (hatMAN). Eine bloße
  // Hausübung (✓/✗) ist keine Mitarbeits-Leistungsfeststellung und unterdrückt die Warnung NICHT.
  const maWarnung = einstellungen?.ma_pflicht_warnung !== '0'
    && !!znBreakdown && znBreakdown.hatBasis && !znBreakdown.hatMA && !znBreakdown.hatMAN && !istManuell

  const handleClick         = () => setManuellPopup(true)
  const handleContextMenu   = (e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }

  // Lehrer-Eingabe (1-5 auf aktuellem Niveau) → intern speichern (+ offset bei differenziert)
  const handleManuellSelect = async (note) => {
    if (!aktivesFach) return
    if (note === '') {
      await window.api.zeugnisnoten.setManuell(aktivesFach.id, schueler.id, null)
    } else {
      const intern = parseInt(note) + offset
      await window.api.zeugnisnoten.setManuell(aktivesFach.id, schueler.id, intern)
    }
    await refreshZeugnisnoten()
    setManuellPopup(false)
  }

  const handleReset = async () => {
    if (!aktivesFach) return
    await window.api.zeugnisnoten.clearManuell(aktivesFach.id, schueler.id)
    await refreshZeugnisnoten()
    setContextMenu(null)
  }

  // ── Tooltip-Inhalt ─────────────────────────────────────────────────────────
  // Eine durchgehende Note: Basis (SA/Test/Individuell/MA-Note, rezenz-gewichtet übers
  // ganze Jahr) + Einfluss von Mitarbeit/Hausübung.
  const tooltipContent = (
    <div className="bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-2.5">
        Zeugnisnote <span className="text-ink-400 font-normal">(laufender Stand)</span>{isDifferenziert && <span className="text-ink-400 font-normal ml-1">({niveau})</span>}
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

          {/* § 3 LBVO – keine Mitarbeit erfasst */}
          {maWarnung && (
            <div className="border-t border-paper-100 dark:border-ink-700 pt-2 mb-2 flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
              <span className="shrink-0">⚠</span>
              <span>Keine Mitarbeit erfasst – laut § 3 LBVO dürfen schriftliche Leistungen nicht alleinige Beurteilungsgrundlage sein.</span>
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

  // Die ZN-Spalte ist sticky-right, damit sie beim horizontalen Scrollen sichtbar bleibt.
  // Eigener BG ist nötig, damit beim Vorbeiscrollen keine Inhalte durchscheinen.
  const tdClassName = 'p-0 relative bg-white dark:bg-ink-900 border-l-2 border-coral-300 dark:border-coral-700/60'
  const tdStyle = {
    width: 46, minWidth: 46,
    position: 'sticky', right: 0, zIndex: 4,
    boxShadow: '-3px 0 8px -2px rgba(46, 42, 38, 0.08)',
  }

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

      {/* § 3 LBVO – Hinweis-Badge: keine Mitarbeit erfasst */}
      {maWarnung && (
        <span
          className="absolute top-0 right-0 text-[9px] leading-none text-amber-500 dark:text-amber-400 pointer-events-none"
          title="Keine Mitarbeit erfasst (§ 3 LBVO)"
        >
          ⚠
        </span>
      )}

      {/* Hover-Tooltip via Portal */}
      {hovered && (
        <TooltipPortal anchorRef={cellRef}>
          {tooltipContent}
        </TooltipPortal>
      )}

      {/* Manuell-Eingabe Popup — via Portal, damit es nicht im sticky-Kontext der ZN-Zelle abgeschnitten wird */}
      {manuellPopup && ReactDOM.createPortal((() => {
        const rect = cellRef.current?.getBoundingClientRect()
        const popupW = 200
        const estH = istTie ? 260 : 210
        let left = rect ? rect.right - popupW : 8
        let top = rect ? rect.bottom + 2 : 8
        if (left < 8) left = 8
        if (left + popupW > window.innerWidth - 8) left = window.innerWidth - 8 - popupW
        if (rect && top + estH > window.innerHeight - 8) top = Math.max(8, rect.top - estH - 2)
        return (
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setManuellPopup(false)} />
          <div className="fixed bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-xl p-2"
            style={{ left, top, zIndex: 9999, minWidth: 140, width: popupW }}>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-2 px-1">
              Zeugnisnote
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
        )
      })(), document.body)}

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

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import useStore from '../store/useStore'
import { niveauOffset, niveauBgKlasse } from '../utils/niveau'
import { computeZN } from '../utils/znBreakdown'
import ZeugnisnoteModal from './ZeugnisnoteModal'

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

// Dünner useMemo-Wrapper um die reine computeZN (renderer/utils/znBreakdown.js). Löst die
// effektive Gewichtung (Fach ?? global) auf und übergibt den EFFEKTIVEN Rezenzfaktor
// (per-Schüler ?? global), damit Tooltip-Vorschau = später gespeicherte Note.
function useZNBreakdown(schuelerId, spalten, eintraege, rezenzFaktor, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus) {
  return useMemo(() => {
    // Note-bildende Kategorien: SA/Test/Individuell/Mitarbeit. Die Mitarbeitsnote (MA) entsteht
    // aus dem Durchschnitt der Bonus/Malus- + Hausübungs-Teilnoten (§ 4 Abs. 2 LBVO).
    const gewichtung = {
      SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
      T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
      CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.1,
      MA:     aktivesFach?.gewichtung_ma     ?? gewichtungGlobal?.MA     ?? 0.2,
    }
    return computeZN({
      spalten, eintraege, gewichtung, rezenzFaktor,
      istDifferenziert: aktivesFach?.benotungssystem === 'differenziert',
      niveauHistorie: niveauHistorie?.[schuelerId],
      niveauFallback: niveaus?.[schuelerId] ?? 'AHS',
      schuelerId,
    })
  }, [schuelerId, spalten, eintraege, rezenzFaktor, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus])
}

export default function ZeugnisnoteZelle({ schueler }) {
  const {
    zeugnisnoten, aktivesFach,
    einstellungen, spalten, eintraege, gewichtungGlobal,
    niveaus, niveauHistorie, rezenzFaktoren,
  } = useStore()

  const isDifferenziert = aktivesFach?.benotungssystem === 'differenziert'
  const niveau = isDifferenziert ? (niveaus[schueler.id] ?? 'AHS') : null
  const offset = niveauOffset(niveau)

  // Effektiver Rezenzfaktor (§ 20 LBVO): per-(Fach, Schüler:in) ?? globaler Standard ?? 1.
  const effektiverRezenz = rezenzFaktoren?.[schueler.id] ?? parseFloat(einstellungen?.rezenz_faktor ?? '1')

  // Mappt internen Wert (1-7 bei differenziert) auf angezeigte Note (1-5) mit Deckelung.
  const internZuAnzeige = (intern) => {
    if (intern == null) return null
    const a = intern - offset
    if (a < 1) return 1
    if (a > 5) return 5
    return a
  }

  const [modalOffen, setModalOffen] = useState(false)
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
  const tieLabel = istTie ? rohAnzeige.toFixed(1).replace('.', ',') : null

  const znBreakdown = useZNBreakdown(schueler.id, spalten, eintraege, effektiverRezenz, aktivesFach, gewichtungGlobal, niveauHistorie, niveaus)

  // § 3 LBVO: schriftliche Leistungen dürfen nicht alleinige Beurteilungsgrundlage sein.
  // Warnung, wenn Noten (SA/Test/Individuell) vorliegen, aber KEINE Mitarbeit erfasst wurde
  // (weder Bonus/Malus noch Hausübung – beide bilden zusammen die Mitarbeitsnote).
  const maWarnung = einstellungen?.ma_pflicht_warnung !== '0'
    && !!znBreakdown && znBreakdown.hatBasisNoten && !znBreakdown.hatMitarbeit && !istManuell

  // Klick öffnet das Detail-Modal (manuelle Note, Teilnoten-Editor, Rezenz pro Schüler:in).
  const handleClick = () => setModalOffen(true)

  // ── Tooltip-Inhalt ─────────────────────────────────────────────────────────
  // Eine durchgehende Note: Basis (SA/Test/Individuell/MA-Note, rezenz-gewichtet übers
  // ganze Jahr) + Einfluss von Mitarbeit/Hausübung.
  const tooltipContent = (
    <div className="bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-2.5">
        Zeugnisnote <span className="text-ink-400 font-normal">(laufender Stand)</span>{isDifferenziert && <span className="text-ink-400 font-normal ml-1">({niveau})</span>}
      </p>

      {znBreakdown && znBreakdown.hatBasis ? (
        <>
          {/* Note-bildende Kategorien: SA / Test / Individuell / Mitarbeit. Die Mitarbeit-Zeile
              zeigt die Zusammensetzung (+/− bzw. ✓/✗) und die daraus berechnete Note. */}
          <div className="space-y-1 mb-2">
            {znBreakdown.beitraege.map(({ kat, detail, avg, w }) => {
              const avgAnzeige = avg - offset
              return (
                <div key={kat} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '3.2rem 1fr auto auto' }}>
                  <span className="font-semibold text-ink-600 dark:text-ink-400">{kat}</span>
                  <span className="text-ink-400 dark:text-ink-500 truncate">{detail}</span>
                  <span className={`font-medium tabular-nums text-right ${noteKlasse(Math.max(1, Math.min(5, Math.round(avgAnzeige))))}`}>{avgAnzeige.toFixed(2)}</span>
                  <span className="tabular-nums text-right text-ink-400">{Math.round(w * 100)}%</span>
                </div>
              )
            })}
          </div>

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
              Ergebnis{istManuell ? <span className="text-yellow-500 ml-1 font-normal">(manuell)</span> : null}
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

      {/* Hinweis: die Zelle ist anklickbar (Detail-Ansicht + Bearbeitung) */}
      <div className="border-t border-paper-100 dark:border-ink-700 mt-2 pt-2 flex items-center gap-1.5 text-[10px] text-coral-600 dark:text-coral-300">
        <span className="shrink-0">✎</span>
        <span>Klick öffnet Details &amp; Bearbeitung</span>
      </div>
    </div>
  )

  // Bei differenziert: Niveau-Hintergrund nutzt das AKTUELLE Niveau (ZN ist Aggregat → "jetzt"-Sicht)
  const niveauKlasse = isDifferenziert && !istManuell ? niveauBgKlasse(niveau) : ''

  // Die ZN-Spalte ist sticky-right, damit sie beim horizontalen Scrollen sichtbar bleibt.
  // Deckender BG (opak) + border-collapse:separate an der Tabelle sorgen dafür, dass beim
  // Vorbeiscrollen keine Inhalte durchscheinen.
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

      {/* Detail-Modal: manuelle Note, Teilnoten-Editor, Rezenz pro Schüler:in (§ 20 LBVO) */}
      {modalOffen && (
        <ZeugnisnoteModal schueler={schueler} onClose={() => setModalOffen(false)} />
      )}
    </td>
  )
}

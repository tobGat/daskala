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

    const maPlusWert  = parseFloat(einstellungen?.ma_plus_wert  ?? '1')
    const maMinusWert = parseFloat(einstellungen?.ma_minus_wert ?? '5')

    const gew = {
      SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
      T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
      MA:     aktivesFach?.gewichtung_ma     ?? gewichtungGlobal?.MA     ?? 0.2,
      'HÜ':   aktivesFach?.gewichtung_hue    ?? gewichtungGlobal?.['HÜ'] ?? 0.1,
      CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.0,
    }

    // Interne 1..maxNote-Werte pro Kategorie (mit Niveau-Offset bei differenziert)
    const raw = { SA: [], T: [], MA: { plus: 0, minus: 0, werte: [] }, 'HÜ': { pos: 0, ges: 0, werte: [] }, CUSTOM: [] }

    for (const spalte of fachSpalten) {
      const wert = eintraege[`${spalte.id}_${schuelerId}`] ?? ''
      if (!wert) continue
      const off = offsetFor(spalte.datum)
      if (spalte.kategorie === 'MA') {
        if      (wert === '+') { raw.MA.plus++;  raw.MA.werte.push(maPlusWert + off) }
        else if (wert === '-') { raw.MA.minus++; raw.MA.werte.push(maMinusWert + off) }
      } else if (spalte.kategorie === 'HÜ') {
        raw['HÜ'].ges++
        if      (wert === '✓')              { raw['HÜ'].pos++; raw['HÜ'].werte.push(1 + off) }
        else if (wert === '✗' || wert === '—') { raw['HÜ'].werte.push(5 + off) }
      } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
        const n = parseInt(wert); if (n >= 1 && n <= 5) raw[spalte.kategorie].push(n + off)
      } else if (spalte.kategorie === 'CUSTOM') {
        const n = parseInt(wert); if (!isNaN(n) && n >= 1 && n <= 5) raw.CUSTOM.push(n + off)
      }
    }

    const beitraege = []
    let gesamtGewichtung = 0

    if (raw.MA.werte.length > 0 && gew.MA > 0) {
      const avg = raw.MA.werte.reduce((a, b) => a + b, 0) / raw.MA.werte.length
      beitraege.push({ kat: 'MA', detail: `+${raw.MA.plus} / −${raw.MA.minus}`, avg, w: gew.MA })
      gesamtGewichtung += gew.MA
    }
    if (raw['HÜ'].werte.length > 0 && gew['HÜ'] > 0) {
      const avg = raw['HÜ'].werte.reduce((a, b) => a + b, 0) / raw['HÜ'].werte.length
      beitraege.push({ kat: 'HÜ', detail: `${raw['HÜ'].pos}/${raw['HÜ'].ges} gemacht`, avg, w: gew['HÜ'] })
      gesamtGewichtung += gew['HÜ']
    }
    if (raw.SA.length > 0 && gew.SA > 0) {
      const avg = raw.SA.reduce((a, b) => a + b, 0) / raw.SA.length
      beitraege.push({ kat: 'SA', detail: raw.SA.join(', '), avg, w: gew.SA })
      gesamtGewichtung += gew.SA
    }
    if (raw.T.length > 0 && gew.T > 0) {
      const avg = raw.T.reduce((a, b) => a + b, 0) / raw.T.length
      beitraege.push({ kat: 'T', detail: raw.T.join(', '), avg, w: gew.T })
      gesamtGewichtung += gew.T
    }
    if (raw.CUSTOM.length > 0) {
      const avg = raw.CUSTOM.reduce((a, b) => a + b, 0) / raw.CUSTOM.length
      // Bei 0 % Gewicht trotzdem anzeigen — als Warnung, dass die Einträge nicht zählen
      beitraege.push({ kat: 'Ind.', detail: raw.CUSTOM.join(', '), avg, w: gew.CUSTOM, warnNullGewicht: gew.CUSTOM === 0 })
      if (gew.CUSTOM > 0) gesamtGewichtung += gew.CUSTOM
    }

    return { beitraege, gesamtGewichtung, maxNote }
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
    // Endnote
    <div className="bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-2.5">Endnote – Berechnung</p>

      {/* S1 / S2 Zeilen — angezeigte Werte sind aufs aktuelle Niveau gemappt */}
      <div className="space-y-1 mb-2.5">
        {[{ label: 'ZN S1', exakt: s1NoteExaktAnz, anzeige: s1NoteAnzeige, manuell: s1Zn?.note_manuell != null },
          { label: 'ZN S2', exakt: s2NoteExaktAnz, anzeige: s2NoteAnzeige, manuell: s2Zn?.note_manuell != null }
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
          <p className="text-[10px] text-ink-400">Nur S1 vorhanden → direkt übernommen</p>
        ) : s2NoteExaktAnz != null ? (
          <p className="text-[10px] text-ink-400">Nur S2 vorhanden → direkt übernommen</p>
        ) : (
          <p className="text-[10px] text-ink-400">Keine Semesternoten vorhanden</p>
        )}
      </div>

      {/* Ergebnis */}
      <div className="border-t border-paper-100 dark:border-ink-700 pt-2 flex items-center justify-between gap-3">
        <span className="font-semibold text-ink-700 dark:text-paper-200">
          Endnote{isDifferenziert && <span className="text-ink-400 ml-1 font-normal">({niveau})</span>}{istManuell ? <span className="text-yellow-500 ml-1 font-normal">(manuell)</span> : null}
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
    // ZN S1 / S2
    <div className="bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-ink-700 dark:text-paper-200 mb-2.5">
        ZN Semester {semester} – Berechnung{isDifferenziert && <span className="text-ink-400 font-normal ml-1">({niveau})</span>}
      </p>

      {znBreakdown && znBreakdown.beitraege.length > 0 ? (
        <>
          {/* Kategorien-Tabelle — avg ist intern (1-7 bei differenziert), für Anzeige aufs Niveau mappen */}
          <div className="space-y-1 mb-2.5">
            {znBreakdown.beitraege.map(({ kat, detail, avg, w, warnNullGewicht }) => {
              const avgAnzeige = avg - offset
              const avgGedeckelt = Math.max(1, Math.min(5, avgAnzeige))
              return (
                <div key={kat} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '3rem 1fr auto auto' }}>
                  <span className={`font-semibold ${warnNullGewicht ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'}`}>
                    {kat}{warnNullGewicht && <span title="0 % Gewicht — fliesst nicht in die ZN ein"> ⚠</span>}
                  </span>
                  <span className="text-ink-400 dark:text-ink-500 truncate">{detail}</span>
                  <span className={`font-medium tabular-nums text-right ${noteKlasse(Math.round(avgGedeckelt))}`}>{avgAnzeige.toFixed(2)}</span>
                  <span className={`tabular-nums text-right ${warnNullGewicht ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-ink-400'}`}>
                    {Math.round(w * 100)}%
                  </span>
                </div>
              )
            })}
            {znBreakdown.beitraege.some(b => b.warnNullGewicht) && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 leading-snug">
                ⚠ Diese Spalten haben 0 % Gewichtung und fliessen nicht in die ZN ein. In den Einstellungen anpassen.
              </p>
            )}
          </div>

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
          ${anzeigeNote ? noteKlasse(anzeigeNote) : 'text-ink-600 dark:text-paper-300'}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {anzeigeNote != null ? anzeigeNote : '–'}
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
              {semester === 3 ? 'Endnote' : `Zeugnisnote Semester ${semester}`}
            </p>
            {noteBerechnetAnzeige != null && (
              <p className="text-xs text-ink-400 mb-2 px-1">
                Berechnet: {noteBerechnetAnzeige.toFixed(1)}{isDifferenziert && <span className="ml-1">({niveau})</span>}
              </p>
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

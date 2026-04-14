import React, { useState, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import useStore from '../store/useStore'

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

function useZNBreakdown(semester, schuelerId, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal) {
  return useMemo(() => {
    if (semester === 3) return null
    const fachSpalten = spalten.filter(s => s.semester === semester)
    if (!fachSpalten.length) return null

    const maPlusWert  = parseFloat(einstellungen?.ma_plus_wert  ?? '1')
    const maMinusWert = parseFloat(einstellungen?.ma_minus_wert ?? '5')

    const gew = {
      SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
      T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
      MA:     aktivesFach?.gewichtung_ma     ?? gewichtungGlobal?.MA     ?? 0.2,
      'HÜ':   aktivesFach?.gewichtung_hue    ?? gewichtungGlobal?.['HÜ'] ?? 0.1,
      CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.0,
    }

    const raw = { SA: [], T: [], MA: { plus: 0, minus: 0, werte: [] }, 'HÜ': { pos: 0, ges: 0, werte: [] }, CUSTOM: [] }

    for (const spalte of fachSpalten) {
      const wert = eintraege[`${spalte.id}_${schuelerId}`] ?? ''
      if (!wert) continue
      if (spalte.kategorie === 'MA') {
        if      (wert === '+') { raw.MA.plus++;  raw.MA.werte.push(maPlusWert) }
        else if (wert === '-') { raw.MA.minus++; raw.MA.werte.push(maMinusWert) }
      } else if (spalte.kategorie === 'HÜ') {
        raw['HÜ'].ges++
        if      (wert === '✓')              { raw['HÜ'].pos++; raw['HÜ'].werte.push(1) }
        else if (wert === '✗' || wert === '—') { raw['HÜ'].werte.push(0) }
      } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
        const n = parseInt(wert); if (n >= 1 && n <= 5) raw[spalte.kategorie].push(n)
      } else if (spalte.kategorie === 'CUSTOM') {
        const n = parseInt(wert); if (!isNaN(n) && n >= 1 && n <= 5) raw.CUSTOM.push(n)
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
      const ratio = raw['HÜ'].pos / raw['HÜ'].ges
      const avg = 5 - ratio * 4
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
    if (raw.CUSTOM.length > 0 && gew.CUSTOM > 0) {
      const avg = raw.CUSTOM.reduce((a, b) => a + b, 0) / raw.CUSTOM.length
      beitraege.push({ kat: 'Ind.', detail: raw.CUSTOM.join(', '), avg, w: gew.CUSTOM })
      gesamtGewichtung += gew.CUSTOM
    }

    return { beitraege, gesamtGewichtung }
  }, [semester, schuelerId, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal])
}

export default function ZeugnisnoteZelle({ schueler, semester }) {
  const {
    zeugnisnoten, aktivesFach, refreshZeugnisnoten,
    einstellungen, spalten, eintraege, gewichtungGlobal,
    niveaus,
  } = useStore()

  const isDifferenziert = aktivesFach?.benotungssystem === 'differenziert'
  const niveau = isDifferenziert ? (niveaus[schueler.id] ?? 'AHS') : null
  const maxNote = 5

  const [contextMenu, setContextMenu] = useState(null)
  const [manuellPopup, setManuellPopup] = useState(false)
  const [hovered, setHovered] = useState(false)
  const cellRef = useRef(null)

  const key = `${schueler.id}_${semester}`
  const zn = zeugnisnoten[key]
  const noteBerechnet = zn?.note_berechnet
  const noteManuell   = zn?.note_manuell
  const istManuell    = noteManuell !== null && noteManuell !== undefined

  const s1Zn = zeugnisnoten[`${schueler.id}_1`]
  const s2Zn = zeugnisnoten[`${schueler.id}_2`]
  const s1NoteExakt   = s1Zn?.note_manuell ?? s1Zn?.note_berechnet ?? null
  const s2NoteExakt   = s2Zn?.note_manuell ?? s2Zn?.note_berechnet ?? null
  const s1NoteAnzeige = s1Zn?.note_manuell ?? (s1Zn?.note_berechnet ? Math.round(s1Zn.note_berechnet) : null)
  const s2NoteAnzeige = s2Zn?.note_manuell ?? (s2Zn?.note_berechnet ? Math.round(s2Zn.note_berechnet) : null)
  const s1Gewichtung  = parseFloat(einstellungen?.s1_gewichtung ?? '0.5')

  const anzeigeNote = istManuell ? noteManuell : (noteBerechnet ? Math.round(noteBerechnet) : null)

  const znBreakdown = useZNBreakdown(semester, schueler.id, spalten, eintraege, einstellungen, aktivesFach, gewichtungGlobal)

  const handleClick         = () => setManuellPopup(true)
  const handleContextMenu   = (e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }

  const handleManuellSelect = async (note) => {
    if (!aktivesFach) return
    await window.api.zeugnisnoten.setManuell(aktivesFach.id, schueler.id, semester, note === '' ? null : parseInt(note))
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
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-zinc-700 dark:text-zinc-200 mb-2.5">Endnote – Berechnung</p>

      {/* S1 / S2 Zeilen */}
      <div className="space-y-1 mb-2.5">
        {[{ label: 'ZN S1', exakt: s1NoteExakt, anzeige: s1NoteAnzeige, manuell: s1Zn?.note_manuell != null },
          { label: 'ZN S2', exakt: s2NoteExakt, anzeige: s2NoteAnzeige, manuell: s2Zn?.note_manuell != null }
        ].map(({ label, exakt, anzeige, manuell }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">
              {label}{manuell ? <span className="ml-1 text-yellow-500">M</span> : null}
            </span>
            <span className={`font-medium tabular-nums ${anzeige ? noteKlasse(anzeige) : 'text-zinc-400'}`}>
              {exakt != null ? exakt.toFixed(2) : '–'}
            </span>
          </div>
        ))}
      </div>

      {/* Formel */}
      <div className="border-t border-zinc-100 dark:border-zinc-700 pt-2 mb-2.5">
        {s1NoteExakt != null && s2NoteExakt != null ? (
          <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
            {s1NoteExakt.toFixed(2)} × {Math.round(s1Gewichtung * 100)}%
            {' + '}
            {s2NoteExakt.toFixed(2)} × {Math.round((1 - s1Gewichtung) * 100)}%
          </p>
        ) : s1NoteExakt != null ? (
          <p className="text-[10px] text-zinc-400">Nur S1 vorhanden → direkt übernommen</p>
        ) : s2NoteExakt != null ? (
          <p className="text-[10px] text-zinc-400">Nur S2 vorhanden → direkt übernommen</p>
        ) : (
          <p className="text-[10px] text-zinc-400">Keine Semesternoten vorhanden</p>
        )}
      </div>

      {/* Ergebnis */}
      <div className="border-t border-zinc-100 dark:border-zinc-700 pt-2 flex items-center justify-between gap-3">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
          Endnote{istManuell ? <span className="text-yellow-500 ml-1 font-normal">(manuell)</span> : null}
        </span>
        <span className="tabular-nums">
          {noteBerechnet != null
            ? <span className={`font-bold ${noteKlasse(Math.round(noteBerechnet))}`}>{noteBerechnet.toFixed(2)}</span>
            : <span className="text-zinc-400">–</span>}
          {istManuell && <span className="text-yellow-500 font-bold ml-1.5">→ {noteManuell}</span>}
        </span>
      </div>
    </div>
  ) : (
    // ZN S1 / S2
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-2xl p-3 text-xs">
      <p className="font-semibold text-zinc-700 dark:text-zinc-200 mb-2.5">ZN Semester {semester} – Berechnung</p>

      {znBreakdown && znBreakdown.beitraege.length > 0 ? (
        <>
          {/* Kategorien-Tabelle */}
          <div className="space-y-1 mb-2.5">
            {znBreakdown.beitraege.map(({ kat, detail, avg, w }) => (
              <div key={kat} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '3rem 1fr auto auto' }}>
                <span className="font-semibold text-zinc-600 dark:text-zinc-400">{kat}</span>
                <span className="text-zinc-400 dark:text-zinc-500 truncate">{detail}</span>
                <span className={`font-medium tabular-nums text-right ${noteKlasse(Math.round(avg))}`}>{avg.toFixed(2)}</span>
                <span className="text-zinc-400 tabular-nums text-right">{Math.round(w * 100)}%</span>
              </div>
            ))}
          </div>

          {/* Ergebnis */}
          <div className="border-t border-zinc-100 dark:border-zinc-700 pt-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">
              Ergebnis{istManuell ? <span className="text-yellow-500 ml-1 font-normal">(manuell)</span> : null}
            </span>
            <span className="tabular-nums">
              {noteBerechnet != null
                ? <span className={`font-bold ${noteKlasse(Math.round(noteBerechnet))}`}>{noteBerechnet.toFixed(2)}</span>
                : <span className="text-zinc-400">–</span>}
              {istManuell && <span className="text-yellow-500 font-bold ml-1.5">→ {noteManuell}</span>}
            </span>
          </div>
        </>
      ) : (
        <p className="text-zinc-400 dark:text-zinc-500">Noch keine Einträge vorhanden.</p>
      )}
    </div>
  )

  return (
    <td className="p-0 relative" style={{ width: 42, minWidth: 42 }}>
      <div
        ref={cellRef}
        className={`zn-zelle cursor-pointer select-none
          ${istManuell ? 'zn-manuell' : ''}
          ${anzeigeNote ? noteKlasse(anzeigeNote) : 'text-gray-300'}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {anzeigeNote != null ? (
          isDifferenziert ? (
            <span className="flex flex-col items-center leading-none">
              <span>{anzeigeNote}</span>
              <span className="text-[8px] opacity-60">{niveau}</span>
            </span>
          ) : anzeigeNote
        ) : '–'}
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
          <div className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2"
            style={{ top: '100%', right: 0, marginTop: 2, minWidth: 140 }}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-1">
              {semester === 3 ? 'Endnote' : `Zeugnisnote Semester ${semester}`}
            </p>
            {noteBerechnet && (
              <p className="text-xs text-gray-400 mb-2 px-1">Berechnet: {noteBerechnet.toFixed(1)}</p>
            )}
            <div className="flex gap-1 mb-2">
              {Array.from({ length: maxNote }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  className={`w-8 h-8 rounded font-bold text-sm transition-colors
                    ${(istManuell ? noteManuell : Math.round(noteBerechnet)) === n
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  onClick={() => handleManuellSelect(n)}
                >
                  {n}
                </button>
              ))}
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

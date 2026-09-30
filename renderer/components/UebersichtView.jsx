// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import useStore from '../store/useStore'
import TodoBoard from './TodoBoard'
import Stundenplan from './Stundenplan'
import KalenderView, { Segmented } from './KalenderView'
import { useIsMobile } from '../hooks/useIsMobile'

// Lokales Datum (YYYY-MM-DD) – bewusst NICHT toISOString (UTC), sonst zeigt der Zähler nahe Mitternacht
// einen Tag daneben. Gleiche Logik wie im TerminePanel.
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Begruessung() {
  const h = new Date().getHours()
  if (h < 5)  return { text: 'Noch wach?',           emoji: '🌙' }
  if (h < 11) return { text: 'Guten Morgen',         emoji: '☀️' }
  if (h < 13) return { text: 'Mittagspause?',        emoji: '🥪' }
  if (h < 17) return { text: 'Schönen Nachmittag',   emoji: '✨' }
  if (h < 21) return { text: 'Guten Abend',          emoji: '🌇' }
  return       { text: 'Langer Tag heute?',          emoji: '🌙' }
}

export default function UebersichtView() {
  const {
    aktuellesSchuljahr, todos, termine, zeigePlaner,
  } = useStore()
  const [highlightedTodoId, setHighlightedTodoId] = useState(null)
  const mobil = useIsMobile()
  // Hauptbereich: binär Stundenplan | Kalender; im Kalender zusätzlich Woche | Monat.
  const gespeichert = localStorage.getItem('dashboard-ansicht')
  const [ansichtModus, setAnsichtModusState] = useState(
    (gespeichert === 'kalender' || gespeichert === 'woche' || gespeichert === 'monat') ? 'kalender' : 'stundenplan')
  const [kalenderModus, setKalenderModusState] = useState(() => {
    const k = localStorage.getItem('dashboard-kalender-modus')
    if (k === 'woche' || k === 'monat' || k === 'agenda') return k
    return (gespeichert === 'woche' || gespeichert === 'monat') ? gespeichert : 'monat'
  })
  const setAnsichtModus = (m) => { setAnsichtModusState(m); try { localStorage.setItem('dashboard-ansicht', m) } catch { /* ignore */ } }
  const setKalenderModus = (m) => { setKalenderModusState(m); try { localStorage.setItem('dashboard-kalender-modus', m) } catch { /* ignore */ } }
  const ANSICHTEN = [['stundenplan', 'Stundenplan'], ['kalender', 'Kalender']]
  // Ziel-Datum für den Sprung aus einem Stundenplan-Tages-Badge in die Wochenansicht.
  const [kalenderZiel, setKalenderZiel] = useState(null)
  const wechsleAnsicht = (m) => { if (m === 'kalender') setKalenderZiel(null); setAnsichtModus(m) }
  const springeZuTag = (datum) => { setKalenderModus('woche'); setKalenderZiel(datum); setAnsichtModus('kalender') }

  // Resizable Sidebar (nur noch Breite; Termine laufen im Kalender/Agenda)
  const [todoBreite, setTodoBreite] = useState(() => parseInt(localStorage.getItem('todo-panel-breite') ?? '288'))
  const draggingH = useRef(false); const startX = useRef(0); const startBreite = useRef(0)

  const onDragStart = useCallback((e) => {
    draggingH.current = true
    startX.current = e.clientX
    startBreite.current = todoBreite
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [todoBreite])

  useEffect(() => {
    const onMove = (e) => {
      if (draggingH.current) {
        const delta = startX.current - e.clientX
        setTodoBreite(Math.min(600, Math.max(220, startBreite.current + delta)))
      }
    }
    const onUp = () => {
      if (draggingH.current) {
        draggingH.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setTodoBreite(prev => { localStorage.setItem('todo-panel-breite', String(prev)); return prev })
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const begruessung = useMemo(() => Begruessung(), [])

  const offeneTodos = (todos ?? []).filter(t => !t.erledigt).length
  // Kommende Termine (ab heute) – analog zum ToDos-Zähler (alle offenen) und zur „kommend"-Liste im Panel.
  const heute = localDateStr()
  const kommendeTermine = (termine ?? []).filter(t => t.datum >= heute).length

  // ── Mobile Ansicht: nur der Stundenplan (Tagesansicht). ToDos/Termine laufen
  //    über die Kopfzeilen-Symbole; ein Badge-Tap öffnet die passende Vollbild-Liste. ──
  if (mobil) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-paper-50 dark:bg-ink-950">
        <Stundenplan
          onTagClick={() => zeigePlaner('termine')}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-paper-50 dark:bg-ink-950">

      {/* Schmale Kopfzeile: Begrüßung + kompakte Zähler */}
      <div className="flex-shrink-0 px-4 py-1 border-b border-paper-200 dark:border-ink-800 bg-white dark:bg-ink-900">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-ink-800 dark:text-paper-100 flex items-center gap-1.5">
            <span className="text-base leading-none">{begruessung.emoji}</span>{begruessung.text}
            <span className="text-[11px] font-normal text-ink-400 dark:text-ink-500">· {aktuellesSchuljahr?.bezeichnung ?? '—'}</span>
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-500 dark:text-ink-400">
            <span className="flex items-center gap-1"><span aria-hidden>✏️</span><span className="font-bold tabular-nums text-ink-700 dark:text-paper-200">{offeneTodos}</span> {offeneTodos === 1 ? 'ToDo' : 'ToDos'}</span>
            <span className="flex items-center gap-1"><span aria-hidden>📅</span><span className="font-bold tabular-nums text-ink-700 dark:text-paper-200">{kommendeTermine}</span> {kommendeTermine === 1 ? 'Termin' : 'Termine'}</span>
          </div>
        </div>
      </div>

      {/* Hauptbereich: Stundenplan/Kalender links, ToDos-Sidebar rechts */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden flex flex-col">
          {ansichtModus === 'stundenplan'
            ? <Stundenplan
                switchSlot={<Segmented options={ANSICHTEN} value={ansichtModus} onChange={wechsleAnsicht} />}
                onTagClick={springeZuTag} />
            : <KalenderView
                modus={kalenderModus}
                setModus={setKalenderModus}
                zielDatum={kalenderZiel}
                switchSlot={<Segmented options={ANSICHTEN} value={ansichtModus} onChange={wechsleAnsicht} />}
                onTodoClick={setHighlightedTodoId} />}
        </div>
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-coral-400 dark:hover:bg-coral-600 bg-paper-200 dark:bg-ink-800 transition-colors"
          onMouseDown={onDragStart}
        />
        <div className="flex-shrink-0 h-full flex flex-col overflow-hidden bg-white dark:bg-ink-900" style={{ width: todoBreite }}>
          <TodoBoard
            highlightedTodoId={highlightedTodoId}
            onHighlightCleared={() => setHighlightedTodoId(null)}
          />
        </div>
      </div>
    </div>
  )
}

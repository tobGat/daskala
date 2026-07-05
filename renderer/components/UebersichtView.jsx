// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import useStore from '../store/useStore'
import TodoBoard from './TodoBoard'
import TerminePanel from './TerminePanel'
import Stundenplan from './Stundenplan'

function Begruessung() {
  const h = new Date().getHours()
  if (h < 5)  return { text: 'Noch wach?',           emoji: '🌙' }
  if (h < 11) return { text: 'Guten Morgen',         emoji: '☀️' }
  if (h < 13) return { text: 'Mittagspause?',        emoji: '🥪' }
  if (h < 17) return { text: 'Schönen Nachmittag',   emoji: '✨' }
  if (h < 21) return { text: 'Guten Abend',          emoji: '🌇' }
  return       { text: 'Späte Stunde noch dran?',    emoji: '🌙' }
}

function KlasseChip({ klasse, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-800 hover:border-coral-300 dark:hover:border-coral-700 hover:shadow-soft transition-all duration-150 active:scale-[0.97]"
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: klasse.farbe || '#fb6936' }}
      />
      <span className="text-xs font-semibold text-ink-800 dark:text-paper-100">{klasse.name}</span>
      <svg className="w-3 h-3 text-ink-400 group-hover:text-coral-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

function StatPill({ label, value, accent, emoji }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${accent}`}>
      <span className="text-base leading-none">{emoji}</span>
      <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </div>
  )
}

export default function UebersichtView() {
  const {
    aktuellesSchuljahr, klassen, todos, termine,
    setAktiveKlasse, setCurrentView,
  } = useStore()
  const [highlightedTodoId, setHighlightedTodoId] = useState(null)
  const [highlightedTerminId, setHighlightedTerminId] = useState(null)

  // Resizable Sidebar — wie früher in App.jsx
  const [todoBreite, setTodoBreite]   = useState(() => parseInt(localStorage.getItem('todo-panel-breite') ?? '288'))
  const [termineHoehe, setTermineHoehe] = useState(() => parseInt(localStorage.getItem('termine-panel-hoehe') ?? '256'))

  const draggingH = useRef(false); const startX = useRef(0); const startBreite = useRef(0)
  const draggingV = useRef(false); const startY = useRef(0); const startHoehe = useRef(0)

  const onDragStart = useCallback((e) => {
    draggingH.current = true
    startX.current = e.clientX
    startBreite.current = todoBreite
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [todoBreite])

  const onDragStartV = useCallback((e) => {
    draggingV.current = true
    startY.current = e.clientY
    startHoehe.current = termineHoehe
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [termineHoehe])

  useEffect(() => {
    const onMove = (e) => {
      if (draggingH.current) {
        const delta = startX.current - e.clientX
        setTodoBreite(Math.min(600, Math.max(220, startBreite.current + delta)))
      }
      if (draggingV.current) {
        const delta = e.clientY - startY.current
        setTermineHoehe(Math.min(600, Math.max(120, startHoehe.current - delta)))
      }
    }
    const onUp = () => {
      if (draggingH.current) {
        draggingH.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setTodoBreite(prev => { localStorage.setItem('todo-panel-breite', String(prev)); return prev })
      }
      if (draggingV.current) {
        draggingV.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setTermineHoehe(prev => { localStorage.setItem('termine-panel-hoehe', String(prev)); return prev })
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
  const heute = new Date().toISOString().slice(0, 10)
  const inSiebenTagen = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const naechsteTermine = (termine ?? []).filter(t => t.datum >= heute && t.datum <= inSiebenTagen).length

  const oeffneKlasse = (klasse) => {
    setAktiveKlasse(klasse)
    setCurrentView('notentabelle')
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-paper-50 dark:bg-ink-950">

      {/* Toolbar oben: Begrüßung + Stats + Klassen-Chips */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-paper-200 dark:border-ink-800 bg-white dark:bg-ink-900">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-2xl leading-none">{begruessung.emoji}</span>
            <div className="leading-tight">
              <div className="text-base font-bold text-ink-800 dark:text-paper-100 font-display">
                {begruessung.text}
              </div>
              <div className="text-[11px] text-ink-500 dark:text-ink-400">
                {aktuellesSchuljahr?.bezeichnung ?? '—'}
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-paper-200 dark:bg-ink-800 flex-shrink-0" />

          <div className="flex items-center gap-2 flex-wrap">
            <StatPill label="offen"   value={offeneTodos}     emoji="✏️" accent="bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300" />
            <StatPill label="Termine" value={naechsteTermine} emoji="📅" accent="bg-mint-50 text-mint-700 dark:bg-mint-900/30 dark:text-mint-300" />
            <StatPill label="Klassen" value={klassen.length}  emoji="👋" accent="bg-lavender-50 text-lavender-700 dark:bg-lavender-900/30 dark:text-lavender-300" />
          </div>

          {klassen.length > 0 && (
            <>
              <div className="flex-1 min-w-2" />
              <div className="flex items-center gap-1.5 flex-wrap">
                {klassen.map(k => (
                  <KlasseChip key={k.id} klasse={k} onClick={() => oeffneKlasse(k)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hauptbereich: Stundenplan links, Sidebar (Todos+Termine) rechts */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden flex flex-col">
          <Stundenplan
            onTodoBadgeClick={setHighlightedTodoId}
            onTerminBadgeClick={setHighlightedTerminId}
          />
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
          <div
            className="h-1 flex-shrink-0 cursor-row-resize hover:bg-coral-400 dark:hover:bg-coral-600 bg-paper-200 dark:bg-ink-800 transition-colors"
            onMouseDown={onDragStartV}
          />
          <TerminePanel
            hoehe={termineHoehe}
            highlightedTerminId={highlightedTerminId}
            onHighlightCleared={() => setHighlightedTerminId(null)}
          />
        </div>
      </div>
    </div>
  )
}

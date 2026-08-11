// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Schlanke mobile Kopfzeile (Capacitor). Links Logo + „Daskala"; rechts zwei
// Symbole (ToDos/Termine) mit Anzahl-Badge, die je ein fast bildschirmfüllendes
// Vollbild-Modal mit der jeweiligen Liste öffnen. Der Modal-Zustand liegt im Store
// (mobilListe), damit ihn auch die Stundenplan-Badges öffnen können.

import React from 'react'
import logo from '../../daskalalogo.png'
import useStore from '../store/useStore'
import TodoBoard from './TodoBoard'
import TerminePanel from './TerminePanel'

function HeaderIcon({ emoji, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative w-10 h-10 flex items-center justify-center rounded-xl text-xl hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
    >
      <span aria-hidden>{emoji}</span>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-coral-600 text-white text-[10px] font-bold tabular-nums leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}

export default function MobileHeader() {
  const { todos, termine, mobilListe, oeffneMobilListe, schliesseMobilListe } = useStore()

  const offeneTodos = (todos ?? []).filter(t => !t.erledigt).length
  const heute = new Date().toISOString().slice(0, 10)
  const offeneTermine = (termine ?? []).filter(t => t.datum >= heute).length

  return (
    <>
      <header className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white dark:bg-ink-900 border-b border-paper-200 dark:border-ink-800">
        <img src={logo} alt="" className="h-6 w-6 rounded-md" />
        <span className="text-lg font-bold font-display text-ink-800 dark:text-paper-100 tracking-tight">Daskala</span>
        <div className="ml-auto flex items-center gap-1">
          <HeaderIcon emoji="✏️" label="ToDos" count={offeneTodos} onClick={() => oeffneMobilListe('todos')} />
          <HeaderIcon emoji="📅" label="Termine" count={offeneTermine} onClick={() => oeffneMobilListe('termine')} />
        </div>
      </header>

      {mobilListe && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(46,42,38,0.32)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) schliesseMobilListe() }}
        >
          <div
            className="mt-auto w-full h-[94vh] flex flex-col overflow-hidden bg-paper-50 dark:bg-ink-950 rounded-t-3xl shadow-pop animate-pop-in"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white dark:bg-ink-900 border-b border-paper-200 dark:border-ink-800">
              <h2 className="text-base font-semibold text-ink-900 dark:text-white flex items-center gap-2">
                <span aria-hidden>{mobilListe.typ === 'todos' ? '✏️' : '📅'}</span>
                {mobilListe.typ === 'todos' ? 'ToDos' : 'Termine'}
              </h2>
              <button type="button" className="w-9 h-9 flex items-center justify-center text-ink-400 hover:text-ink-600 text-xl" onClick={schliesseMobilListe}>✕</button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {mobilListe.typ === 'todos'
                ? <TodoBoard imSheet highlightedTodoId={mobilListe.highlightId} onHighlightCleared={() => {}} />
                : <TerminePanel imSheet hoehe={null} highlightedTerminId={mobilListe.highlightId} onHighlightCleared={() => {}} />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

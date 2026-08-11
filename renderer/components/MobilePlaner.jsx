// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Mobiler „Planer"-Bereich (Capacitor): oben die ToDos, unten die Termine – ein
// eigener Bottom-Nav-Tab statt der früheren Header-Symbole/Vollbild-Modals.
// Beide Panels laufen im Normal-Modus (mit eigenem Kopf + „+"), damit die zwei
// Hälften klar unterscheidbar sind. `planerFokus` (z. B. aus einem Stundenplan-
// Badge) springt zum jeweiligen Eintrag und wird nach dem Flash gelöscht.

import React from 'react'
import useStore from '../store/useStore'
import TodoBoard from './TodoBoard'
import TerminePanel from './TerminePanel'

export default function MobilePlaner() {
  const { planerFokus, planerFokusLoeschen } = useStore()

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-paper-50 dark:bg-ink-950">
      {/* Obere Hälfte: ToDos (TodoBoard ist selbst flex-1) */}
      <TodoBoard
        highlightedTodoId={planerFokus?.typ === 'todos' ? planerFokus.id : null}
        onHighlightCleared={planerFokusLoeschen}
      />
      {/* Untere Hälfte: Termine – hoehe={null} macht das Panel flex-1; eigene
          Trennlinie, da der Top-Border von TerminePanel bei hoehe==null entfällt. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-t-2 border-paper-200 dark:border-ink-800">
        <TerminePanel
          hoehe={null}
          highlightedTerminId={planerFokus?.typ === 'termine' ? planerFokus.id : null}
          onHighlightCleared={planerFokusLoeschen}
        />
      </div>
    </div>
  )
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Mobiler „Planung"-Bereich (Capacitor): eigener Bottom-Nav-Tab für die
// klassenbezogene Planung. Oben ein Segment-Umschalter Detailplanung/Jahresplanung
// (per Tap oder horizontalem Swipe), darunter die jeweilige Desktop-Ansicht. Nur
// mobil und nur bei aktivierter Planung gerendert (siehe App.jsx). Der Klassen-/
// Fach-Kontext läuft über die Kontextzeile der Bottom-Navigation.

import React, { useRef } from 'react'
import useStore from '../store/useStore'
import JahresplanungView from './JahresplanungView'
import KlassenplanungView from './KlassenplanungView'

export default function MobilePlanung() {
  const { currentView, setCurrentView } = useStore()
  const istKlasse = currentView === 'klassenplanung'
  const touchStart = useRef(null)

  const seg = (aktiv) => `flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${aktiv
    ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
    : 'text-ink-500 dark:text-ink-400'}`

  // Horizontaler Swipe wechselt zwischen den beiden Tabs (links Detailplanung,
  // rechts Jahresplanung). Vertikales Scrollen bleibt unberührt.
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    setCurrentView(dx < 0 ? 'jahresplanung' : 'klassenplanung')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-paper-50 dark:bg-ink-950">
      <div className="flex-shrink-0 px-3 py-2 border-b border-paper-200 dark:border-ink-800/60">
        <div className="flex gap-1 bg-paper-100 dark:bg-ink-800 rounded-xl p-1">
          <button type="button" className={seg(istKlasse)} onClick={() => setCurrentView('klassenplanung')}>
            Detailplanung
          </button>
          <button type="button" className={seg(!istKlasse)} onClick={() => setCurrentView('jahresplanung')}>
            Jahresplanung
          </button>
        </div>
      </div>
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {istKlasse ? <KlassenplanungView /> : <JahresplanungView />}
      </div>
    </div>
  )
}

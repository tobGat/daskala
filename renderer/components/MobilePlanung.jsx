// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Mobiler „Planung"-Bereich (Capacitor): eigener Bottom-Nav-Tab. Oben ein Segment-
// Umschalter Detailplanung/Jahresplanung; beide Ansichten liegen nebeneinander in
// einer Bahn (200% breit), die per horizontalem Swipe dem Finger folgt und beim
// Loslassen einrastet – so fühlt sich der Wechsel wie echtes Wischen an. Die Bahn
// wird über `margin-left` verschoben (nicht `transform`), damit die in den Ansichten
// verwendeten `position:fixed`-Modals weiterhin am Viewport hängen. Nur mobil und nur
// bei aktivierter Planung gerendert (siehe App.jsx).

import React, { useRef, useState, useEffect } from 'react'
import useStore from '../store/useStore'
import JahresplanungView from './JahresplanungView'
import KlassenplanungView from './KlassenplanungView'

export default function MobilePlanung() {
  const { currentView, setCurrentView } = useStore()
  const istKlasse = currentView === 'klassenplanung'
  const wrapperRef = useRef(null)
  const startRef = useRef(null)
  const [breite, setBreite] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Breite des sichtbaren Bereichs messen (für Verschiebung + Umschalt-Schwelle).
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setBreite(el.getBoundingClientRect().width)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const seg = (aktiv) => `flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${aktiv
    ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
    : 'text-ink-500 dark:text-ink-400'}`

  const onTouchStart = (e) => {
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY, decided: false, horizontal: false, lastDx: 0 }
  }
  const onTouchMove = (e) => {
    const s = startRef.current
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (!s.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.decided = true
      s.horizontal = Math.abs(dx) > Math.abs(dy)
      if (s.horizontal) setDragging(true)
    }
    if (!s.horizontal) return
    // Nur zum vorhandenen Nachbarn ziehen (am jeweiligen Ende ist Schluss).
    let d = dx
    if (istKlasse) d = Math.max(-breite, Math.min(0, d))
    else d = Math.max(0, Math.min(breite, d))
    s.lastDx = d
    setDragX(d)
  }
  const onTouchEnd = () => {
    const s = startRef.current
    startRef.current = null
    if (s?.horizontal) {
      const schwelle = Math.max(48, breite * 0.22)
      if (istKlasse && s.lastDx < -schwelle) setCurrentView('jahresplanung')
      else if (!istKlasse && s.lastDx > schwelle) setCurrentView('klassenplanung')
    }
    setDragX(0)
    setDragging(false)
  }

  const base = istKlasse ? 0 : -breite
  const trackStyle = {
    width: '200%',
    marginLeft: `${base + dragX}px`,
    transition: dragging ? 'none' : 'margin-left 260ms cubic-bezier(0.22, 0.61, 0.36, 1)',
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
        ref={wrapperRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex h-full" style={trackStyle}>
          <div className="w-1/2 h-full overflow-hidden flex flex-col"><KlassenplanungView /></div>
          <div className="w-1/2 h-full overflow-hidden flex flex-col"><JahresplanungView /></div>
        </div>
      </div>
    </div>
  )
}

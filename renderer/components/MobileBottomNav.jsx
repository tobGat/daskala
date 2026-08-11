// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Mobile Bottom-Navigation (Capacitor). Wird von App.jsx NUR gerendert, wenn
// useIsMobile() true ist (also am Gerät mit <html class="cap">). Steuert die
// Ansichten über den Zustand-Store; die Desktop-Kopfleiste (KlassenTabs/FachTabs)
// bleibt davon unberührt. Minimal-Variante: Dashboard · Noten · Mehr, Rest im Sheet.

import React, { useState } from 'react'
import useStore from '../store/useStore'

// Ein Tab in der unteren Leiste (Icon + Label, großes Tap-Ziel).
function NavTab({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-medium transition-colors
        ${active
          ? 'text-coral-600 dark:text-coral-300'
          : 'text-ink-500 dark:text-ink-400'}`}
    >
      <span className="text-xl leading-none" aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// Eine Zeile im „Mehr"-Sheet.
function SheetItem({ icon, label, active, onClick, extra }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 min-h-[52px] text-left rounded-xl transition-colors
        ${active
          ? 'bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300'
          : 'text-ink-700 dark:text-paper-200 hover:bg-paper-100 dark:hover:bg-ink-800'}`}
    >
      <span className="text-lg w-6 text-center" aria-hidden>{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {extra}
    </button>
  )
}

export default function MobileBottomNav() {
  const {
    currentView, setCurrentView, openModal,
    klassen, einstellungen, vorlagenModus, setVorlagenModus,
  } = useStore()
  const [mehrOffen, setMehrOffen] = useState(false)

  const planungAktiv = einstellungen?.planung_aktiv === '1'
  const hatKv = Array.isArray(klassen) && klassen.some(k => k.ist_kv)

  const dashboardAktiv = currentView === 'stundenplan'
  const notenAktiv = ['notentabelle', 'sitzplan', 'kompetenzen'].includes(currentView)
  const mehrAktiv = ['kv', 'jahresplanung', 'klassenplanung'].includes(currentView)

  const geheZu = (view) => { setCurrentView(view); setMehrOffen(false) }
  const modal = (name) => { openModal(name); setMehrOffen(false) }

  // Ziele fürs „Mehr"-Sheet – gleiche Gating-Regeln wie die Desktop-Kopfleiste.
  const mehrZiele = [
    { icon: '🪑', label: 'Sitzplan', active: currentView === 'sitzplan', onClick: () => geheZu('sitzplan') },
    hatKv && { icon: '📜', label: 'Klassenvorstand', active: currentView === 'kv', onClick: () => geheZu('kv') },
    planungAktiv && { icon: '📅', label: 'Jahresplan', active: currentView === 'jahresplanung', onClick: () => geheZu('jahresplanung') },
    planungAktiv && { icon: '📋', label: 'Klassenplanung', active: currentView === 'klassenplanung', onClick: () => geheZu('klassenplanung') },
    { icon: '⚙️', label: 'Einstellungen', onClick: () => modal('einstellungen') },
    { icon: '📤', label: 'Exportieren', onClick: () => modal('exportieren') },
    (planungAktiv || vorlagenModus) && {
      icon: '📁',
      label: 'Vorlagen-Modus',
      active: vorlagenModus,
      onClick: () => { setVorlagenModus(!vorlagenModus); setMehrOffen(false) },
      extra: <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${vorlagenModus ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-paper-200 text-ink-500 dark:bg-ink-700 dark:text-ink-400'}`}>{vorlagenModus ? 'an' : 'aus'}</span>,
    },
  ].filter(Boolean)

  return (
    <>
      {mehrOffen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMehrOffen(false)}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">Mehr</h2>
              <button type="button" className="text-ink-400 hover:text-ink-600 text-xl px-2" onClick={() => setMehrOffen(false)}>✕</button>
            </div>
            <div className="space-y-1">
              {mehrZiele.map((z) => (
                <SheetItem key={z.label} icon={z.icon} label={z.label} active={z.active} onClick={z.onClick} extra={z.extra} />
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="safe-bottom flex-shrink-0 flex items-stretch bg-white dark:bg-ink-900 border-t border-paper-200 dark:border-ink-800">
        <NavTab icon="🗓️" label="Dashboard" active={dashboardAktiv} onClick={() => geheZu('stundenplan')} />
        <NavTab icon="📊" label="Noten" active={notenAktiv} onClick={() => geheZu('notentabelle')} />
        <NavTab icon="⋯" label="Mehr" active={mehrAktiv || mehrOffen} onClick={() => setMehrOffen(o => !o)} />
      </nav>
    </>
  )
}

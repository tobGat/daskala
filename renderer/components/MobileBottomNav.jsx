// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Mobile Bottom-Navigation (Capacitor). Wird von App.jsx NUR bei useIsMobile()
// gerendert (Desktop hat kein <html class="cap"> → unberührt).
// Enthält: (1) eine Kontextzeile zum Wechseln von Klasse/Fach (ersetzt mobil die
// entfernten Kopfleisten), (2) drei Haupt-Tabs Dashboard · Noten · Mehr, (3) Sheets
// (Klassen-/Fach-Auswahl und „Mehr"). Steuert alles über den Zustand-Store.

import React, { useState } from 'react'
import useStore from '../store/useStore'

// Abstrakte Linien-Icons für die Haupt-Tabs (erben die Textfarbe).
const NAV_ICONS = {
  // Stundenplan: Raster/Kalender
  stundenplan: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8.5 3v3M15.5 3v3" strokeLinecap="round" />
    </svg>
  ),
  // Noten: Balken-Diagramm
  noten: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 20V13M12 20V5M19 20v-9" />
    </svg>
  ),
  // Agenda: zweigeteiltes Panel – oben Häkchen (ToDo), unten Linie (Termin)
  planer: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M3.5 12h17" />
      <path d="M6.5 8.1l1.3 1.3 2.4-2.4" />
      <path d="M7 16h6.5" />
    </svg>
  ),
  // Planung: Roadmap/Zeitstrahl mit Meilenstein-Punkten
  planung: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 6.5h8M4 12h12M4 17.5h6" />
      <circle cx="14.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Mehr: drei Punkte
  mehr: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
    </svg>
  ),
}

// Ein Haupt-Tab (Icon + Label, großes Tap-Ziel). Aktiv = koralle Pille hinter
// dem Icon + koralle, fette Beschriftung (deutlich hervorgehoben).
function NavTab({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 min-h-[56px] text-[10px] transition-colors
        ${active ? 'text-coral-600 dark:text-coral-300 font-semibold' : 'text-ink-400 dark:text-ink-500 font-medium'}`}
    >
      <span
        className={`flex items-center justify-center w-12 h-8 rounded-full transition-colors
          ${active ? 'bg-coral-100 dark:bg-coral-900/40' : ''}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </button>
  )
}

// Zeile im „Mehr"-Sheet.
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
    klassen, aktiveKlasse, setAktiveKlasse,
    faecher, aktivesFach, setAktivesFach,
    einstellungen, vorlagenModus, setVorlagenModus,
  } = useStore()
  const [sheet, setSheet] = useState(null) // null | 'mehr' | 'klasse' | 'fach'

  const planungAktiv = einstellungen?.planung_aktiv === '1'

  const dashboardAktiv = currentView === 'stundenplan'
  const notenAktiv = ['notentabelle', 'kompetenzen'].includes(currentView)
  const agendaAktiv = currentView === 'planer'
  const planungTabAktiv = ['jahresplanung', 'klassenplanung'].includes(currentView)

  const geheZu = (view) => { setCurrentView(view); setSheet(null) }
  const modal = (name) => { openModal(name); setSheet(null) }

  // Kontextzeile: Klasse immer (echte Klassen), Fach nur in fach-abhängigen Ansichten.
  const fachRelevant = ['notentabelle', 'kompetenzen', 'sitzplan'].includes(currentView) || (planungAktiv && currentView === 'jahresplanung')
  // Im Dashboard (Stundenplan zeigt alle Klassen) und im Planer (klassenübergreifend)
  // ist der Klassenwechsel nicht relevant.
  const zeigeKlasse = !vorlagenModus && currentView !== 'stundenplan' && currentView !== 'planer' && Array.isArray(klassen) && klassen.length > 0
  const zeigeFach = fachRelevant && !!aktiveKlasse && Array.isArray(faecher) && faecher.length > 0
  const zeigeKontext = zeigeKlasse || zeigeFach

  // Ziele fürs „Mehr"-Sheet – nur App-Ebene. Klassenbezogene Funktionen (Planung,
  // KV, Sitzplan) und das Anlegen von Klasse/Fach gehören nicht hierher.
  const mehrZiele = [
    { icon: '⚙️', label: 'Einstellungen', onClick: () => modal('einstellungen') },
    { icon: '📤', label: 'Exportieren', onClick: () => modal('exportieren') },
    (planungAktiv || vorlagenModus) && {
      icon: '📁', label: 'Vorlagen-Modus', active: vorlagenModus,
      onClick: () => { setVorlagenModus(!vorlagenModus); setSheet(null) },
      extra: <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${vorlagenModus ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-paper-200 text-ink-500 dark:bg-ink-700 dark:text-ink-400'}`}>{vorlagenModus ? 'an' : 'aus'}</span>,
    },
  ].filter(Boolean)

  const waehleKlasse = async (k) => { await setAktiveKlasse(k); setSheet(null) }
  const waehleFach = async (f) => { await setAktivesFach(f); setSheet(null) }

  const sheetTitel = { mehr: 'Mehr', klasse: 'Klasse wählen', fach: 'Fach wählen' }[sheet]

  return (
    <>
      {sheet && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSheet(null)}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">{sheetTitel}</h2>
              <button type="button" className="text-ink-400 hover:text-ink-600 text-xl px-2" onClick={() => setSheet(null)}>✕</button>
            </div>
            <div className="space-y-1">
              {sheet === 'mehr' && mehrZiele.map((z) => (
                <SheetItem key={z.label} icon={z.icon} label={z.label} active={z.active} onClick={z.onClick} extra={z.extra} />
              ))}
              {sheet === 'klasse' && (klassen ?? []).map((k) => (
                <SheetItem key={k.id} icon="🏫" label={k.name} active={aktiveKlasse?.id === k.id} onClick={() => waehleKlasse(k)} />
              ))}
              {sheet === 'klasse' && (
                <SheetItem icon="➕" label={vorlagenModus ? 'Neue Vorlagenklasse' : 'Neue Klasse'} onClick={() => modal('klasseHinzufuegen')} />
              )}
              {sheet === 'fach' && (faecher ?? []).map((f) => (
                <SheetItem key={f.id} icon="📚" label={f.name} active={aktivesFach?.id === f.id} onClick={() => waehleFach(f)} />
              ))}
              {sheet === 'fach' && (
                <SheetItem icon="➕" label="Neues Fach" onClick={() => modal('fachHinzufuegen')} />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 safe-bottom bg-white dark:bg-ink-900 border-t border-paper-200 dark:border-ink-800">
        {/* Kontextzeile: Klasse-/Fach-Wechsel */}
        {zeigeKontext && (
          <div className="flex items-stretch gap-2 px-3 pt-2">
            {zeigeKlasse && (
              <button type="button" onClick={() => setSheet('klasse')}
                className="flex-1 min-w-0 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-paper-100 dark:bg-ink-800 text-ink-700 dark:text-paper-200">
                <span className="truncate">{aktiveKlasse?.name ?? 'Klasse'}</span>
                <span className="text-ink-400 flex-shrink-0" aria-hidden>▾</span>
              </button>
            )}
            {zeigeFach && (
              <button type="button" onClick={() => setSheet('fach')}
                className="flex-1 min-w-0 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-paper-100 dark:bg-ink-800 text-ink-700 dark:text-paper-200">
                <span className="truncate">{aktivesFach?.name ?? 'Fach'}</span>
                <span className="text-ink-400 flex-shrink-0" aria-hidden>▾</span>
              </button>
            )}
          </div>
        )}

        {/* Haupt-Tabs. „Planung" nur bei aktivierter Planung (sonst gibt es nichts zu planen). */}
        <nav className="flex items-stretch">
          <NavTab icon={NAV_ICONS.stundenplan} label="Stundenplan" active={dashboardAktiv} onClick={() => geheZu('stundenplan')} />
          <NavTab icon={NAV_ICONS.noten} label="Noten" active={notenAktiv} onClick={() => geheZu('notentabelle')} />
          <NavTab icon={NAV_ICONS.planer} label="Agenda" active={agendaAktiv} onClick={() => geheZu('planer')} />
          {planungAktiv && (
            <NavTab icon={NAV_ICONS.planung} label="Planung" active={planungTabAktiv} onClick={() => geheZu('jahresplanung')} />
          )}
          <NavTab icon={NAV_ICONS.mehr} label="Mehr" active={sheet === 'mehr'} onClick={() => setSheet(s => s === 'mehr' ? null : 'mehr')} />
        </nav>
      </div>
    </>
  )
}

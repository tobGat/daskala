// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useEffect, useState } from 'react'
import useStore from './store/useStore'

import Einrichtungsflow from './components/Einrichtungsflow'
import KlassenTabs from './components/KlassenTabs'
import FachTabs from './components/FachTabs'
import NotenTabelle from './components/NotenTabelle'
import SchuelerDetail from './components/SchuelerDetail'
import SpalteHinzufuegen from './components/SpalteHinzufuegen'
import Einstellungen from './components/Einstellungen'
import SitzplanView from './components/SitzplanView'
import JahresplanungView from './components/JahresplanungView'
import KlassenplanungView from './components/KlassenplanungView'
import KompetenzrasterView from './components/KompetenzrasterView'
import UebersichtView from './components/UebersichtView'
import KVView from './components/KVView'
import DokumentationModal from './components/DokumentationModal'
import SperreOverlay from './components/SperreOverlay'
import ChangelogModal, { CHANGELOG, cmpVersion } from './components/ChangelogModal'
import {
  KlasseHinzufuegenModal,
  FachHinzufuegenModal,
  SchuelerVerwaltenModal,
  GewichtungModal,
  SchuljahrwechselModal,
  ArchivModal,
  ExportierenModal,
  FerienModal,
} from './components/Modals'

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-paper-50 dark:bg-ink-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-light text-paper-300 dark:text-ink-700 tracking-widest uppercase text-xs">Daskala</h1>
      </div>
    </div>
  )
}

export default function App() {
  const {
    initialized, erststart,
    currentView, setCurrentView,
    activeModal, openModal, closeModal,
    detailSchueler,
    einstellungen,
    vorlagenModus,
    gesperrt, sperren, entsperren,
    init,
  } = useStore()

  const planungAktiv = einstellungen?.planung_aktiv === '1'
  const [updateInfo, setUpdateInfo] = useState(null) // { status, version }
  const [backupErinnerung, setBackupErinnerung] = useState(false)
  const [changelogVersionen, setChangelogVersionen] = useState(null) // Einträge fürs „Was ist neu"-Modal

  // Falls Planung deaktiviert, aber aktuell eine Planungs-View aktiv ist → umschalten.
  // Im Vorlagen-Modus bleibt die Jahresplanung immer erreichbar.
  useEffect(() => {
    if (!planungAktiv && !vorlagenModus && (currentView === 'jahresplanung' || currentView === 'klassenplanung')) {
      setCurrentView('notentabelle')
    }
  }, [planungAktiv, vorlagenModus, currentView])

  useEffect(() => {
    init()
  }, [])

  // Dokumentation beim ersten Öffnen einmalig anzeigen (danach jederzeit über die Einstellungen).
  useEffect(() => {
    if (initialized && !erststart && einstellungen && einstellungen.doku_gesehen !== '1') {
      openModal('dokumentation')
      window.api.einstellungen.set('doku_gesehen', '1')
      useStore.setState({ einstellungen: { ...useStore.getState().einstellungen, doku_gesehen: '1' } })
    }
  }, [initialized, erststart, einstellungen?.doku_gesehen])

  useEffect(() => {
    const handler = async () => {
      const { aktivesFach, ladeFachDaten } = useStore.getState()
      if (aktivesFach) await ladeFachDaten(aktivesFach.id)
    }
    window.api.undo.onApplied(handler)
    return () => window.api.undo.offApplied(handler)
  }, [])

  // Auto-Update-Status (nur im gepackten Build aktiv).
  useEffect(() => {
    const off = window.api.update?.onStatus?.((data) => {
      setUpdateInfo(data)
      if (data?.status === 'available') {
        useStore.getState().pushToast(`Update${data.version ? ' v' + data.version : ''} wird geladen…`, 'info')
      }
    })
    return off
  }, [])

  // Sicherungs-Erinnerung: fällig, wenn länger nicht gesichert und keine
  // automatische Sicherung aktiv ist.
  useEffect(() => {
    if (initialized && !erststart) {
      window.api.backup?.status?.()
        .then(s => { if (s?.faellig) setBackupErinnerung(true) })
        .catch(() => {})
    }
  }, [initialized, erststart])

  // App-Sperre per Tastenkürzel (Strg/Cmd + L), sofern aktiviert.
  useEffect(() => {
    const sperreAktiv = einstellungen?.sperre_aktiv === '1'
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
        if (sperreAktiv && !gesperrt) { e.preventDefault(); sperren() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [einstellungen?.sperre_aktiv, gesperrt, sperren])

  // „Was ist neu": nach einem Versionssprung die Änderungen einmalig zeigen.
  useEffect(() => {
    if (!initialized || erststart) return
    let cancelled = false
    ;(async () => {
      const current = await window.api.app?.version?.()
      if (cancelled || !current) return
      const lastSeen = einstellungen?.changelog_gesehen_version || ''
      const merken = async () => {
        await window.api.einstellungen.set('changelog_gesehen_version', current)
        useStore.setState({ einstellungen: { ...useStore.getState().einstellungen, changelog_gesehen_version: current } })
      }
      if (!lastSeen) { await merken(); return }               // Erstlauf: nur merken, nichts zeigen
      if (cmpVersion(current, lastSeen) > 0) {
        const neu = CHANGELOG.filter(e => cmpVersion(e.version, lastSeen) > 0)
        if (neu.length > 0) setChangelogVersionen(neu)
        await merken()
      }
    })()
    return () => { cancelled = true }
  }, [initialized, erststart, einstellungen?.changelog_gesehen_version])

  if (!initialized) return <LoadingScreen />
  if (erststart) return <Einrichtungsflow />

  return (
    <>
    <div className={`flex flex-col h-screen bg-paper-50 dark:bg-ink-950${gesperrt ? ' blur-lg pointer-events-none select-none' : ''}`}>

      {/* Grün leuchtender Rahmen als deutliches Signal für den Vorlagen-Modus */}
      {vorlagenModus && (
        <div className="pointer-events-none fixed inset-0 z-[100] border-4 border-green-400 animate-glow-frame" />
      )}

      {/* Immer sichtbare Navigation */}
      <KlassenTabs />
      {(vorlagenModus || ['notentabelle', 'kompetenzen', 'sitzplan', ...(planungAktiv ? ['jahresplanung'] : [])].includes(currentView)) && <FachTabs />}

      {/* Haupt-Inhalt. Im Vorlagen-Modus nur die Jahresplanung. */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!vorlagenModus && currentView === 'stundenplan' && <UebersichtView />}
        {!vorlagenModus && currentView === 'kv' && <KVView />}
        {!vorlagenModus && currentView === 'notentabelle' && <NotenTabelle />}
        {!vorlagenModus && currentView === 'kompetenzen' && <KompetenzrasterView />}
        {!vorlagenModus && currentView === 'sitzplan' && <SitzplanView />}
        {(planungAktiv || vorlagenModus) && currentView === 'jahresplanung' && <JahresplanungView />}
        {!vorlagenModus && planungAktiv && currentView === 'klassenplanung' && <KlassenplanungView />}
      </div>

      {/* Schüler:innen Slide-over */}
      {detailSchueler && <SchuelerDetail />}

      {/* Modals */}
      {activeModal === 'spalteHinzufuegen' && <SpalteHinzufuegen onClose={closeModal} />}
      {activeModal === 'einstellungen' && <Einstellungen onClose={closeModal} />}
      {activeModal === 'klasseHinzufuegen' && <KlasseHinzufuegenModal />}
      {activeModal === 'fachHinzufuegen' && <FachHinzufuegenModal />}
      {activeModal === 'schuelerVerwalten' && <SchuelerVerwaltenModal />}
      {activeModal === 'gewichtung' && <GewichtungModal />}
      {activeModal === 'schuljahreswechsel' && <SchuljahrwechselModal />}
      {activeModal === 'archiv' && <ArchivModal />}
      {activeModal === 'exportieren' && <ExportierenModal />}
      {activeModal === 'ferien' && <FerienModal />}
      {activeModal === 'dokumentation' && <DokumentationModal onClose={closeModal} />}

      {/* „Was ist neu"-Modal nach einem Update */}
      {changelogVersionen && <ChangelogModal versionen={changelogVersionen} onClose={() => setChangelogVersionen(null)} />}

      {/* Sicherungs-Erinnerung */}
      {!activeModal && backupErinnerung && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl shadow-pop px-4 py-2.5">
          <span className="text-lg">💾</span>
          <span className="text-sm">Zeit für eine Datensicherung.</span>
          <button
            onClick={async () => {
              const p = await window.api.backup.jetzt()
              if (p) { useStore.getState().pushToast('Sicherung erstellt.', 'success'); setBackupErinnerung(false) }
            }}
            className="text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1 transition-colors"
          >
            Jetzt sichern
          </button>
          <button
            onClick={() => { setBackupErinnerung(false); openModal('einstellungen') }}
            className="text-sm font-medium text-amber-800 dark:text-amber-300 hover:underline"
          >
            Automatisch sichern
          </button>
          <button
            onClick={async () => { await window.api.backup.snooze(3); setBackupErinnerung(false) }}
            className="text-amber-700/70 dark:text-amber-300/60 hover:text-amber-900 dark:hover:text-amber-100 text-sm"
            title="Später erinnern"
          >
            ✕
          </button>
        </div>
      )}

      {/* Auto-Update: Hinweis, sobald ein Update geladen wurde */}
      {updateInfo?.status === 'downloaded' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 bg-ink-900 dark:bg-ink-800 text-white rounded-xl shadow-pop px-4 py-2.5 border border-ink-700">
          <span className="text-sm">
            Ein Update{updateInfo.version ? ` (v${updateInfo.version})` : ''} ist bereit.
          </span>
          <button
            onClick={() => window.api.update.installieren()}
            className="text-sm font-medium bg-coral-600 hover:bg-coral-700 rounded-lg px-3 py-1 transition-colors"
          >
            Jetzt neu starten
          </button>
          <button
            onClick={() => setUpdateInfo(null)}
            className="text-white/60 hover:text-white text-sm"
            title="Später (wird beim Beenden installiert)"
          >
            ✕
          </button>
        </div>
      )}
    </div>

    {/* App-Sperre: Overlay mit PIN-Eingabe (Inhalt dahinter ist geblurt) */}
    {gesperrt && <SperreOverlay onUnlock={entsperren} />}
    </>
  )
}

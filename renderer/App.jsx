// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useEffect } from 'react'
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
    init,
  } = useStore()

  const planungAktiv = einstellungen?.planung_aktiv === '1'

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

  if (!initialized) return <LoadingScreen />
  if (erststart) return <Einrichtungsflow />

  return (
    <div className="flex flex-col h-screen bg-paper-50 dark:bg-ink-950">

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
    </div>
  )
}

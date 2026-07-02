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
    activeModal, closeModal,
    detailSchueler,
    einstellungen,
    init,
  } = useStore()

  const planungAktiv = einstellungen?.planung_aktiv === '1'

  // Falls Planung deaktiviert, aber aktuell eine Planungs-View aktiv ist → umschalten
  useEffect(() => {
    if (!planungAktiv && (currentView === 'jahresplanung' || currentView === 'klassenplanung')) {
      setCurrentView('notentabelle')
    }
  }, [planungAktiv, currentView])

  useEffect(() => {
    init()
  }, [])

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

      {/* Immer sichtbare Navigation */}
      <KlassenTabs />
      {['notentabelle', 'kompetenzen', 'sitzplan', ...(planungAktiv ? ['jahresplanung'] : [])].includes(currentView) && <FachTabs />}

      {/* Haupt-Inhalt */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentView === 'stundenplan' && <UebersichtView />}
        {currentView === 'kv' && <KVView />}
        {currentView === 'notentabelle' && <NotenTabelle />}
        {currentView === 'kompetenzen' && <KompetenzrasterView />}
        {currentView === 'sitzplan' && <SitzplanView />}
        {planungAktiv && currentView === 'jahresplanung' && <JahresplanungView />}
        {planungAktiv && currentView === 'klassenplanung' && <KlassenplanungView />}
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
    </div>
  )
}

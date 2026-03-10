import React, { useEffect } from 'react'
import useStore from './store/useStore'

import Einrichtungsflow from './components/Einrichtungsflow'
import KlassenTabs from './components/KlassenTabs'
import FachTabs from './components/FachTabs'
import NotenTabelle from './components/NotenTabelle'
import SchuelerDetail from './components/SchuelerDetail'
import Stundenplan from './components/Stundenplan'
import TodoBoard from './components/TodoBoard'
import SpalteHinzufuegen from './components/SpalteHinzufuegen'
import Einstellungen from './components/Einstellungen'
import SitzplanView from './components/SitzplanView'
import {
  KlasseHinzufuegenModal,
  FachHinzufuegenModal,
  SchuelerVerwaltenModal,
  GewichtungModal,
  SchuljahrwechselModal,
  ArchivModal,
  ExportierenModal,
} from './components/Modals'

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-light text-zinc-300 dark:text-zinc-700 tracking-widest uppercase text-xs">Daskala</h1>
      </div>
    </div>
  )
}

export default function App() {
  const {
    initialized, erststart,
    currentView,
    activeModal, closeModal,
    detailSchueler,
    init,
  } = useStore()

  useEffect(() => {
    init()
  }, [])

  if (!initialized) return <LoadingScreen />
  if (erststart) return <Einrichtungsflow />

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* Immer sichtbare Navigation */}
      <KlassenTabs />
      {(currentView === 'notentabelle' || currentView === 'sitzplan') && <FachTabs />}

      {/* Haupt-Inhalt */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentView === 'stundenplan' && <Stundenplan />}
        {currentView === 'notentabelle' && <NotenTabelle />}
        {currentView === 'todos' && <TodoBoard />}
        {currentView === 'sitzplan' && <SitzplanView />}
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
    </div>
  )
}

import React, { useEffect, useState, useRef, useCallback } from 'react'
import useStore from './store/useStore'

import Einrichtungsflow from './components/Einrichtungsflow'
import KlassenTabs from './components/KlassenTabs'
import FachTabs from './components/FachTabs'
import NotenTabelle from './components/NotenTabelle'
import SchuelerDetail from './components/SchuelerDetail'
import Stundenplan from './components/Stundenplan'
import TodoBoard from './components/TodoBoard'
import TerminePanel from './components/TerminePanel'
import SpalteHinzufuegen from './components/SpalteHinzufuegen'
import Einstellungen from './components/Einstellungen'
import SitzplanView from './components/SitzplanView'
import JahresplanungView from './components/JahresplanungView'
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
    aktiveKlasse,
    init,
  } = useStore()

  const [todoBreite, setTodoBreite] = useState(() =>
    parseInt(localStorage.getItem('todo-panel-breite') ?? '288')
  )
  const [termineHoehe, setTermineHoehe] = useState(() =>
    parseInt(localStorage.getItem('termine-panel-hoehe') ?? '256')
  )

  // Horizontaler Drag (Breite rechte Sidebar)
  const draggingH = useRef(false)
  const startX = useRef(0)
  const startBreite = useRef(0)

  const onDragStart = useCallback((e) => {
    draggingH.current = true
    startX.current = e.clientX
    startBreite.current = todoBreite
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [todoBreite])

  // Vertikaler Drag (Höhe Termine-Panel)
  const draggingV = useRef(false)
  const startY = useRef(0)
  const startHoehe = useRef(0)

  const onDragStartV = useCallback((e) => {
    draggingV.current = true
    startY.current = e.clientY
    startHoehe.current = termineHoehe
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [termineHoehe])

  useEffect(() => {
    const onMove = (e) => {
      if (draggingH.current) {
        const delta = startX.current - e.clientX
        setTodoBreite(Math.min(600, Math.max(200, startBreite.current + delta)))
      }
      if (draggingV.current) {
        const delta = e.clientY - startY.current
        setTermineHoehe(Math.min(500, Math.max(80, startHoehe.current - delta)))
      }
    }
    const onUp = () => {
      if (draggingH.current) {
        draggingH.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setTodoBreite(prev => { localStorage.setItem('todo-panel-breite', String(prev)); return prev })
      }
      if (draggingV.current) {
        draggingV.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setTermineHoehe(prev => { localStorage.setItem('termine-panel-hoehe', String(prev)); return prev })
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

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
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* Immer sichtbare Navigation */}
      <KlassenTabs />
      {['notentabelle', 'sitzplan', 'jahresplanung'].includes(currentView) && <FachTabs />}

      {/* Haupt-Inhalt */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentView === 'stundenplan' && (
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-hidden flex flex-col"><Stundenplan /></div>
            <div
              className="w-1 flex-shrink-0 cursor-col-resize hover:bg-indigo-400 dark:hover:bg-indigo-600 bg-zinc-200 dark:bg-zinc-800 transition-colors"
              onMouseDown={onDragStart}
            />
            <div className="flex-shrink-0 h-full flex flex-col overflow-hidden" style={{ width: todoBreite }}>
              <TodoBoard />
              <div
                className="h-1 flex-shrink-0 cursor-row-resize hover:bg-indigo-400 dark:hover:bg-indigo-600 bg-zinc-700 transition-colors"
                onMouseDown={onDragStartV}
              />
              <TerminePanel hoehe={termineHoehe} />
            </div>
          </div>
        )}
        {currentView === 'notentabelle' && <NotenTabelle />}
        {currentView === 'sitzplan' && <SitzplanView />}
        {currentView === 'jahresplanung' && <JahresplanungView />}
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

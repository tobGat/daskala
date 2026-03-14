import React, { useState, useRef } from 'react'
import useStore from '../store/useStore'

const FARB_PALETTE = [
  '#a5b4fc', '#6366f1', '#3730a3',
  '#c4b5fd', '#8b5cf6', '#5b21b6',
  '#d8b4fe', '#a855f7', '#6b21a8',
  '#f9a8d4', '#ec4899', '#9d174d',
  '#fca5a5', '#ef4444', '#991b1b',
  '#fdba74', '#f97316', '#c2410c',
  '#fde68a', '#eab308', '#854d0e',
  '#86efac', '#22c55e', '#15803d',
  '#5eead4', '#14b8a6', '#0f766e',
  '#67e8f9', '#06b6d4', '#0e7490',
  '#93c5fd', '#3b82f6', '#1d4ed8',
  '#cbd5e1', '#64748b', '#334155',
]

const KLASSEN_VIEWS = [
  { id: 'notentabelle',  label: 'Noten' },
  { id: 'sitzplan',      label: 'Sitzplan' },
  { id: 'jahresplanung', label: 'Jahresplan' },
]

export default function FachTabs() {
  const {
    faecher, aktivesFach, setAktivesFach,
    aktiveKlasse, openModal, ladeKlassen, aktuellesSchuljahr,
    currentView, setCurrentView,
  } = useStore()

  const [renameId, setRenameId] = useState(null)
  const [renameWert, setRenameWert] = useState('')
  const renameInputRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [farbMenuFach, setFarbMenuFach] = useState(null)

  const fachHatCustomGewichtung = (fach) =>
    fach.gewichtung_sa !== null || fach.gewichtung_t !== null ||
    fach.gewichtung_ma !== null || fach.gewichtung_hue !== null

  const renameStarten = (fach) => {
    setRenameId(fach.id)
    setRenameWert(fach.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const renameSpeichern = async () => {
    if (!renameWert.trim()) { setRenameId(null); return }
    await window.api.faecher.rename(renameId, renameWert.trim())
    await ladeKlassen(aktuellesSchuljahr.id)
    setRenameId(null)
  }

  const handleContextMenu = (e, fach) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, fach })
  }

  const handleExport = async () => {
    if (!aktivesFach) return
    await window.api.export.toExcel(aktivesFach.id)
  }

  const istKlassenView = KLASSEN_VIEWS.some(v => v.id === currentView)

  return (
    <div className="flex items-center px-3 bg-white dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-700/80">
      {/* View-Selector: klassenspezifische Ansichten */}
      <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 flex-shrink-0 mr-3">
        {KLASSEN_VIEWS.map(v => (
          <button
            key={v.id}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all whitespace-nowrap
              ${currentView === v.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
            onClick={() => setCurrentView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Fach-Tabs (Connected-Tab-Stil) – nur in klassenspezifischen Views */}
      {istKlassenView && <div className="flex items-center flex-1 overflow-x-auto gap-0.5 pt-1.5">
        {faecher.map(f => {
          const aktiv = aktivesFach?.id === f.id
          const akzentFarbe = f.farbe ?? '#6366f1'
          return (
          <div key={f.id} className="relative flex-shrink-0">
            {renameId === f.id ? (
              <input
                ref={renameInputRef}
                className="px-3 py-1 text-sm border border-indigo-300 rounded outline-none bg-white dark:bg-zinc-800 dark:text-white w-32 mb-1"
                value={renameWert}
                onChange={e => setRenameWert(e.target.value)}
                onBlur={renameSpeichern}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameSpeichern()
                  if (e.key === 'Escape') setRenameId(null)
                }}
              />
            ) : (
              <button
                className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors
                  ${aktiv
                    ? 'bg-white dark:bg-zinc-950 border border-b-0 border-zinc-300 dark:border-zinc-700/80 -mb-px text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'}`}
                onClick={() => setAktivesFach(f)}
                onDoubleClick={() => renameStarten(f)}
                onContextMenu={e => handleContextMenu(e, f)}
                title="Doppelklick zum Umbenennen | Rechtsklick für Optionen"
              >
                {/* Farbiger Akzentstreifen oben beim aktiven Tab */}
                {aktiv && (
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 rounded-t-lg"
                    style={{ backgroundColor: akzentFarbe }}
                  />
                )}
                {f.farbe && !aktiv && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: f.farbe }} />
                )}
                {f.name}
                {fachHatCustomGewichtung(f) && (
                  <span className="text-xs text-amber-400" title="Angepasste Gewichtung">⚖</span>
                )}
              </button>
            )}
          </div>
          )
        })}

        {aktiveKlasse && (
          <button
            className="flex-shrink-0 px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            onClick={() => openModal('fachHinzufuegen')}
          >
            + Fach
          </button>
        )}
      </div>}

      {/* Aktionen rechts – visuell getrennt vom Tab-Bereich */}
      {istKlassenView && (aktiveKlasse || aktivesFach) && (
        <div className="flex items-center gap-1 ml-2 pl-3 py-1 flex-shrink-0 border-l border-zinc-300 dark:border-zinc-700">
          {aktiveKlasse && (
            <button
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              onClick={() => openModal('schuelerVerwalten')}
            >
              Schüler:innen
            </button>
          )}
          {aktivesFach && (
            <button
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              onClick={handleExport}
              title="Als Excel exportieren"
            >
              Export
            </button>
          )}
        </div>
      )}

      {/* Kontext-Menü */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y, position: 'fixed' }}>
            <div className="context-menu-item" onClick={() => { renameStarten(contextMenu.fach); setContextMenu(null) }}>
              Umbenennen
            </div>
            <div className="context-menu-item" onClick={() => {
              setFarbMenuFach(contextMenu.fach)
              setContextMenu(null)
            }}>
              Farbe ändern
            </div>
            <div className="context-menu-item" onClick={() => {
              openModal('gewichtung', contextMenu.fach)
              setContextMenu(null)
            }}>
              Gewichtung anpassen
            </div>
            <div className="context-menu-separator" />
            <div className="context-menu-item text-red-500" onClick={async () => {
              if (confirm(`Fach „${contextMenu.fach.name}" wirklich löschen?`)) {
                await window.api.faecher.delete(contextMenu.fach.id)
                await ladeKlassen(aktuellesSchuljahr.id)
              }
              setContextMenu(null)
            }}>
              Fach löschen
            </div>
          </div>
        </>
      )}

      {/* Farb-Picker Popup */}
      {farbMenuFach && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFarbMenuFach(null)} />
          <div className="fixed z-50 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xl p-3"
            style={{ left: 200, top: 48 }}>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Farbe für „{farbMenuFach.name}"</p>
            <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
              {FARB_PALETTE.map(farbe => (
                <button
                  key={farbe}
                  className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${farbMenuFach.farbe === farbe ? 'ring-2 ring-offset-1 ring-zinc-400' : ''}`}
                  style={{ backgroundColor: farbe }}
                  onClick={async () => {
                    await window.api.faecher.setFarbe(farbMenuFach.id, farbe)
                    await ladeKlassen(aktuellesSchuljahr.id)
                    setFarbMenuFach(null)
                  }}
                />
              ))}
              <button
                className="w-5 h-5 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center text-zinc-400 text-[9px] hover:border-zinc-400 transition-colors"
                onClick={async () => {
                  await window.api.faecher.setFarbe(farbMenuFach.id, null)
                  await ladeKlassen(aktuellesSchuljahr.id)
                  setFarbMenuFach(null)
                }}
                title="Keine Farbe"
              >✕</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

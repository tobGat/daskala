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

export default function KlassenTabs() {
  const {
    klassen, aktiveKlasse, setAktiveKlasse,
    schuljahre, aktuellesSchuljahr, setAktuellesSchuljahr,
    openModal, ladeKlassen,
    currentView, setCurrentView,
  } = useStore()

  const [renameId, setRenameId] = useState(null)
  const [renameWert, setRenameWert] = useState('')
  const renameInputRef = useRef(null)
  const [farbMenuKlasse, setFarbMenuKlasse] = useState(null)

  const renameStarten = (klasse, e) => {
    e.preventDefault()
    setRenameId(klasse.id)
    setRenameWert(klasse.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const renameSpeichern = async () => {
    if (!renameWert.trim()) { setRenameId(null); return }
    await window.api.klassen.rename(renameId, renameWert.trim())
    await ladeKlassen(aktuellesSchuljahr.id)
    setRenameId(null)
  }

  const schuljahrWechseln = async (e) => {
    const sj = schuljahre.find(s => s.id === parseInt(e.target.value))
    if (sj) await setAktuellesSchuljahr(sj)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800/60">

      {/* View-Toggle: Stundenplan / Notentabelle */}
      <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 flex-shrink-0">
        <button
          className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all whitespace-nowrap
            ${currentView === 'stundenplan'
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
          onClick={() => setCurrentView('stundenplan')}
          title="Stundenplan"
        >
          ◫ Plan
        </button>
        <button
          className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all whitespace-nowrap
            ${currentView === 'notentabelle'
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
          onClick={() => setCurrentView('notentabelle')}
          title="Notentabelle"
        >
          Noten
        </button>
        <button
          className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all whitespace-nowrap
            ${currentView === 'todos'
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
          onClick={() => setCurrentView('todos')}
          title="ToDo-Board"
        >
          ToDos
        </button>
      </div>

      {/* Trennlinie */}
      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />

      {/* Klassen-Tabs */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {klassen.map(k => (
          <div key={k.id} className="relative flex-shrink-0">
            {renameId === k.id ? (
              <input
                ref={renameInputRef}
                className="px-3 py-1 text-sm border border-indigo-300 rounded-full outline-none bg-white dark:bg-zinc-800 dark:text-white w-24 focus:ring-2 focus:ring-indigo-500/20"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-all whitespace-nowrap
                  ${aktiveKlasse?.id === k.id
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                onClick={() => setAktiveKlasse(k)}
                onDoubleClick={e => renameStarten(k, e)}
                onContextMenu={e => { e.preventDefault(); setFarbMenuKlasse(k) }}
                title="Doppelklick zum Umbenennen | Rechtsklick für Farbe"
              >
                {k.farbe && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: k.farbe }} />
                )}
                {k.name}
              </button>
            )}
          </div>
        ))}

        <button
          className="flex-shrink-0 px-3 py-1.5 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          onClick={() => openModal('klasseHinzufuegen')}
          title="Neue Klasse"
        >
          + Klasse
        </button>
      </div>

      {/* Schuljahr + Aktionen rechts */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <select
          className="text-xs bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 cursor-pointer
            text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
          value={aktuellesSchuljahr?.id ?? ''}
          onChange={schuljahrWechseln}
        >
          {schuljahre.filter(s => !s.archiviert).map(s => (
            <option key={s.id} value={s.id}>{s.bezeichnung}</option>
          ))}
        </select>

        <button
          className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          onClick={() => openModal('archiv')}
          title="Archiv"
        >
          Archiv
        </button>

        <button
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-base"
          onClick={() => openModal('einstellungen')}
          title="Einstellungen"
        >
          ⚙
        </button>

        <button
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm"
          onClick={() => openModal('exportieren')}
          title="Exportieren"
        >
          ↓
        </button>
      </div>

      {/* Farb-Picker für Klasse */}
      {farbMenuKlasse && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFarbMenuKlasse(null)} />
          <div className="fixed z-50 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xl p-3"
            style={{ left: 80, top: 44 }}>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Farbe für „{farbMenuKlasse.name}"</p>
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
              {FARB_PALETTE.map(farbe => (
                <button
                  key={farbe}
                  className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${farbMenuKlasse.farbe === farbe ? 'ring-2 ring-offset-1 ring-zinc-400' : ''}`}
                  style={{ backgroundColor: farbe }}
                  onClick={async () => {
                    await window.api.klassen.setFarbe(farbMenuKlasse.id, farbe)
                    await ladeKlassen(aktuellesSchuljahr.id)
                    setFarbMenuKlasse(null)
                  }}
                />
              ))}
              <button
                className="w-5 h-5 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center text-zinc-400 text-[9px] hover:border-zinc-400 transition-colors"
                onClick={async () => {
                  await window.api.klassen.setFarbe(farbMenuKlasse.id, null)
                  await ladeKlassen(aktuellesSchuljahr.id)
                  setFarbMenuKlasse(null)
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

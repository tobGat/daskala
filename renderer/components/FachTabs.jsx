// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef } from 'react'
import useStore from '../store/useStore'
import { FachSchuelerModal } from './Modals'

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

export default function FachTabs() {
  const {
    faecher, aktivesFach, setAktivesFach,
    aktiveKlasse, openModal, ladeAktiveKlassenliste, pushToast,
    vorlagenModus,
  } = useStore()

  const [renameId, setRenameId] = useState(null)
  const [renameWert, setRenameWert] = useState('')
  const renameInputRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [farbMenuFach, setFarbMenuFach] = useState(null)
  const [benotungMenuFach, setBenotungMenuFach] = useState(null)
  const [fachSchuelerFach, setFachSchuelerFach] = useState(null)

  const fachHatCustomGewichtung = (fach) =>
    fach.gewichtung_sa !== null || fach.gewichtung_t !== null ||
    fach.gewichtung_custom !== null ||
    fach.ma_max_einfluss !== null || fach.hue_max_einfluss !== null

  const renameStarten = (fach) => {
    setRenameId(fach.id)
    setRenameWert(fach.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const renameSpeichern = async () => {
    if (!renameWert.trim()) { setRenameId(null); return }
    const res = await window.api.faecher.rename(renameId, renameWert.trim())
    if (res?.ordnerWarnung) pushToast(res.ordnerWarnung, 'error')
    await ladeAktiveKlassenliste()
    setRenameId(null)
  }

  const handleContextMenu = (e, fach) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, fach })
  }

  const handleExport = async () => {
    if (!aktivesFach) return
    await window.api.export.fachOds(aktivesFach.id)
  }

  const handleJahresplanungExport = async () => {
    if (!aktivesFach) return
    const ok = await window.api.export.jahresplanungOdt(aktivesFach.id)
    if (ok) pushToast('Jahresplanung als ODT exportiert.', 'success')
  }

  return (
    <div className="flex items-center px-3 bg-white dark:bg-ink-900 border-b border-paper-300 dark:border-ink-700/80">

      {/* Fach-Tabs */}
      <div className="flex items-center flex-1 overflow-x-auto gap-0.5 pt-1.5">
        {faecher.map(f => {
          const aktiv = aktivesFach?.id === f.id
          const akzentFarbe = f.farbe ?? '#6366f1'
          return (
          <div key={f.id} className="relative flex-shrink-0">
            {renameId === f.id ? (
              <input
                ref={renameInputRef}
                className="px-3 py-1 text-sm border border-coral-300 rounded outline-none bg-white dark:bg-ink-800 dark:text-white w-32 mb-1"
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
                    ? 'bg-white dark:bg-ink-950 border border-b-0 border-paper-300 dark:border-ink-700/80 -mb-px text-ink-900 dark:text-paper-100 shadow-sm'
                    : 'text-ink-500 dark:text-ink-400 hover:text-ink-800 dark:hover:text-ink-900 dark:hover:text-paper-200 hover:bg-paper-100 dark:hover:bg-ink-800/60'}`}
                onClick={() => setAktivesFach(f)}
                onDoubleClick={() => renameStarten(f)}
                onContextMenu={e => handleContextMenu(e, f)}
                title="Doppelklick zum Umbenennen | Rechtsklick für Optionen"
              >
                {aktiv && (
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 rounded-t-lg"
                    style={{ backgroundColor: akzentFarbe }}
                  />
                )}
                {f.farbe && (
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
            className="flex-shrink-0 px-3 py-2 text-sm text-ink-400 dark:text-ink-500 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 transition-colors"
            onClick={() => openModal('fachHinzufuegen')}
          >
            + Fach
          </button>
        )}
      </div>

      {/* Aktionen rechts */}
      {(aktiveKlasse || aktivesFach) && (
        <div className="flex items-center gap-1 ml-2 pl-3 py-1 flex-shrink-0 border-l border-paper-300 dark:border-ink-700">
          {aktiveKlasse && !vorlagenModus && (
            <button
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 hover:border-paper-300 dark:hover:border-ink-600 transition-colors"
              onClick={() => openModal('schuelerVerwalten')}
            >
              Schüler:innen
            </button>
          )}
          {aktivesFach && (
            <button
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 hover:border-paper-300 dark:hover:border-ink-600 transition-colors"
              onClick={vorlagenModus ? handleJahresplanungExport : handleExport}
              title={vorlagenModus ? 'Jahresplanung als ODT exportieren' : 'Als ODS-Tabelle exportieren'}
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
            <div className="context-menu-item" onClick={() => {
              setBenotungMenuFach(contextMenu.fach)
              setContextMenu(null)
            }}>
              Benotungssystem {contextMenu.fach.benotungssystem === 'differenziert' ? '(AHS/ST)' : '(Standard)'}
            </div>
            {!vorlagenModus && (
              <div className="context-menu-item" onClick={() => {
                setFachSchuelerFach(contextMenu.fach)
                setContextMenu(null)
              }}>
                Schüler:innen zuordnen…
              </div>
            )}
            <div className="context-menu-separator" />
            <div className="context-menu-item text-red-500" onClick={async () => {
              if (confirm(`Fach „${contextMenu.fach.name}" wirklich löschen?`)) {
                await window.api.faecher.delete(contextMenu.fach.id)
                await ladeAktiveKlassenliste()
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
          <div className="fixed z-50 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700 shadow-xl p-3"
            style={{ left: 200, top: 48 }}>
            <p className="text-xs font-medium text-ink-500 dark:text-ink-400 mb-2">Farbe für „{farbMenuFach.name}"</p>
            <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
              {FARB_PALETTE.map(farbe => (
                <button
                  key={farbe}
                  className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${farbMenuFach.farbe === farbe ? 'ring-2 ring-offset-1 ring-ink-400' : ''}`}
                  style={{ backgroundColor: farbe }}
                  onClick={async () => {
                    await window.api.faecher.setFarbe(farbMenuFach.id, farbe)
                    await ladeAktiveKlassenliste()
                    setFarbMenuFach(null)
                  }}
                />
              ))}
              <button
                className="w-5 h-5 rounded-full border-2 border-dashed border-paper-300 dark:border-ink-600 flex items-center justify-center text-ink-400 text-[9px] hover:border-ink-400 transition-colors"
                onClick={async () => {
                  await window.api.faecher.setFarbe(farbMenuFach.id, null)
                  await ladeAktiveKlassenliste()
                  setFarbMenuFach(null)
                }}
                title="Keine Farbe"
              >✕</button>
            </div>
          </div>
        </>
      )}

      {/* Benotungssystem-Popup */}
      {benotungMenuFach && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setBenotungMenuFach(null)} />
          <div className="fixed z-50 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700 shadow-xl p-3"
            style={{ left: 200, top: 48 }}>
            <p className="text-xs font-medium text-ink-500 dark:text-ink-400 mb-2">Benotungssystem für „{benotungMenuFach.name}"</p>
            <div className="flex gap-2">
              <button
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  benotungMenuFach.benotungssystem !== 'differenziert'
                    ? 'border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900 dark:text-coral-300 dark:border-coral-600'
                    : 'border-paper-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800'
                }`}
                onClick={async () => {
                  await window.api.faecher.setBenotungssystem(benotungMenuFach.id, 'standard')
                  await ladeAktiveKlassenliste()
                  setBenotungMenuFach(null)
                }}
              >
                <div>Standard</div>
                <div className="text-xs opacity-70 mt-0.5">Noten 1–5</div>
              </button>
              <button
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  benotungMenuFach.benotungssystem === 'differenziert'
                    ? 'border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900 dark:text-coral-300 dark:border-coral-600'
                    : 'border-paper-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800'
                }`}
                onClick={async () => {
                  await window.api.faecher.setBenotungssystem(benotungMenuFach.id, 'differenziert')
                  await ladeAktiveKlassenliste()
                  setBenotungMenuFach(null)
                }}
              >
                <div>AHS / ST</div>
                <div className="text-xs opacity-70 mt-0.5">Differenziert</div>
              </button>
            </div>
          </div>
        </>
      )}

      {fachSchuelerFach && (
        <FachSchuelerModal
          fach={fachSchuelerFach}
          onClose={() => setFachSchuelerFach(null)}
          onSaved={ladeAktiveKlassenliste}
        />
      )}
    </div>
  )
}

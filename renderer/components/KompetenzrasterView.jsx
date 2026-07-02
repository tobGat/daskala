import React, { useState, useRef, memo } from 'react'
import useStore from '../store/useStore'

const NIVEAU_LABELS = ['·', 'G', 'E', 'V']
const NIVEAU_FARBEN = [
  'text-ink-400 dark:text-ink-600',                                          // 0: nicht erfasst
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',     // 1: Grundniveau
  'bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-400',         // 2: Erweitert
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', // 3: Vertieft
]

// ─── Kompetenz-Zelle ─────────────────────────────────────────────────────────
const KompetenzZelle = memo(function KompetenzZelle({ kompetenzbereichId, schueler }) {
  const { schuelerKompetenzen, setKompetenzNiveau } = useStore()
  const [notizOffen, setNotizOffen] = useState(false)
  const cellRef = useRef(null)

  const key = `${kompetenzbereichId}_${schueler.id}`
  const sk = schuelerKompetenzen[key]
  const niveau = sk?.niveau ?? 0

  const handleClick = () => {
    const next = (niveau + 1) % 4
    setKompetenzNiveau(kompetenzbereichId, schueler.id, next)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setNotizOffen(true)
  }

  return (
    <td className="p-0 relative" style={{ width: 56, minWidth: 56 }}>
      <div
        ref={cellRef}
        className={`w-full h-9 flex items-center justify-center cursor-pointer select-none text-xs font-bold rounded-sm transition-colors hover:opacity-80 ${NIVEAU_FARBEN[niveau]}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={sk?.notiz || `${schueler.nachname} ${schueler.vorname} | Klick: Niveau ändern | Rechtsklick: Notiz`}
      >
        {NIVEAU_LABELS[niveau]}
        {sk?.notiz && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-coral-400 dark:bg-coral-500" style={{ pointerEvents: 'none' }} />
        )}
      </div>
      {notizOffen && (
        <KompetenzNotizPopup
          notiz={sk?.notiz ?? ''}
          onSave={(text) => {
            setKompetenzNiveau(kompetenzbereichId, schueler.id, niveau, text)
            setNotizOffen(false)
          }}
          onClose={() => setNotizOffen(false)}
          anchorRef={cellRef}
        />
      )}
    </td>
  )
})

// ─── Notiz-Popup ─────────────────────────────────────────────────────────────
function KompetenzNotizPopup({ notiz, onSave, onClose, anchorRef }) {
  const [text, setText] = useState(notiz)
  const popupRef = useRef(null)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={popupRef}
        className="absolute z-50 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg shadow-xl p-2 w-48"
        style={{ top: '100%', left: 0, marginTop: 2 }}
      >
        <span className="text-[10px] text-ink-400 dark:text-ink-500 font-medium uppercase tracking-wide">Notiz</span>
        <textarea
          className="w-full text-xs bg-paper-50 dark:bg-ink-900 border border-paper-200 dark:border-ink-700 rounded p-1.5 outline-none resize-none text-ink-800 dark:text-paper-100 placeholder:text-ink-400 mt-1"
          rows={3}
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
          placeholder="Notiz zur Kompetenz…"
        />
        <div className="flex gap-1 justify-end mt-1">
          <button className="text-xs px-2 py-0.5 rounded text-ink-500 hover:bg-paper-100 dark:hover:bg-paper-200 dark:hover:bg-ink-700" onClick={onClose}>Abbrechen</button>
          <button className="text-xs px-2 py-0.5 rounded bg-coral-600 text-white hover:bg-coral-700" onClick={() => onSave(text)}>Speichern</button>
        </div>
      </div>
    </>
  )
}

// ─── Haupt-Komponente ────────────────────────────────────────────────────────
export default function KompetenzrasterView() {
  const {
    schueler, aktivesFach, kompetenzbereiche,
    ladeKompetenzen, setDetailSchueler,
  } = useStore()

  const [renameId, setRenameId] = useState(null)
  const [renameWert, setRenameWert] = useState('')
  const [contextMenu, setContextMenu] = useState(null)

  if (!aktivesFach) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-ink-500 dark:text-ink-400">Kein Fach ausgewählt</p>
      </div>
    )
  }

  if (schueler.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-ink-500 dark:text-ink-400">Noch keine Schüler:innen</p>
      </div>
    )
  }

  const handleAddBereich = async () => {
    await window.api.kompetenzbereiche.create(aktivesFach.id, 'Neuer Bereich', null)
    await ladeKompetenzen()
  }

  const handleInitVorlagen = async () => {
    await window.api.kompetenzbereiche.initVorlagen(aktivesFach.id, aktivesFach.name)
    await ladeKompetenzen()
  }

  const handleRenameStart = (kb) => {
    setRenameId(kb.id)
    setRenameWert(kb.titel)
  }

  const handleRenameSave = async () => {
    if (renameWert.trim() && renameId) {
      await window.api.kompetenzbereiche.update(renameId, { titel: renameWert.trim(), beschreibung: null })
      await ladeKompetenzen()
    }
    setRenameId(null)
  }

  const handleDeleteBereich = async (id) => {
    if (!confirm('Kompetenzbereich und alle Einstufungen löschen?')) return
    await window.api.kompetenzbereiche.delete(id)
    await ladeKompetenzen()
    setContextMenu(null)
  }

  const handleHeaderContext = (e, kb) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, kb })
  }

  // Leer-Zustand
  if (kompetenzbereiche.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-base mb-1 text-ink-500 dark:text-ink-400">Keine Kompetenzbereiche definiert</p>
          <p className="text-sm text-ink-400 dark:text-ink-500 mb-4">Lege Kompetenzbereiche an oder lade eine Vorlage.</p>
          <div className="flex gap-3 justify-center">
            <button className="btn-primary" onClick={handleInitVorlagen}>Aus Vorlage laden</button>
            <button className="btn-secondary" onClick={handleAddBereich}>Manuell anlegen</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-ink-950 border-b border-paper-100 dark:border-ink-800/60">
        <span className="text-xs font-medium text-ink-500 dark:text-ink-400">Kompetenzraster</span>
        <span className="text-xs text-ink-600 dark:text-paper-300 dark:text-ink-600">|</span>
        <div className="flex gap-2 text-xs">
          {[
            ['·', 'nicht erfasst', 'text-ink-400'],
            ['G', 'Grundniveau', 'text-amber-600'],
            ['E', 'Erweitert', 'text-coral-600'],
            ['V', 'Vertieft', 'text-emerald-600'],
          ].map(([k, label, cls]) => (
            <span key={k} className={`${cls} font-bold`}>{k}</span>
          ))}
        </div>
        <div className="flex-1" />
        <button
          className="text-xs text-coral-600 dark:text-coral-400 hover:underline"
          onClick={handleAddBereich}
        >
          + Bereich
        </button>
      </div>

      {/* Tabelle */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse">
          <thead className="sticky top-0 z-20 bg-white dark:bg-ink-950">
            <tr>
              <th
                className="sticky left-0 z-30 bg-white dark:bg-ink-950 px-3 py-2 text-left text-xs font-medium text-ink-400 border-b border-r border-paper-100 dark:border-ink-800/60"
                style={{ minWidth: 160, width: 160 }}
              >
                Schüler:in
              </th>
              {kompetenzbereiche.map(kb => (
                <th
                  key={kb.id}
                  className="px-1 py-2 text-center border-b border-paper-100 dark:border-ink-800/60 cursor-pointer select-none group"
                  style={{ minWidth: 56 }}
                  onDoubleClick={() => handleRenameStart(kb)}
                  onContextMenu={e => handleHeaderContext(e, kb)}
                  title={kb.beschreibung || 'Doppelklick zum Umbenennen | Rechtsklick für Optionen'}
                >
                  {renameId === kb.id ? (
                    <input
                      className="text-xs border border-coral-300 rounded px-1 py-0.5 outline-none bg-white dark:bg-ink-800 dark:text-white w-full"
                      value={renameWert}
                      onChange={e => setRenameWert(e.target.value)}
                      onBlur={handleRenameSave}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameSave(); if (e.key === 'Escape') setRenameId(null) }}
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs font-semibold text-ink-600 dark:text-paper-300 leading-tight">
                      {kb.titel}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schueler.map(s => (
              <tr key={s.id} className="border-b border-paper-100 dark:border-ink-800/50">
                <td
                  className="sticky left-0 z-10 bg-white dark:bg-ink-950 px-3 py-0 cursor-pointer hover:bg-coral-50/40 dark:hover:bg-coral-900/30 border-r border-paper-100 dark:border-ink-800/60 transition-colors"
                  style={{ minWidth: 160, width: 160, height: 36 }}
                  onClick={() => setDetailSchueler(s)}
                >
                  <span className="text-sm font-medium text-ink-800 dark:text-paper-100">{s.nachname}</span>
                  <span className="text-sm text-ink-400 dark:text-ink-500 ml-1">{s.vorname}</span>
                </td>
                {kompetenzbereiche.map(kb => (
                  <KompetenzZelle key={kb.id} kompetenzbereichId={kb.id} schueler={s} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kontextmenü */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y, position: 'fixed' }}>
            <div className="context-menu-item" onClick={() => { handleRenameStart(contextMenu.kb); setContextMenu(null) }}>
              Umbenennen
            </div>
            <div className="context-menu-separator" />
            <div className="context-menu-item text-red-500" onClick={() => handleDeleteBereich(contextMenu.kb.id)}>
              Bereich löschen
            </div>
          </div>
        </>
      )}
    </div>
  )
}

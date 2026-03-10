import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore'

function noteKlasse(n) {
  const num = Math.round(n)
  if (num === 1) return 'note-1'
  if (num === 2) return 'note-2'
  if (num === 3) return 'note-3'
  if (num === 4) return 'note-4'
  if (num === 5) return 'note-5'
  return ''
}

export default function ZeugnisnoteZelle({ schueler, semester }) {
  const { zeugnisnoten, aktivesFach, refreshZeugnisnoten } = useStore()
  const [contextMenu, setContextMenu] = useState(null)
  const [manuellPopup, setManuellPopup] = useState(false)
  const cellRef = useRef(null)

  const key = `${schueler.id}_${semester}`
  const zn = zeugnisnoten[key]
  const noteBerechnet = zn?.note_berechnet
  const noteManuell = zn?.note_manuell
  const istManuell = noteManuell !== null && noteManuell !== undefined
  const s1Eingerechnet = !!zn?.s1_eingerechnet

  // S1-ZN für Tooltip (wenn semester=2 und S1 eingerechnet)
  const s1Zn = zeugnisnoten[`${schueler.id}_1`]
  const s1Note = s1Zn?.note_manuell ?? s1Zn?.note_berechnet

  const anzeigeNote = istManuell ? noteManuell : (noteBerechnet ? Math.round(noteBerechnet) : null)

  const handleClick = () => setManuellPopup(true)

  const handleContextMenu = (e) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleManuellSelect = async (note) => {
    if (!aktivesFach) return
    await window.api.zeugnisnoten.setManuell(aktivesFach.id, schueler.id, semester, note === '' ? null : parseInt(note))
    await refreshZeugnisnoten()
    setManuellPopup(false)
  }

  const handleReset = async () => {
    if (!aktivesFach) return
    await window.api.zeugnisnoten.clearManuell(aktivesFach.id, schueler.id, semester)
    await refreshZeugnisnoten()
    setContextMenu(null)
  }

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  const tooltip = semester === 2 && s1Eingerechnet && !istManuell
    ? `S1-ZN: ${s1Note} | Jahresberechnung inkl. S1 → ${noteBerechnet?.toFixed(1)}`
    : noteBerechnet
      ? `Berechnet: ${noteBerechnet.toFixed(1)}${istManuell ? ` → Manuell: ${noteManuell}` : ''}`
      : 'Noch keine Einträge'

  return (
    <td className="p-0 relative" style={{ width: 42, minWidth: 42 }}>
      <div
        ref={cellRef}
        className={`zn-zelle cursor-pointer select-none
          ${istManuell ? 'zn-manuell' : ''}
          ${anzeigeNote ? noteKlasse(anzeigeNote) : 'text-gray-300'}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={tooltip}
      >
        {anzeigeNote ?? '–'}
        {semester === 2 && s1Eingerechnet && !istManuell && (
          <span className="absolute top-0 right-0 text-[7px] font-bold text-indigo-400 dark:text-indigo-500 leading-none px-0.5 pointer-events-none">S1</span>
        )}
      </div>

      {/* Manuell-Eingabe Popup */}
      {manuellPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setManuellPopup(false)} />
          <div className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2"
            style={{ top: '100%', right: 0, marginTop: 2, minWidth: 140 }}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-1">Zeugnisnote Semester {semester}</p>
            {noteBerechnet && (
              <p className="text-xs text-gray-400 mb-2 px-1">Berechnet: {noteBerechnet.toFixed(1)}</p>
            )}
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`w-8 h-8 rounded font-bold text-sm transition-colors
                    ${(istManuell ? noteManuell : Math.round(noteBerechnet)) === n
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  onClick={() => handleManuellSelect(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {istManuell && (
              <button
                className="w-full text-xs text-red-500 hover:text-red-700 py-1"
                onClick={() => handleManuellSelect('')}
              >
                Überschreibung zurücksetzen
              </button>
            )}
          </div>
        </>
      )}

      {/* Rechtsklick-Menü */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y, position: 'fixed' }}>
            {istManuell && (
              <div className="context-menu-item" onClick={handleReset}>
                Berechnung wiederherstellen
              </div>
            )}
            <div className="context-menu-item" onClick={() => { setManuellPopup(true); setContextMenu(null) }}>
              Note manuell setzen
            </div>
          </div>
        </>
      )}
    </td>
  )
}

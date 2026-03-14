import React, { useState, useEffect, useRef, useCallback } from 'react'
import useStore from '../store/useStore'

// Dimensionen
const EINZEL_W = 80
const EINZEL_H = 80
const DOPPEL_W = 170
const DOPPEL_H = 80
const SITZ_W = 75

function tischBreite(typ) { return typ === 'doppel' ? DOPPEL_W : EINZEL_W }

export default function SitzplanView() {
  const { aktiveKlasse, schueler, aktivesFach, spalten, eintraege, aktiveSemester } = useStore()

  const [tische, setTische] = useState([])
  const [bearbeitungsModus, setBearbeitungsModus] = useState(false)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, sitz }
  const [eintragMenu, setEintragMenu] = useState(null) // { x, y, schueler_id }
  const dragRef = useRef(null)
  const canvasRef = useRef(null)

  const ladeTische = useCallback(async () => {
    if (!aktiveKlasse) return
    const data = await window.api.sitzplan.getTische(aktiveKlasse.id)
    setTische(data)
  }, [aktiveKlasse?.id])

  useEffect(() => {
    ladeTische()
  }, [ladeTische])

  // Kontextmenü schließen bei Klick außerhalb
  useEffect(() => {
    if (!contextMenu && !eintragMenu) return
    const handler = () => { setContextMenu(null); setEintragMenu(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu, eintragMenu])

  // ─── Drag & Drop ───────────────────────────────────────────────────────────
  const onTischMouseDown = (e, tisch) => {
    if (!bearbeitungsModus) return
    e.preventDefault()
    dragRef.current = {
      tischId: tisch.id,
      startX: e.clientX, startY: e.clientY,
      origX: tisch.x, origY: tisch.y,
    }

    const onMove = (ev) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const newX = Math.max(0, dragRef.current.origX + dx)
      const newY = Math.max(0, dragRef.current.origY + dy)
      setTische(prev => prev.map(t =>
        t.id === dragRef.current.tischId ? { ...t, x: newX, y: newY } : t
      ))
    }

    const onUp = async (ev) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const newX = Math.max(0, dragRef.current.origX + dx)
      const newY = Math.max(0, dragRef.current.origY + dy)
      await window.api.sitzplan.moveTisch(dragRef.current.tischId, newX, newY)
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Tisch hinzufügen ──────────────────────────────────────────────────────
  const handleAddTisch = async (typ) => {
    if (!aktiveKlasse) return
    // Neuen Tisch in der Mitte des sichtbaren Canvas platzieren
    const canvas = canvasRef.current
    const rect = canvas ? canvas.getBoundingClientRect() : { width: 800, height: 500 }
    const x = rect.width / 2 - tischBreite(typ) / 2
    const y = rect.height / 2 - EINZEL_H / 2
    await window.api.sitzplan.createTisch(aktiveKlasse.id, typ, x, y)
    await ladeTische()
  }

  // ─── Tisch löschen ─────────────────────────────────────────────────────────
  const handleDeleteTisch = async (tischId) => {
    await window.api.sitzplan.deleteTisch(tischId)
    setTische(prev => prev.filter(t => t.id !== tischId))
  }

  // ─── Sitz-Kontextmenü (Schüler:in zuweisen) ────────────────────────────────
  const handleSitzRechtsklick = (e, sitz) => {
    if (bearbeitungsModus) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, sitz })
  }

  const handleAssign = async (sitz, schuelerId) => {
    await window.api.sitzplan.assignSchueler(sitz.id, schuelerId)
    await ladeTische()
    setContextMenu(null)
  }

  // ─── Sitz-Klick (Eintrag für heute) ────────────────────────────────────────
  const handleSitzKlick = (e, sitz) => {
    if (bearbeitungsModus) return
    if (!sitz.schueler_id) return
    e.stopPropagation()
    setEintragMenu({ x: e.clientX, y: e.clientY, schueler_id: sitz.schueler_id })
  }

  // ─── Heutige Spalten ───────────────────────────────────────────────────────
  const heute = new Date().toISOString().split('T')[0]

  const handleSitzEintrag = async (kategorie, wert) => {
    // Frische Werte direkt aus dem Store holen (nicht aus der Closure)
    const { aktivesFach: fach, spalten: freshSpalten, aktiveSemester: sem, ladeFachDaten } = useStore.getState()
    if (!fach) return

    const schuelerId = eintragMenu.schueler_id

    // Bestehende Spalte für heute suchen oder neue anlegen
    const existing = freshSpalten.find(s =>
      s.datum === heute && s.semester === sem && s.kategorie === kategorie
    )
    const spalteId = existing
      ? existing.id
      : await window.api.spalten.create({
          fachId: fach.id,
          semester: sem,
          kategorie,
          kuerzel: kategorie,
          datum: heute,
        })

    await window.api.eintraege.set(spalteId, schuelerId, wert)
    await ladeFachDaten(fach.id)
  }

  const getHeutigerWert = (kategorie, schuelerId) => {
    const s = spalten.find(sp => sp.datum === heute && sp.semester === aktiveSemester && sp.kategorie === kategorie)
    return s ? (eintraege[`${s.id}_${schuelerId}`] ?? '') : ''
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────
  if (!aktiveKlasse) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
        Keine Klasse ausgewählt
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
        <button
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            bearbeitungsModus
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
          onClick={() => setBearbeitungsModus(v => !v)}
        >
          {bearbeitungsModus ? '✓ Bearbeiten' : 'Bearbeiten'}
        </button>
        {bearbeitungsModus && (
          <>
            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
            <button className="btn-secondary text-xs" onClick={() => handleAddTisch('einzel')}>
              + Einzeltisch
            </button>
            <button className="btn-secondary text-xs" onClick={() => handleAddTisch('doppel')}>
              + Doppeltisch
            </button>
            <span className="text-xs text-zinc-400">Tische verschieben und löschen</span>
          </>
        )}
        {!bearbeitungsModus && tische.length > 0 && (
          <span className="text-xs text-zinc-400">
            Rechtsklick auf Sitzplatz → Schüler:in zuweisen · Klick auf belegten Sitz → Eintrag
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-auto bg-zinc-50 dark:bg-zinc-950"
        style={{ backgroundImage: 'radial-gradient(circle, #d4d4d8 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onClick={() => { setContextMenu(null); setEintragMenu(null) }}
      >
        {tische.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm pointer-events-none">
            Noch keine Tische. Klicke auf „+ Einzeltisch" oder „+ Doppeltisch".
          </div>
        )}

        {tische.map(tisch => (
          <Tisch
            key={tisch.id}
            tisch={tisch}
            bearbeitungsModus={bearbeitungsModus}
            onMouseDown={onTischMouseDown}
            onDelete={handleDeleteTisch}
            onSitzRechtsklick={handleSitzRechtsklick}
            onSitzKlick={handleSitzKlick}
          />
        ))}
      </div>

      {/* Rechtsklick-Menü: Schüler:in zuweisen */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y, position: 'fixed', zIndex: 50, maxHeight: 300, overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="context-menu-item text-zinc-400" onClick={() => handleAssign(contextMenu.sitz, null)}>
              — Kein Schüler:in —
            </div>
            {schueler.map(s => (
              <div
                key={s.id}
                className={`context-menu-item ${contextMenu.sitz.schueler_id === s.id ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}`}
                onClick={() => handleAssign(contextMenu.sitz, s.id)}
              >
                {s.nachname} {s.vorname}
                {contextMenu.sitz.schueler_id === s.id ? ' ✓' : ''}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Eintrag-Menü für heute */}
      {eintragMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEintragMenu(null)} />
          <div
            className="absolute z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3 min-w-[200px]"
            style={{ left: eintragMenu.x, top: eintragMenu.y, position: 'fixed' }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const s = schueler.find(s => s.id === eintragMenu.schueler_id)
              return <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{s?.nachname} {s?.vorname}</p>
            })()}
            {!aktivesFach && (
              <p className="text-xs text-zinc-400">Kein Fach ausgewählt.</p>
            )}
            {aktivesFach && (
              <div className="space-y-2">
                {/* MA */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 w-6">MA</span>
                  {['+', '-'].map(wert => {
                    const aktiv = getHeutigerWert('MA', eintragMenu.schueler_id) === wert
                    return (
                      <button
                        key={wert}
                        className={`w-8 h-8 rounded font-bold text-sm transition-colors
                          ${aktiv
                            ? wert === '+' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`}
                        onClick={() => handleSitzEintrag('MA', wert)}
                      >
                        {wert}
                      </button>
                    )
                  })}
                </div>
                {/* HÜ */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 w-6">HÜ</span>
                  {[['✓', 'green'], ['✗', 'red']].map(([wert, farbe]) => {
                    const aktiv = getHeutigerWert('HÜ', eintragMenu.schueler_id) === wert
                    return (
                      <button
                        key={wert}
                        className={`w-8 h-8 rounded font-bold text-sm transition-colors
                          ${aktiv
                            ? farbe === 'green' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'}`}
                        onClick={() => handleSitzEintrag('HÜ', wert)}
                      >
                        {wert}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Tisch({ tisch, bearbeitungsModus, onMouseDown, onDelete, onSitzRechtsklick, onSitzKlick }) {
  const w = tischBreite(tisch.typ)

  return (
    <div
      className={`absolute select-none ${bearbeitungsModus ? 'cursor-move' : ''}`}
      style={{ left: tisch.x, top: tisch.y, width: w, height: EINZEL_H }}
      onMouseDown={e => onMouseDown(e, tisch)}
    >
      {/* Tisch-Fläche */}
      <div
        className={`absolute inset-0 rounded-xl border-2 transition-colors
          ${bearbeitungsModus
            ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
            : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'}`}
      />

      {/* Löschen-Button im Bearbeitungsmodus */}
      {bearbeitungsModus && (
        <button
          className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 shadow-sm"
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(tisch.id) }}
        >
          ✕
        </button>
      )}

      {/* Sitzplätze */}
      <div className="absolute inset-0 flex items-center justify-center gap-2 px-2">
        {tisch.sitze.map(sitz => (
          <SitzPlatz
            key={sitz.id}
            sitz={sitz}
            bearbeitungsModus={bearbeitungsModus}
            onRechtsklick={onSitzRechtsklick}
            onKlick={onSitzKlick}
          />
        ))}
      </div>
    </div>
  )
}

function SitzPlatz({ sitz, bearbeitungsModus, onRechtsklick, onKlick }) {
  const belegt = !!sitz.schueler_id
  const kuerzel = belegt
    ? `${sitz.nachname?.charAt(0) ?? ''}${sitz.vorname?.charAt(0) ?? ''}`
    : ''

  return (
    <div
      className={`flex items-center justify-center rounded-lg border transition-all text-xs font-bold
        ${belegt
          ? bearbeitungsModus
            ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
            : 'border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-600'
          : 'border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-300 dark:text-zinc-600 cursor-context-menu'
        }`}
      style={{ width: SITZ_W, height: 56 }}
      title={belegt ? `${sitz.nachname} ${sitz.vorname}` : 'Leer – Rechtsklick zum Zuweisen'}
      onContextMenu={e => onRechtsklick(e, sitz)}
      onClick={e => onKlick(e, sitz)}
    >
      {belegt ? kuerzel : (
        <span className="text-[10px] font-normal text-zinc-300 dark:text-zinc-600">frei</span>
      )}
    </div>
  )
}

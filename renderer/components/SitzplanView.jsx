// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect, useRef, useCallback } from 'react'
import useStore from '../store/useStore'
import SchuelerAvatar from './SchuelerAvatar'

// Dimensionen
const EINZEL_W = 80
const EINZEL_H = 80
const DOPPEL_W = 170
const DOPPEL_H = 80
const SITZ_W = 75

function tischBreite(typ) { return typ === 'doppel' ? DOPPEL_W : EINZEL_W }

export default function SitzplanView() {
  const { aktiveKlasse, schueler, aktivesFach, spalten, eintraege, aktiveSemester, fachSchuelerIds } = useStore()

  const [tische, setTische] = useState([])
  const [bearbeitungsModus, setBearbeitungsModus] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [eintragMenu, setEintragMenu] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectionRect, setSelectionRect] = useState(null) // { x, y, w, h } in canvas coords
  const [ghostTische, setGhostTische] = useState([]) // { tisch, x, y } — Vorschau beim Strg+Drag

  const dragRef = useRef(null)
  const canvasRef = useRef(null)
  const tischeRef = useRef(tische)
  useEffect(() => { tischeRef.current = tische }, [tische])

  const ladeTische = useCallback(async () => {
    if (!aktivesFach) return
    const data = await window.api.sitzplan.getTische(aktivesFach.id)
    setTische(data)
  }, [aktivesFach?.id])

  useEffect(() => {
    setTische([])
    setSelectedIds(new Set())
    setGhostTische([])
    ladeTische()
  }, [ladeTische])

  // Kontextmenü schließen bei Klick außerhalb
  useEffect(() => {
    if (!contextMenu && !eintragMenu) return
    const handler = () => { setContextMenu(null); setEintragMenu(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu, eintragMenu])

  // ─── Drag: Tisch bewegen / duplizieren ──────────────────────────────────────
  const onTischMouseDown = (e, tisch) => {
    if (!bearbeitungsModus) return
    e.preventDefault()
    e.stopPropagation()

    // Selektion aktualisieren
    const isCtrl = e.ctrlKey
    let newSel
    if (selectedIds.has(tisch.id)) {
      newSel = selectedIds
    } else {
      newSel = new Set([tisch.id])
      setSelectedIds(newSel)
    }

    const cur = tischeRef.current
    const selected = cur.filter(t => newSel.has(t.id))

    dragRef.current = {
      type: 'move',
      isCtrl,
      startX: e.clientX,
      startY: e.clientY,
      tische: selected.map(t => ({ id: t.id, origX: t.x, origY: t.y, tischObj: t })),
    }

    // Bei Strg: sofort Ghost-Kopien an Originalposition zeigen
    if (isCtrl) {
      setGhostTische(selected.map(t => ({ tisch: t, x: t.x, y: t.y })))
    }

    const onMove = (ev) => {
      if (!dragRef.current || dragRef.current.type !== 'move') return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      if (dragRef.current.isCtrl) {
        // Originale bleiben – nur Ghosts bewegen
        setGhostTische(dragRef.current.tische.map(orig => ({
          tisch: orig.tischObj,
          x: Math.max(0, orig.origX + dx),
          y: Math.max(0, orig.origY + dy),
        })))
      } else {
        setTische(prev => prev.map(t => {
          const orig = dragRef.current.tische.find(dt => dt.id === t.id)
          if (!orig) return t
          return { ...t, x: Math.max(0, orig.origX + dx), y: Math.max(0, orig.origY + dy) }
        }))
      }
    }

    const onUp = async (ev) => {
      if (!dragRef.current || dragRef.current.type !== 'move') return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const { isCtrl: ctrl, tische: origTische } = dragRef.current
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (ctrl) {
        setGhostTische([])
        for (const orig of origTische) {
          const nx = Math.max(0, orig.origX + dx)
          const ny = Math.max(0, orig.origY + dy)
          await window.api.sitzplan.duplicateTisch(aktivesFach.id, orig.id, nx, ny)
        }
        await ladeTische()
      } else {
        for (const orig of origTische) {
          const nx = Math.max(0, orig.origX + dx)
          const ny = Math.max(0, orig.origY + dy)
          await window.api.sitzplan.moveTisch(orig.id, nx, ny)
        }
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Rubber-band Selektion auf Canvas ───────────────────────────────────────
  const onCanvasMouseDown = (e) => {
    if (!bearbeitungsModus) return
    // Nur Linksklick auf Canvas-Hintergrund (nicht auf Tisch)
    if (e.target !== canvasRef.current && !e.target.closest('[data-canvas-bg]')) {
      // Klick auf Tisch – wird dort behandelt
      return
    }
    e.preventDefault()
    setSelectedIds(new Set())

    const canvasEl = canvasRef.current
    const rect = canvasEl.getBoundingClientRect()
    const startCanvasX = e.clientX - rect.left + canvasEl.scrollLeft
    const startCanvasY = e.clientY - rect.top + canvasEl.scrollTop

    dragRef.current = {
      type: 'rubberband',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCanvasX,
      startCanvasY,
      canvasRect: rect,
    }

    const onMove = (ev) => {
      if (!dragRef.current || dragRef.current.type !== 'rubberband') return
      const cur = dragRef.current
      const canvasEl2 = canvasRef.current
      const curX = ev.clientX - cur.canvasRect.left + canvasEl2.scrollLeft
      const curY = ev.clientY - cur.canvasRect.top + canvasEl2.scrollTop
      setSelectionRect({
        x: Math.min(cur.startCanvasX, curX),
        y: Math.min(cur.startCanvasY, curY),
        w: Math.abs(curX - cur.startCanvasX),
        h: Math.abs(curY - cur.startCanvasY),
      })
    }

    const onUp = (ev) => {
      if (!dragRef.current || dragRef.current.type !== 'rubberband') return
      const cur = dragRef.current
      const canvasEl2 = canvasRef.current
      const curX = ev.clientX - cur.canvasRect.left + canvasEl2.scrollLeft
      const curY = ev.clientY - cur.canvasRect.top + canvasEl2.scrollTop
      const selX = Math.min(cur.startCanvasX, curX)
      const selY = Math.min(cur.startCanvasY, curY)
      const selW = Math.abs(curX - cur.startCanvasX)
      const selH = Math.abs(curY - cur.startCanvasY)

      if (selW > 5 || selH > 5) {
        const newSel = new Set()
        tischeRef.current.forEach(t => {
          const tw = tischBreite(t.typ)
          if (t.x < selX + selW && t.x + tw > selX && t.y < selY + selH && t.y + EINZEL_H > selY) {
            newSel.add(t.id)
          }
        })
        setSelectedIds(newSel)
      }

      setSelectionRect(null)
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Tisch hinzufügen ──────────────────────────────────────────────────────
  const handleAddTisch = async (typ) => {
    if (!aktivesFach) return
    const canvas = canvasRef.current
    const rect = canvas ? canvas.getBoundingClientRect() : { width: 800, height: 500 }
    const x = rect.width / 2 - tischBreite(typ) / 2 + canvas.scrollLeft
    const y = rect.height / 2 - EINZEL_H / 2 + canvas.scrollTop
    await window.api.sitzplan.createTisch(aktivesFach.id, typ, x, y)
    await ladeTische()
  }

  // ─── Tisch löschen ─────────────────────────────────────────────────────────
  const handleDeleteTisch = async (tischId) => {
    await window.api.sitzplan.deleteTisch(tischId)
    setTische(prev => prev.filter(t => t.id !== tischId))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(tischId); return n })
  }

  // ─── Sitz-Kontextmenü ──────────────────────────────────────────────────────
  const handleSitzRechtsklick = (e, sitz) => {
    if (bearbeitungsModus) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, sitz })
  }

  const handleAssign = async (sitz, schuelerId) => {
    setContextMenu(null)
    await window.api.sitzplan.assignSchueler(sitz.id, schuelerId)
    await ladeTische()
  }

  // ─── Sitz-Klick (Eintrag) ──────────────────────────────────────────────────
  const handleSitzKlick = (e, sitz) => {
    if (bearbeitungsModus) return
    if (!sitz.schueler_id) return
    e.stopPropagation()
    setEintragMenu({ x: e.clientX, y: e.clientY, schueler_id: sitz.schueler_id })
  }

  const heute = new Date().toISOString().split('T')[0]

  const handleSitzEintrag = async (kategorie, wert) => {
    const { aktivesFach: fach, spalten: freshSpalten, aktiveSemester: sem, ladeFachDaten } = useStore.getState()
    if (!fach) return
    const schuelerId = eintragMenu.schueler_id
    const existing = freshSpalten.find(s => s.datum === heute && s.semester === sem && s.kategorie === kategorie)
    const spalteId = existing
      ? existing.id
      : await window.api.spalten.create({ fachId: fach.id, semester: sem, kategorie, kuerzel: kategorie, datum: heute })
    await window.api.eintraege.set(spalteId, schuelerId, wert)
    await ladeFachDaten(fach.id)
  }

  const getHeutigerWert = (kategorie, schuelerId) => {
    const s = spalten.find(sp => sp.datum === heute && sp.semester === aktiveSemester && sp.kategorie === kategorie)
    return s ? (eintraege[`${s.id}_${schuelerId}`] ?? '') : ''
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────
  if (!aktiveKlasse) return (
    <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Keine Klasse ausgewählt</div>
  )
  if (!aktivesFach) return (
    <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Bitte Fach auswählen</div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-ink-900 border-b border-paper-100 dark:border-ink-800">
        <button
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            bearbeitungsModus
              ? 'bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-300'
              : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-900 dark:hover:text-paper-200 hover:bg-paper-100 dark:hover:bg-ink-800'
          }`}
          onClick={() => { setBearbeitungsModus(v => !v); setSelectedIds(new Set()) }}
        >
          {bearbeitungsModus ? '✓ Bearbeiten' : 'Bearbeiten'}
        </button>
        {bearbeitungsModus && (
          <>
            <div className="w-px h-5 bg-paper-200 dark:bg-ink-700" />
            <button className="btn-secondary text-xs" onClick={() => handleAddTisch('einzel')}>+ Einzeltisch</button>
            <button className="btn-secondary text-xs" onClick={() => handleAddTisch('doppel')}>+ Doppeltisch</button>
            <span className="text-xs text-ink-400">
              Ziehen = verschieben · Strg+Ziehen = duplizieren · Ziehen auf leerem Bereich = Gruppe markieren
            </span>
            {selectedIds.size > 1 && (
              <span className="text-xs font-medium text-coral-600 dark:text-coral-400">
                {selectedIds.size} Tische ausgewählt
              </span>
            )}
          </>
        )}
        {!bearbeitungsModus && tische.length > 0 && (
          <span className="text-xs text-ink-400">Rechtsklick → Schüler:in · Klick → Eintrag</span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        data-canvas-bg="1"
        className="flex-1 relative overflow-auto bg-paper-50 dark:bg-ink-950"
        style={{ backgroundImage: 'radial-gradient(circle, #d4d4d8 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onClick={() => { setContextMenu(null); setEintragMenu(null); if (bearbeitungsModus) setSelectedIds(new Set()) }}
        onMouseDown={onCanvasMouseDown}
      >
        {tische.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-400 text-sm pointer-events-none">
            Noch keine Tische. Klicke auf „+ Einzeltisch" oder „+ Doppeltisch".
          </div>
        )}

        {tische.map(tisch => (
          <Tisch
            key={tisch.id}
            tisch={tisch}
            bearbeitungsModus={bearbeitungsModus}
            selected={selectedIds.has(tisch.id)}
            onMouseDown={onTischMouseDown}
            onDelete={handleDeleteTisch}
            onSitzRechtsklick={handleSitzRechtsklick}
            onSitzKlick={handleSitzKlick}
          />
        ))}

        {/* Ghost-Tische beim Strg+Drag */}
        {ghostTische.map((g, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{ left: g.x, top: g.y, width: tischBreite(g.tisch.typ), height: EINZEL_H, opacity: 0.65 }}
          >
            <div className="absolute inset-0 rounded-xl border-2 border-dashed border-coral-500 bg-coral-100 dark:bg-coral-900/60" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 px-2">
              {g.tisch.sitze.map(sitz => (
                <div
                  key={sitz.id}
                  className="flex flex-col items-center justify-center rounded-lg border border-dashed border-coral-400 bg-coral-50/60 dark:bg-coral-900/30"
                  style={{ width: SITZ_W, height: 56 }}
                >
                  <span className="text-[10px] text-coral-300 dark:text-coral-600">frei</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Rubber-band Auswahlrechteck */}
        {selectionRect && (
          <div
            className="absolute pointer-events-none border-2 border-coral-500 bg-coral-500/10 rounded"
            style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h }}
          />
        )}
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
            <div className="context-menu-item text-ink-400" onClick={() => handleAssign(contextMenu.sitz, null)}>
              — Kein Schüler:in —
            </div>
            {schueler.filter(s => fachSchuelerIds.has(s.id)).map(s => (
              <div
                key={s.id}
                className={`context-menu-item ${contextMenu.sitz.schueler_id === s.id ? 'font-semibold text-coral-600 dark:text-coral-400' : ''}`}
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
            className="absolute z-50 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-xl shadow-xl p-3 min-w-[200px]"
            style={{ left: eintragMenu.x, top: eintragMenu.y, position: 'fixed' }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const s = schueler.find(s => s.id === eintragMenu.schueler_id)
              return <p className="text-xs font-semibold text-ink-700 dark:text-paper-300 mb-2">{s?.nachname} {s?.vorname}</p>
            })()}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500 dark:text-ink-400 w-6">MA</span>
                {['+', '-'].map(wert => {
                  const aktiv = getHeutigerWert('MA', eintragMenu.schueler_id) === wert
                  return (
                    <button
                      key={wert}
                      className={`w-8 h-8 rounded font-bold text-sm transition-colors
                        ${aktiv
                          ? wert === '+' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-paper-100 dark:bg-ink-700 text-ink-500 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-600'}`}
                      onClick={() => handleSitzEintrag('MA', wert)}
                    >{wert}</button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500 dark:text-ink-400 w-6">HÜ</span>
                {[['✓', 'green'], ['✗', 'red']].map(([wert, farbe]) => {
                  const aktiv = getHeutigerWert('HÜ', eintragMenu.schueler_id) === wert
                  return (
                    <button
                      key={wert}
                      className={`w-8 h-8 rounded font-bold text-sm transition-colors
                        ${aktiv
                          ? farbe === 'green' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-paper-100 dark:bg-ink-700 text-ink-500 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-600'}`}
                      onClick={() => handleSitzEintrag('HÜ', wert)}
                    >{wert}</button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Tisch({ tisch, bearbeitungsModus, selected, onMouseDown, onDelete, onSitzRechtsklick, onSitzKlick }) {
  const w = tischBreite(tisch.typ)

  return (
    <div
      className={`absolute select-none ${bearbeitungsModus ? 'cursor-move' : ''}`}
      style={{ left: tisch.x, top: tisch.y, width: w, height: EINZEL_H }}
      onMouseDown={e => onMouseDown(e, tisch)}
    >
      <div
        className={`absolute inset-0 rounded-xl border-2 transition-colors
          ${selected
            ? 'border-coral-500 dark:border-coral-400 bg-coral-50 dark:bg-coral-900/60 ring-2 ring-coral-400/40'
            : bearbeitungsModus
            ? 'border-coral-300 dark:border-coral-600 bg-coral-50 dark:bg-coral-900/40'
            : 'border-paper-300 dark:border-ink-600 bg-white dark:bg-ink-800'}`}
      />

      {bearbeitungsModus && (
        <button
          className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 shadow-sm"
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(tisch.id) }}
        >✕</button>
      )}

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

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border transition-all text-center overflow-hidden px-1
        ${belegt
          ? bearbeitungsModus
            ? 'border-ink-400 dark:border-ink-500 bg-paper-100 dark:bg-ink-700 text-ink-700 dark:text-paper-200'
            : 'border-ink-400 dark:border-ink-500 bg-paper-100 dark:bg-ink-700 text-ink-700 dark:text-paper-200 cursor-pointer hover:bg-paper-200 dark:hover:bg-ink-600'
          : 'border-dashed border-paper-300 dark:border-ink-600 text-ink-600 dark:text-paper-300 dark:text-ink-600 cursor-context-menu'
        }`}
      style={{ width: SITZ_W, height: 56 }}
      title={belegt ? `${sitz.nachname} ${sitz.vorname}` : 'Leer – Rechtsklick zum Zuweisen'}
      onContextMenu={e => onRechtsklick(e, sitz)}
      onClick={e => onKlick(e, sitz)}
    >
      {belegt ? (
        <>
          <SchuelerAvatar schueler={sitz} size={22} className="mb-0.5" />
          <span className="text-[9px] font-semibold leading-tight truncate w-full text-center">{sitz.nachname}</span>
          <span className="text-[9px] leading-tight truncate w-full text-center opacity-80">{sitz.vorname}</span>
        </>
      ) : (
        <span className="text-[10px] font-normal text-ink-600 dark:text-paper-300 dark:text-ink-600">frei</span>
      )}
    </div>
  )
}

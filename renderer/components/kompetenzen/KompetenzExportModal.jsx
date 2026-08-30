// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Auswahl-Dialog vor dem PDF-Export: welche Kompetenz-Erhebungen (je Fach) sollen als Netzdiagramm
// in die PDF integriert werden? Default: alle. Baut beim Bestätigen die fertigen Radar-SVGs und gibt
// die nach Fach gruppierte Nutzlast an onConfirm zurück (leeres Objekt = keine Diagramme).
import React, { useState } from 'react'
import { baueRadarSvg } from './radarSvg'

const fmtDatum = (s) => { if (!s) return ''; const [y, m, d] = String(s).split('-'); return d ? `${d}.${m}.${y}` : s }

export default function KompetenzExportModal({ faecherDaten, onCancel, onConfirm }) {
  // faecherDaten: [{ fachId, fachName, niveaustufen, achsen, erhebungen:[{id,datum,titel,schulstufe,schulzweig,werte}] }]
  const [sel, setSel] = useState(() => {
    const s = {}
    for (const f of faecherDaten) s[f.fachId] = new Set(f.erhebungen.map(e => e.id))
    return s
  })

  const toggle = (fid, eid) => setSel(prev => {
    const next = { ...prev, [fid]: new Set(prev[fid]) }
    if (next[fid].has(eid)) next[fid].delete(eid); else next[fid].add(eid)
    return next
  })
  const setFach = (fid, alle) => setSel(prev => ({
    ...prev,
    [fid]: alle ? new Set(faecherDaten.find(f => f.fachId === fid).erhebungen.map(e => e.id)) : new Set(),
  }))
  const setAlle = (alle) => setSel(() => {
    const s = {}
    for (const f of faecherDaten) s[f.fachId] = alle ? new Set(f.erhebungen.map(e => e.id)) : new Set()
    return s
  })
  const gesamt = Object.values(sel).reduce((a, s) => a + s.size, 0)

  const bestaetigen = () => {
    const kompetenzen = {}
    for (const f of faecherDaten) {
      const ids = sel[f.fachId] ?? new Set()
      const gewaehlt = f.erhebungen.filter(e => ids.has(e.id))
      if (!gewaehlt.length) continue
      kompetenzen[f.fachId] = {
        fachName: f.fachName,
        achsen: f.achsen,
        niveaustufen: f.niveaustufen,
        erhebungen: gewaehlt.map(e => ({
          datum: e.datum, titel: e.titel, schulstufe: e.schulstufe, schulzweig: e.schulzweig,
          svg: baueRadarSvg({ erhebung: e, achsen: f.achsen, niveaustufen: f.niveaustufen }),
        })),
      }
    }
    onConfirm(kompetenzen)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-box max-w-lg w-[92vw] flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Kompetenz-Diagramme im PDF</h2>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-600 text-sm">✕</button>
        </div>
        <p className="text-xs text-ink-500 dark:text-ink-400 mb-3">
          Wähle, welche Erhebungen als Netzdiagramm in den PDF-Export aufgenommen werden. Ohne Auswahl wird das Profil ohne Kompetenz-Diagramme exportiert.
        </p>

        <div className="flex gap-2 mb-2">
          <button onClick={() => setAlle(true)} className="text-xs font-medium text-coral-700 dark:text-coral-300 hover:underline">Alle auswählen</button>
          <span className="text-ink-300">·</span>
          <button onClick={() => setAlle(false)} className="text-xs font-medium text-ink-500 hover:underline">Alle abwählen</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
          {faecherDaten.map(f => {
            const ids = sel[f.fachId] ?? new Set()
            return (
              <div key={f.fachId} className="border border-paper-200 dark:border-ink-800 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-ink-800 dark:text-paper-100">{f.fachName}</span>
                  <span className="flex items-center gap-2 text-[11px]">
                    <button onClick={() => setFach(f.fachId, true)} className="text-coral-600 dark:text-coral-400 hover:underline">alle</button>
                    <button onClick={() => setFach(f.fachId, false)} className="text-ink-400 hover:underline">keine</button>
                  </span>
                </div>
                <div className="space-y-1">
                  {f.erhebungen.map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-xs text-ink-700 dark:text-paper-200 cursor-pointer py-0.5">
                      <input type="checkbox" checked={ids.has(e.id)} onChange={() => toggle(f.fachId, e.id)}
                        className="accent-coral-500 w-3.5 h-3.5" />
                      <span>
                        {fmtDatum(e.datum)}{e.titel ? ` · ${e.titel}` : ''}
                        <span className="text-ink-400"> · {e.schulstufe}. Stufe{e.schulzweig ? (e.schulzweig === 'ms' ? ' · Standard (MS)' : ' · Standard AHS') : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 pt-4 mt-2 border-t border-paper-100 dark:border-ink-800">
          <button className="btn-secondary flex-1" onClick={onCancel}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={bestaetigen}>
            PDF exportieren{gesamt > 0 ? ` (${gesamt} Diagramm${gesamt === 1 ? '' : 'e'})` : ' (ohne Diagramme)'}
          </button>
        </div>
      </div>
    </div>
  )
}

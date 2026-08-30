// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kompetenzen-Sektion im Leistungsprofil (pro Fach). Zeigt das Netzdiagramm der Erhebungen und
// startet den Kompetenzen-Assistenten. Lädt die eigenen Daten (Muster: kv/SchuelerKVSection).
// Erscheint nur für Fächer mit hinterlegtem Raster (aktuell Deutsch).
import React, { useEffect, useState } from 'react'
import KompetenzRadar from './KompetenzRadar'
import KompetenzAssistent from './KompetenzAssistent'

function formatDatum(s) {
  if (!s) return ''
  const [y, m, d] = String(s).split('-')
  return d ? `${d}.${m}.${y}` : s
}

export default function KompetenzSection({ schueler, fach }) {
  const [hatRaster, setHatRaster] = useState(null)
  const [profil, setProfil] = useState(null)
  const [schulstufen, setSchulstufen] = useState([])
  const [niveaustufen, setNiveaustufen] = useState([])
  const [wizard, setWizard] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bestaetigeId, setBestaetigeId] = useState(null)

  // Profil + (bei vorhandenen Erhebungen) die Niveaustufen-Bezeichnungen der fixierten Schulstufe laden.
  const laden = async () => {
    const p = await window.api.kompetenzErhebungen.getProfil(schueler.id, fach.id)
    if (p.erhebungen?.length && p.letzteSchulstufe) {
      const r = await window.api.kompetenzKatalog.getRaster(fach.name, p.letzteSchulstufe)
      setNiveaustufen(r?.niveaustufen ?? [])
    }
    setProfil(p)
  }

  useEffect(() => {
    let abbruch = false
    setLoading(true); setProfil(null); setHatRaster(null); setBestaetigeId(null); setNiveaustufen([])
    ;(async () => {
      const has = await window.api.kompetenzKatalog.hatRaster(fach.name)
      if (abbruch) return
      setHatRaster(has)
      if (!has) { setLoading(false); return }
      const stufen = await window.api.kompetenzKatalog.listSchulstufen(fach.name)
      const p = await window.api.kompetenzErhebungen.getProfil(schueler.id, fach.id)
      let ns = []
      if (p.erhebungen?.length && p.letzteSchulstufe) {
        const r = await window.api.kompetenzKatalog.getRaster(fach.name, p.letzteSchulstufe)
        ns = r?.niveaustufen ?? []
      }
      if (abbruch) return
      setSchulstufen(stufen); setProfil(p); setNiveaustufen(ns); setLoading(false)
    })()
    return () => { abbruch = true }
  }, [fach.id, fach.name, schueler.id])

  if (hatRaster === false) return null
  if (loading || !profil) return null

  const erhebungen = profil.erhebungen ?? []
  const gesperrteSchulstufe = erhebungen.length ? profil.letzteSchulstufe : null

  const loeschen = async (id) => {
    setBestaetigeId(null)
    await window.api.kompetenzErhebungen.delete(id)
    await laden()
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Kompetenzen</p>
        <button className="text-xs font-medium text-coral-600 dark:text-coral-400 hover:underline" onClick={() => setWizard(true)}>
          + Assistent starten
        </button>
      </div>

      <KompetenzRadar erhebungen={erhebungen} niveaustufen={niveaustufen} />

      {erhebungen.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {erhebungen.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800/60 group">
              <span className="text-ink-600 dark:text-paper-300 truncate">
                {formatDatum(e.datum)}{e.titel ? ` · ${e.titel}` : ''} <span className="text-ink-400">· {e.schulstufe}. Stufe</span>
              </span>
              {bestaetigeId === e.id ? (
                <span className="flex-shrink-0 flex items-center gap-2">
                  <button onClick={() => loeschen(e.id)} className="text-red-500 hover:text-red-600 font-medium">Löschen</button>
                  <button onClick={() => setBestaetigeId(null)} className="text-ink-400 hover:text-ink-600">Abbr.</button>
                </span>
              ) : (
                <button onClick={() => setBestaetigeId(e.id)} className="flex-shrink-0 text-ink-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Erhebung löschen">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {wizard && (
        <KompetenzAssistent
          schueler={schueler}
          fach={fach}
          letzteSchulstufe={profil.letzteSchulstufe}
          gesperrteSchulstufe={gesperrteSchulstufe}
          letzteSchulzweig={profil.letzteSchulzweig}
          gesperrterSchulzweig={erhebungen.length ? profil.letzteSchulzweig : null}
          schulstufen={schulstufen}
          onClose={() => setWizard(false)}
          onSaved={laden}
        />
      )}
    </section>
  )
}

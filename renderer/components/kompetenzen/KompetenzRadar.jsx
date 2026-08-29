// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Netzdiagramm (Radar) der Kompetenz-Niveaus. Achsen = Kompetenzbereiche (aus den Erhebungsdaten abgeleitet),
// Wert = Ø der Teilkompetenz-Niveaus des Bereichs. Zeitstrahl-Schieber über die Erhebungen; Polygon-Übergang
// animiert (requestAnimationFrame – eine CSS-transition auf points interpoliert der Browser nicht). Darunter eine
// ausklappbare Detailliste (je Bereich seine Teilkompetenzen mit Niveau). Reines Inline-SVG im Stil von NotenChart.
import React, { useEffect, useRef, useState } from 'react'

function formatDatum(s) {
  if (!s) return ''
  const [y, m, d] = String(s).split('-')
  return d ? `${d}.${m}.${y}` : s
}

const kurz = (s, n = 16) => {
  const t = String(s ?? '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

const FARBE = '#fb6936' // coral (SA-Farbe im NotenChart)

export default function KompetenzRadar({ erhebungen, niveaustufen = [] }) {
  // Achsen aus den Daten ableiten: distinct (bereich_idx, bereich_name), nach bereich_idx sortiert.
  const axisMap = new Map()
  erhebungen.forEach(e => (e.werte ?? []).forEach(w => { if (!axisMap.has(w.bereich_idx)) axisMap.set(w.bereich_idx, w.bereich_name) }))
  const achsen = [...axisMap.entries()].sort((a, b) => a[0] - b[0]).map(([idx, name]) => ({ idx, name }))
  const N = achsen.length

  const avg = (e, bereichIdx) => {
    const ws = (e?.werte ?? []).filter(w => w.bereich_idx === bereichIdx)
    return ws.length ? ws.reduce((s, w) => s + w.niveau, 0) / ws.length : 0
  }
  const zielFor = (i) => achsen.map(a => avg(erhebungen[i], a.idx))

  const [idx, setIdx] = useState(Math.max(0, erhebungen.length - 1))
  const [anim, setAnim] = useState(() => zielFor(Math.max(0, erhebungen.length - 1)))
  const [detailOffen, setDetailOffen] = useState(false)
  const animRef = useRef(anim)
  animRef.current = anim
  const rafRef = useRef(null)

  // Bei geänderter Erhebungszahl auf die neueste springen.
  useEffect(() => { setIdx(Math.max(0, erhebungen.length - 1)) }, [erhebungen.length])

  const ziel = erhebungen[idx] ? zielFor(idx) : achsen.map(() => 0)
  const zielKey = ziel.map(v => v.toFixed(3)).join(',')
  useEffect(() => {
    // Startwerte auf Achsenlänge bringen (behebt Leer-Bug, wenn Daten erst nach dem Mount eintreffen).
    const start = animRef.current.length === ziel.length ? animRef.current : ziel.map(() => 0)
    const t0 = performance.now()
    const dauer = 320
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dauer)
      const e = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setAnim(start.map((s, i) => s + (ziel[i] - s) * e))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [zielKey])

  if (!erhebungen.length || !N) {
    return (
      <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-6 text-center">
        <p className="text-sm text-ink-500 dark:text-ink-400">Noch keine Erhebung – starte den Assistenten.</p>
      </div>
    )
  }

  const niveauLabel = (n) => {
    if (n === 0) return 'noch nicht erfasst'
    const ns = niveaustufen.find(x => x.niveau === n)
    return ns ? ns.bezeichnung : `Niveau ${n}`
  }

  const W = 400, H = 320, cx = 200, cy = 150, maxR = 100
  const winkel = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N
  const punkt = (niveau, i, r = null) => {
    const rr = r ?? (Math.max(0, Math.min(3, niveau)) / 3) * maxR
    const a = winkel(i)
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  }
  const polyPunkte = (vals) => vals.map((v, i) => punkt(v, i).map(z => z.toFixed(1)).join(',')).join(' ')
  const ringPunkte = (level) => achsen.map((_, i) => punkt(0, i, (level / 3) * maxR).map(z => z.toFixed(1)).join(',')).join(' ')

  const aktuelle = erhebungen[idx]

  return (
    <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {[1, 2, 3].map(level => (
          <polygon key={level} points={ringPunkte(level)} fill="none" stroke="#cfc9c2" strokeWidth={level === 3 ? 1 : 0.5} strokeOpacity={0.7} />
        ))}
        {achsen.map((a, i) => {
          const [ex, ey] = punkt(0, i, maxR)
          const [lx, ly] = punkt(0, i, maxR + 12)
          const c = Math.cos(winkel(i))
          const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'
          return (
            <g key={a.idx}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#cfc9c2" strokeWidth={0.5} strokeOpacity={0.7} />
              <text x={lx} y={ly} textAnchor={anchor} fontSize={9} fill="#8a8178" dominantBaseline="middle">
                <title>{a.name}</title>{kurz(a.name)}
              </text>
            </g>
          )
        })}
        {[1, 2, 3].map(level => (
          <text key={level} x={cx + 4} y={cy - (level / 3) * maxR + 3} fontSize={8} fill="#a59c91">{level}</text>
        ))}
        <polygon points={polyPunkte(anim)} fill="rgba(251,105,54,0.18)" stroke={FARBE} strokeWidth={2} strokeLinejoin="round" />
        {anim.map((v, i) => {
          const [x, y] = punkt(v, i)
          const echt = avg(aktuelle, achsen[i].idx)
          return (
            <g key={achsen[i].idx}>
              <title>{`${achsen[i].name} · Ø ${echt.toFixed(1)}`}</title>
              <circle cx={x} cy={y} r={3.5} fill={FARBE} stroke="white" strokeWidth={1.2} />
            </g>
          )
        })}
      </svg>

      {/* Zeitstrahl */}
      <div className="px-1 pt-1">
        <div className="text-center text-xs text-ink-600 dark:text-paper-300 mb-1">
          <span className="font-semibold">{formatDatum(aktuelle?.datum)}</span>
          {aktuelle?.titel ? ` · ${aktuelle.titel}` : ''}
          <span className="text-ink-400"> · {idx + 1}/{erhebungen.length}{aktuelle?.schulstufe ? ` · ${aktuelle.schulstufe}. Schulstufe` : ''}</span>
        </div>
        {erhebungen.length > 1 && (
          <input type="range" min={0} max={erhebungen.length - 1} step={1} value={idx}
            onChange={e => setIdx(Number(e.target.value))} className="w-full accent-coral-500" aria-label="Erhebungszeitpunkt" />
        )}
      </div>

      {/* Detailliste (aktuelle Erhebung) */}
      <div className="mt-2 pt-2 border-t border-paper-100 dark:border-ink-800">
        <button onClick={() => setDetailOffen(o => !o)} className="text-xs font-medium text-coral-600 dark:text-coral-400 hover:underline">
          {detailOffen ? '▾ Details ausblenden' : '▸ Details anzeigen'}
        </button>
        {detailOffen && (
          <div className="mt-2 space-y-3">
            {achsen.map(a => {
              const teil = (aktuelle?.werte ?? []).filter(w => w.bereich_idx === a.idx).sort((x, y) => x.teilkompetenz_idx - y.teilkompetenz_idx)
              return (
                <div key={a.idx}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-1">{a.name} <span className="text-ink-400">· Ø {avg(aktuelle, a.idx).toFixed(1)}</span></p>
                  <div className="border border-paper-200 dark:border-ink-800 rounded-lg divide-y divide-paper-100 dark:divide-ink-800">
                    {teil.map(w => (
                      <div key={w.teilkompetenz_idx} className="flex items-start justify-between gap-2 px-2.5 py-1.5">
                        <span className="text-xs text-ink-700 dark:text-paper-200">
                          {w.teilkompetenz_name}
                          {w.notiz ? <span className="block text-[11px] text-ink-400 italic">{w.notiz}</span> : null}
                        </span>
                        <span className="text-[11px] text-ink-500 dark:text-ink-400 flex-shrink-0 text-right">
                          <span className="font-bold text-coral-600 dark:text-coral-400">{w.niveau}</span> · {niveauLabel(w.niveau)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

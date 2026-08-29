// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Netzdiagramm (Radar) der Kompetenz-Niveaus je Kompetenzbereich, mit Zeitstrahl-Schieber
// über die Erhebungen. Beim Umstellen des Schiebers wird das Polygon animiert (requestAnimationFrame;
// eine CSS-transition auf dem points-Attribut interpoliert der Browser nicht). Reines Inline-SVG,
// gleicher Stil wie NotenChart (gedämpfte Hex-Farben, in hell wie dunkel lesbar).
import React, { useEffect, useRef, useState } from 'react'

function formatDatum(s) {
  if (!s) return ''
  const [y, m, d] = String(s).split('-')
  return d ? `${d}.${m}.${y}` : s
}

const kurz = (s, n = 15) => {
  const t = String(s ?? '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

const FARBE = '#fb6936' // coral (SA-Farbe im NotenChart)

export default function KompetenzRadar({ bereiche, erhebungen }) {
  const N = bereiche.length
  const [idx, setIdx] = useState(Math.max(0, erhebungen.length - 1))
  const zielFor = (i) => bereiche.map(b => (erhebungen[i]?.werte?.[b.id]) ?? 0)
  const [anim, setAnim] = useState(() => zielFor(Math.max(0, erhebungen.length - 1)))
  const animRef = useRef(anim)
  animRef.current = anim
  const rafRef = useRef(null)

  // Bei geänderter Erhebungszahl auf die neueste springen.
  useEffect(() => {
    setIdx(Math.max(0, erhebungen.length - 1))
  }, [erhebungen.length])

  // Ziel-Werte der gewählten Erhebung; bei Änderung animiert hinüberblenden.
  const ziel = erhebungen[idx] ? zielFor(idx) : bereiche.map(() => 0)
  const zielKey = ziel.join(',')
  useEffect(() => {
    const start = animRef.current
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

  if (!N) return null
  if (!erhebungen.length) {
    return (
      <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-6 text-center">
        <p className="text-sm text-ink-500 dark:text-ink-400">Noch keine Erhebung – starte den Assistenten.</p>
      </div>
    )
  }

  const W = 400, H = 320, cx = 200, cy = 150, maxR = 100
  const winkel = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N
  const punkt = (niveau, i, r = null) => {
    const rr = r ?? (Math.max(0, Math.min(3, niveau)) / 3) * maxR
    const a = winkel(i)
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  }
  const polyPunkte = (vals) => vals.map((v, i) => punkt(v, i).map(z => z.toFixed(1)).join(',')).join(' ')
  const ringPunkte = (level) => bereiche.map((_, i) => punkt(0, i, (level / 3) * maxR).map(z => z.toFixed(1)).join(',')).join(' ')

  const aktuelle = erhebungen[idx]

  return (
    <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* Ringe (Niveau 1/2/3) */}
        {[1, 2, 3].map(level => (
          <polygon key={level} points={ringPunkte(level)} fill="none" stroke="#cfc9c2" strokeWidth={level === 3 ? 1 : 0.5} strokeOpacity={0.7} />
        ))}
        {/* Speichen + Achsenbeschriftung */}
        {bereiche.map((b, i) => {
          const [ex, ey] = punkt(0, i, maxR)
          const [lx, ly] = punkt(0, i, maxR + 12)
          const c = Math.cos(winkel(i))
          const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'
          return (
            <g key={b.id}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#cfc9c2" strokeWidth={0.5} strokeOpacity={0.7} />
              <text x={lx} y={ly} textAnchor={anchor} fontSize={9} fill="#8a8178" dominantBaseline="middle">
                <title>{b.titel}</title>{kurz(b.titel)}
              </text>
            </g>
          )
        })}
        {/* Niveau-Zahlen entlang der oberen Achse */}
        {[1, 2, 3].map(level => (
          <text key={level} x={cx + 4} y={cy - (level / 3) * maxR + 3} fontSize={8} fill="#a59c91">{level}</text>
        ))}
        {/* Daten-Polygon (animiert) */}
        <polygon points={polyPunkte(anim)} fill="rgba(251,105,54,0.18)" stroke={FARBE} strokeWidth={2} strokeLinejoin="round" />
        {anim.map((v, i) => {
          const [x, y] = punkt(v, i)
          const echt = aktuelle?.werte?.[bereiche[i].id] ?? 0
          return (
            <g key={bereiche[i].id}>
              <title>{`${bereiche[i].titel} · Niveau ${echt}`}</title>
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
          <input
            type="range"
            min={0}
            max={erhebungen.length - 1}
            step={1}
            value={idx}
            onChange={e => setIdx(Number(e.target.value))}
            className="w-full accent-coral-500"
            aria-label="Erhebungszeitpunkt"
          />
        )}
      </div>
    </div>
  )
}

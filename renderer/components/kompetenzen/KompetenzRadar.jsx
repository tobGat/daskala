// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Netzdiagramm (Radar) der Kompetenz-Niveaus. Achsen = Kompetenzbereiche (aus den Erhebungsdaten abgeleitet),
// Wert = Ø der Kann-Beschreibungs-Niveaus des Bereichs. Skala 0..maxNiveau (aus den Niveaustufen des Rasters).
// Zeitstrahl-Schieber über die Erhebungen; Polygon-Übergang animiert (requestAnimationFrame – eine CSS-transition
// auf points interpoliert der Browser nicht). Darunter eine ausklappbare Detailliste (je Bereich → Teilkompetenz
// mit Ø-Niveau). Reines Inline-SVG im Stil von NotenChart.
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

// Ampel-Farbe je Kompetenzwert. Standard (maxNiveau 1): rot → gelb → grün.
// Standard AHS / Stufe 3–5 (maxNiveau 3): 0 rot, 1 orange, 2 gelb, 3 grün (dazwischen interpoliert).
function lerpHex(a, b, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b)
  const m = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`
}
function niveauFarbe(val, maxNiveau) {
  const stops = maxNiveau <= 1 ? ['#ef4444', '#eab308', '#22c55e'] : ['#ef4444', '#f97316', '#eab308', '#22c55e']
  const max = maxNiveau <= 1 ? 1 : maxNiveau
  const pos = (Math.max(0, Math.min(max, val)) / max) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(pos))
  return lerpHex(stops[i], stops[i + 1], pos - i)
}

export default function KompetenzRadar({ erhebungen, niveaustufen = [] }) {
  // Max. Niveau je Erhebung: Standard (MS) ab Stufe 6 → 1, sonst Anzahl der Niveaustufen (3 bzw. 1).
  const zweigMax = (e) => (e?.schulzweig === 'ms' && (e?.schulstufe ?? 0) >= 6) ? 1 : (niveaustufen.length || 1)

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

  useEffect(() => { setIdx(Math.max(0, erhebungen.length - 1)) }, [erhebungen.length])

  const ziel = erhebungen[idx] ? zielFor(idx) : achsen.map(() => 0)
  const zielKey = ziel.map(v => v.toFixed(3)).join(',')
  useEffect(() => {
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

  const aktuelle = erhebungen[idx]
  const maxNiveau = zweigMax(aktuelle) // Skala richtet sich nach dem Zweig der gewählten Erhebung
  const W = 400, H = 320, cx = 200, cy = 150, maxR = 100
  const winkel = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N
  const punkt = (niveau, i, r = null) => {
    const rr = r ?? (Math.max(0, Math.min(maxNiveau, niveau)) / maxNiveau) * maxR
    const a = winkel(i)
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  }
  const polyPunkte = (vals) => vals.map((v, i) => punkt(v, i).map(z => z.toFixed(1)).join(',')).join(' ')
  const ringPunkte = (level) => achsen.map((_, i) => punkt(0, i, (level / maxNiveau) * maxR).map(z => z.toFixed(1)).join(',')).join(' ')
  // Gitter-Ringe: Standard in 0,2er-Schritten, sonst in 0,5er-Schritten.
  const ringStep = maxNiveau <= 1 ? 0.2 : 0.5
  const ringe = []
  for (let v = ringStep; v <= maxNiveau + 1e-9; v += ringStep) ringe.push(Math.round(v * 100) / 100)
  const istGanz = (v) => Math.abs(v - Math.round(v)) < 1e-9

  // Detailliste: je Bereich → Teilkompetenzen (Ø der Item-Niveaus) für die gewählte Erhebung.
  const detailBereiche = achsen.map(a => {
    const rows = (aktuelle?.werte ?? []).filter(w => w.bereich_idx === a.idx)
    const byTk = new Map()
    rows.forEach(w => {
      if (!byTk.has(w.teilkompetenz_idx)) byTk.set(w.teilkompetenz_idx, { name: w.teilkompetenz_name, sum: 0, count: 0 })
      const o = byTk.get(w.teilkompetenz_idx); o.sum += w.niveau; o.count++
    })
    const teil = [...byTk.entries()].sort((x, y) => x[0] - y[0]).map(([ti, o]) => ({ ti, name: o.name, avg: o.count ? o.sum / o.count : 0 }))
    return { ...a, avg: avg(aktuelle, a.idx), teil }
  })

  return (
    <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {ringe.map(level => (
          <polygon key={level} points={ringPunkte(level)} fill="none" stroke="#cfc9c2" strokeWidth={istGanz(level) ? 1 : 0.5} strokeOpacity={istGanz(level) ? 0.7 : 0.35} />
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
        {ringe.filter(istGanz).map(level => (
          <text key={level} x={cx + 4} y={cy - (level / maxNiveau) * maxR + 3} fontSize={8} fill="#a59c91">{level}</text>
        ))}
        <polygon points={polyPunkte(anim)} fill="rgba(148,163,184,0.15)" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" />
        {anim.map((v, i) => {
          const [x, y] = punkt(v, i)
          return (
            <g key={achsen[i].idx}>
              <title>{`${achsen[i].name} · Ø ${avg(aktuelle, achsen[i].idx).toFixed(1)}`}</title>
              <circle cx={x} cy={y} r={4} fill={niveauFarbe(v, maxNiveau)} stroke="white" strokeWidth={1.3} />
            </g>
          )
        })}
      </svg>

      {/* Niveau-Legende (Raster-Begriffe) */}
      {niveaustufen.length > 0 && (
        <p className="text-[10px] text-ink-400 text-center px-2">
          {niveaustufen.slice(0, maxNiveau).map(n => `${n.niveau} = ${n.bezeichnung}`).join(' · ')}
        </p>
      )}

      {/* Zeitstrahl */}
      <div className="px-1 pt-1">
        <div className="text-center text-xs text-ink-600 dark:text-paper-300 mb-1">
          <span className="font-semibold">{formatDatum(aktuelle?.datum)}</span>
          {aktuelle?.titel ? ` · ${aktuelle.titel}` : ''}
          <span className="text-ink-400"> · {idx + 1}/{erhebungen.length}{aktuelle?.schulstufe ? ` · ${aktuelle.schulstufe}. Schulstufe` : ''}{aktuelle?.schulzweig ? ` · ${aktuelle.schulzweig === 'ms' ? 'Standard (MS)' : 'Standard AHS'}` : ''}</span>
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
            {detailBereiche.map(b => (
              <div key={b.idx}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-1">{b.name} <span className="text-ink-400">· Ø {b.avg.toFixed(1)}</span></p>
                <div className="border border-paper-200 dark:border-ink-800 rounded-lg divide-y divide-paper-100 dark:divide-ink-800">
                  {b.teil.map(t => (
                    <div key={t.ti} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <span className="text-xs text-ink-700 dark:text-paper-200 truncate">{t.name}</span>
                      <span className="text-[11px] text-ink-500 dark:text-ink-400 flex-shrink-0">Ø <span className="font-bold text-coral-600 dark:text-coral-400">{t.avg.toFixed(1)}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

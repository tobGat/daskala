// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Statischer Radar-SVG-String (Kompetenz-Netzdiagramm) für den PDF-Export – reines JS ohne React.
// Die interaktive Variante ist KompetenzRadar.jsx (animiert, mit Zeitstrahl); sie importiert die
// Farb-Helfer (lerpHex/niveauFarbe) von hier, damit Bildschirm und PDF identisch aussehen.
// Achsen werden im PDF mit Nummern beschriftet (Legende mit den vollen Bereichsnamen baut der Aufrufer),
// damit lange Bereichsnamen (z. B. „Variablen und Funktionen") nicht aus der Zeichenfläche laufen.

// Ampel-Farbe je Kompetenzwert. Standard (maxNiveau 1): rot → gelb → grün.
// Standard AHS / drei Niveaus (maxNiveau 3): 0 rot, 1 orange, 2 gelb, 3 grün (dazwischen interpoliert).
export function lerpHex(a, b, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b)
  const m = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`
}
export function niveauFarbe(val, maxNiveau) {
  const stops = maxNiveau <= 1 ? ['#ef4444', '#eab308', '#22c55e'] : ['#ef4444', '#f97316', '#eab308', '#22c55e']
  const max = maxNiveau <= 1 ? 1 : maxNiveau
  const pos = (Math.max(0, Math.min(max, val)) / max) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(pos))
  return lerpHex(stops[i], stops[i + 1], pos - i)
}

// Max. Niveau der Skala einer Erhebung: Standard (MS) ab Stufe 6 → 1, sonst Anzahl der Niveaustufen (3 bzw. 1).
export function zweigMax(erhebung, niveaustufen) {
  return (erhebung?.schulzweig === 'ms' && (erhebung?.schulstufe ?? 0) >= 6) ? 1 : ((niveaustufen?.length) || 1)
}

function esc(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Baut den statischen Radar-SVG-String für EINE Erhebung.
// achsen: [{ idx, name }] (gemeinsame Reihenfolge über alle Erhebungen eines Fachs);
// erhebung: { werte:[{bereich_idx, niveau}], schulzweig, schulstufe }.
export function baueRadarSvg({ erhebung, achsen, niveaustufen }) {
  const N = (achsen || []).length
  if (!erhebung || !N) return ''
  const maxNiveau = zweigMax(erhebung, niveaustufen)
  const avg = (bereichIdx) => {
    const ws = (erhebung.werte || []).filter(w => w.bereich_idx === bereichIdx)
    return ws.length ? ws.reduce((s, w) => s + w.niveau, 0) / ws.length : 0
  }
  const W = 400, H = 320, cx = 200, cy = 150, maxR = 100
  const winkel = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N
  const punkt = (niveau, i, r = null) => {
    const rr = r ?? (Math.max(0, Math.min(maxNiveau, niveau)) / maxNiveau) * maxR
    const a = winkel(i)
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  }
  const vals = achsen.map(a => avg(a.idx))
  const polyPunkte = vals.map((v, i) => punkt(v, i).map(z => z.toFixed(1)).join(',')).join(' ')
  const ringPunkte = (level) => achsen.map((_, i) => punkt(0, i, (level / maxNiveau) * maxR).map(z => z.toFixed(1)).join(',')).join(' ')
  const ringStep = maxNiveau <= 1 ? 0.2 : 0.5
  const istGanz = (v) => Math.abs(v - Math.round(v)) < 1e-9
  const ringe = []
  for (let v = ringStep; v <= maxNiveau + 1e-9; v += ringStep) ringe.push(Math.round(v * 100) / 100)

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">`
  for (const level of ringe) {
    svg += `<polygon points="${ringPunkte(level)}" fill="none" stroke="#cfc9c2" stroke-width="${istGanz(level) ? 1 : 0.5}" stroke-opacity="${istGanz(level) ? 0.7 : 0.35}"/>`
  }
  achsen.forEach((a, i) => {
    const [ex, ey] = punkt(0, i, maxR)
    const [lx, ly] = punkt(0, i, maxR + 13)
    svg += `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#cfc9c2" stroke-width="0.5" stroke-opacity="0.7"/>`
    svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="#6b7280" dominant-baseline="middle">${i + 1}</text>`
  })
  ringe.filter(istGanz).forEach(level => {
    svg += `<text x="${cx + 4}" y="${(cy - (level / maxNiveau) * maxR + 3).toFixed(1)}" font-size="9" fill="#a59c91">${level}</text>`
  })
  svg += `<polygon points="${polyPunkte}" fill="rgba(148,163,184,0.18)" stroke="#94a3b8" stroke-width="2" stroke-linejoin="round"/>`
  vals.forEach((v, i) => {
    const [x, y] = punkt(v, i)
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${niveauFarbe(v, maxNiveau)}" stroke="#fff" stroke-width="1.3"/>`
  })
  svg += '</svg>'
  return svg
}

// esc wird aktuell nur intern gebraucht; Export nur, falls später benötigt.
export { esc }

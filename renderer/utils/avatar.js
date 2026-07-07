// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'

// ─── Initialen-Fallback (konsolidiert aus SchuelerDetail.jsx / NotenTabelle.jsx) ───
export const AVATAR_FARBEN = [
  '#fb6936', '#31a982', '#a98fff', '#56c39e', '#f59e0b',
  '#ec4899', '#3b82f6', '#8b66f5', '#14b8a6', '#f97316',
]

export function hashFromString(str) {
  let h = 0
  const s = str ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function avatarFarbe(schueler) {
  const key = (schueler?.vorname ?? '') + (schueler?.nachname ?? '')
  return AVATAR_FARBEN[hashFromString(key) % AVATAR_FARBEN.length]
}

export function initialen(schueler) {
  const v = (schueler?.vorname ?? '').trim()[0] ?? ''
  const n = (schueler?.nachname ?? '').trim()[0] ?? ''
  return (v + n).toUpperCase() || '?'
}

// ─── Hautfarben-Palette (Hex OHNE #) ───
export const SKIN = ['f2d3b1', 'edb98a', 'ffdbb4', 'fd9841', 'e8beac', 'd08b5b', 'a56941', '8d5524', '614335']

// ─── Haarfarben-Palette (Hex OHNE #); wird für Haare UND Augenbrauen genutzt ───
export const HAIR = ['0e0e0e', '3b2a20', '5a3825', '7a4b2e', 'a55728', 'b58143', 'd6a860', 'e6ca9c', 'a04000', 'b7b7b7', 'e8e8e8']

// ─── Merkmal-Kategorien für den Editor (Vor/Zurück-Picker) ───
export const AVATAR_CATS = ['head', 'hair', 'eyes', 'eyebrows', 'nose', 'mouth']

// Varianten je Kategorie: primär aus dem lorelei-Schema, sonst Hardcode-Fallback.
const HARDCODE = { head: 4, eyes: 24, nose: 6, eyebrows: 13, hair: 48, beard: 2, glasses: 5, earrings: 3 }
const pad = (n) => String(n).padStart(2, '0')
export function variantsOf(cat) {
  const en = lorelei?.schema?.properties?.[cat]?.items?.enum
  if (Array.isArray(en) && en.length) return en
  const c = HARDCODE[cat] ?? 0
  return Array.from({ length: c }, (_, i) => `variant${pad(i + 1)}`)
}

// ─── Gespeicherte Avatar-Options robust parsen ───
export function parseAvatarOptions(schueler) {
  if (!schueler?.avatar) return null
  try { return JSON.parse(schueler.avatar)?.options ?? null } catch { return null }
}

// ─── SVG-String erzeugen (mit Modul-Cache gegen CPU-Last) ───
const _cache = new Map()
function cacheKey(schueler, size) {
  const basis = schueler?.avatar ?? ('AUTO:' + (schueler?.vorname ?? '') + '|' + (schueler?.nachname ?? ''))
  return `${size}|${basis}`
}
export function avatarSvg(schueler, size = 64) {
  const key = cacheKey(schueler, size)
  const hit = _cache.get(key)
  if (hit !== undefined) return hit
  const opts = parseAvatarOptions(schueler)
  // Auto-aus-Name: deterministisch aus dem Namen; Haut- und Haarfarbe variieren (Haare = Augenbrauen).
  const name = `${schueler?.vorname ?? ''}${schueler?.nachname ?? ''}`
  const hc = HAIR[hashFromString('hair' + name) % HAIR.length]
  const base = opts ?? { seed: name, skinColor: SKIN, hairColor: [hc], eyebrowsColor: [hc] }
  let svg = ''
  try { svg = createAvatar(lorelei, { size, ...base }).toString() } catch { svg = '' }
  _cache.set(key, svg)
  return svg
}

// ─── Teilbarer Avatar-Code (App ⇄ Web-Editor avatar.schulapps.at) ─────────────
// Format: DSK1-hd-ha-ey-eb-no-mo-sk-hc-gl-ea-be
//   hd..mo = Varianten-Nummer (aus „variantNN"); sk/hc = Index in SKIN/HAIR;
//   gl/ea/be = Varianten-Nummer wenn aktiv, sonst 0.
// WICHTIG: App und Web müssen dieselbe lorelei-Version + dieselben Paletten nutzen.
// Format: DSK1-hd-ha-ey-eb-no-mo-sk-hc-gl-ea-be
//   hd..mo = Index in variantsOf(cat) (0-basiert); sk/hc = Index in SKIN/HAIR;
//   gl/ea/be = 0 wenn aus, sonst (Varianten-Index + 1).
// App und Web-Editor (avatar.schulapps.at) MÜSSEN dieselbe lorelei-Version nutzen.
export const CODE_PREFIX = 'DSK1'
const vidx = (cat, v) => Math.max(0, variantsOf(cat).indexOf(v))
const vat = (cat, i) => { const vs = variantsOf(cat); return vs[Math.min(vs.length - 1, Math.max(0, i))] || vs[0] }

export function optionsToCode(opts) {
  const o = opts || {}
  const parts = [
    vidx('head', o.head?.[0]), vidx('hair', o.hair?.[0]), vidx('eyes', o.eyes?.[0]),
    vidx('eyebrows', o.eyebrows?.[0]), vidx('nose', o.nose?.[0]), vidx('mouth', o.mouth?.[0]),
    Math.max(0, SKIN.indexOf(o.skinColor?.[0])),
    Math.max(0, HAIR.indexOf(o.hairColor?.[0])),
    o.glassesProbability === 100 ? vidx('glasses', o.glasses?.[0]) + 1 : 0,
    o.earringsProbability === 100 ? vidx('earrings', o.earrings?.[0]) + 1 : 0,
    o.beardProbability === 100 ? vidx('beard', o.beard?.[0]) + 1 : 0,
  ]
  return CODE_PREFIX + '-' + parts.join('-')
}

export function codeToOptions(code) {
  const t = String(code || '').trim().toUpperCase().split('-')
  if (t[0] !== CODE_PREFIX || t.length < 12) return null
  const n = t.slice(1, 12).map(x => parseInt(x, 10) || 0)
  const [hd, ha, ey, eb, no, mo, sk, hc, gl, ea, be] = n
  const hcHex = HAIR[hc] || HAIR[0]
  const o = {
    skinColor: [SKIN[sk] || SKIN[0]],
    hairColor: [hcHex], eyebrowsColor: [hcHex],
    head: [vat('head', hd)], hair: [vat('hair', ha)], eyes: [vat('eyes', ey)],
    eyebrows: [vat('eyebrows', eb)], nose: [vat('nose', no)], mouth: [vat('mouth', mo)],
    glassesProbability: gl ? 100 : 0, earringsProbability: ea ? 100 : 0, beardProbability: be ? 100 : 0,
  }
  if (gl) o.glasses = [vat('glasses', gl - 1)]
  if (ea) o.earrings = [vat('earrings', ea - 1)]
  if (be) o.beard = [vat('beard', be - 1)]
  return o
}

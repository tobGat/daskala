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
export const CODE_PREFIX = 'DSK1'
const vnum = (v) => { const m = /(\d+)/.exec(v || ''); return m ? parseInt(m[1], 10) : 1 }
function vname(cat, n) {
  const vs = variantsOf(cat)
  const name = `variant${String(n).padStart(2, '0')}`
  if (vs.includes(name)) return name
  return vs[Math.min(vs.length - 1, Math.max(0, (n || 1) - 1))] || name
}

export function optionsToCode(opts) {
  const o = opts || {}
  const parts = [
    vnum(o.head?.[0]), vnum(o.hair?.[0]), vnum(o.eyes?.[0]),
    vnum(o.eyebrows?.[0]), vnum(o.nose?.[0]), vnum(o.mouth?.[0]),
    Math.max(0, SKIN.indexOf(o.skinColor?.[0])),
    Math.max(0, HAIR.indexOf(o.hairColor?.[0])),
    o.glassesProbability === 100 ? vnum(o.glasses?.[0]) : 0,
    o.earringsProbability === 100 ? vnum(o.earrings?.[0]) : 0,
    o.beardProbability === 100 ? vnum(o.beard?.[0]) : 0,
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
    head: [vname('head', hd)], hair: [vname('hair', ha)], eyes: [vname('eyes', ey)],
    eyebrows: [vname('eyebrows', eb)], nose: [vname('nose', no)], mouth: [vname('mouth', mo)],
    glassesProbability: gl ? 100 : 0, earringsProbability: ea ? 100 : 0, beardProbability: be ? 100 : 0,
  }
  if (gl) o.glasses = [vname('glasses', gl)]
  if (ea) o.earrings = [vname('earrings', ea)]
  if (be) o.beard = [vname('beard', be)]
  return o
}

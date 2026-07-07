// Avatar-Logik – MUSS mit Daskala (renderer/utils/avatar.js) übereinstimmen,
// damit die Codes 1:1 kompatibel sind: gleiche @dicebear/lorelei-Version (9.4.2),
// gleiche Paletten (SKIN/HAIR), gleiche Varianten-Logik und derselbe Codec.
import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'

// ─── Hautfarben-Palette (Hex OHNE #) ───
export const SKIN = ['f2d3b1', 'edb98a', 'ffdbb4', 'fd9841', 'e8beac', 'd08b5b', 'a56941', '8d5524', '614335']

// ─── Haarfarben-Palette (Hex OHNE #); für Haare UND Augenbrauen ───
export const HAIR = ['0e0e0e', '3b2a20', '5a3825', '7a4b2e', 'a55728', 'b58143', 'd6a860', 'e6ca9c', 'a04000', 'b7b7b7', 'e8e8e8']

export function hashFromString(str) {
  let h = 0
  const s = str ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Varianten je Kategorie: primär aus dem lorelei-Schema, sonst Hardcode-Fallback.
const HARDCODE = { head: 4, eyes: 24, nose: 6, eyebrows: 13, hair: 48, beard: 2, glasses: 5, earrings: 3 }
const pad = (n) => String(n).padStart(2, '0')
export function variantsOf(cat) {
  const en = lorelei?.schema?.properties?.[cat]?.items?.enum
  if (Array.isArray(en) && en.length) return en
  const c = HARDCODE[cat] ?? 0
  return Array.from({ length: c }, (_, i) => `variant${pad(i + 1)}`)
}

// ─── Editor-Kategorien ───
export const MERKMALE = [
  { key: 'head', label: 'Gesichtsform' },
  { key: 'hair', label: 'Haare' },
  { key: 'eyes', label: 'Augen' },
  { key: 'eyebrows', label: 'Augenbrauen' },
  { key: 'nose', label: 'Nase' },
  { key: 'mouth', label: 'Mund' },
]
export const OPTIONAL = [
  { key: 'glasses', prob: 'glassesProbability', label: 'Brille' },
  { key: 'earrings', prob: 'earringsProbability', label: 'Ohrringe' },
  { key: 'beard', prob: 'beardProbability', label: 'Bart' },
]
const ALL_CATS = [...MERKMALE.map(m => m.key), ...OPTIONAL.map(o => o.key)]

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]

// Zufälliger, vollständig gesetzter Startzustand.
export function randomOptions() {
  const hc = rand(HAIR)
  const o = { skinColor: [rand(SKIN)], hairColor: [hc], eyebrowsColor: [hc], glassesProbability: 0, earringsProbability: 0, beardProbability: 0 }
  for (const m of MERKMALE) { const vs = variantsOf(m.key); if (vs.length) o[m.key] = [rand(vs)] }
  for (const opt of OPTIONAL) {
    o[opt.prob] = Math.random() < (opt.key === 'beard' ? 0.2 : 0.35) ? 100 : 0
    const vs = variantsOf(opt.key); if (vs.length) o[opt.key] = [rand(vs)]
  }
  return o
}

export function svgFromOptions(opts, size = 200) {
  try { return createAvatar(lorelei, { size, ...opts }).toString() } catch { return '' }
}

// ─── Teilbarer Avatar-Code (identisch zu Daskala) ───
// Format: DSK1-hd-ha-ey-eb-no-mo-sk-hc-gl-ea-be
//   hd..mo = Index in variantsOf(cat) (0-basiert)
//   sk/hc  = Index in SKIN/HAIR
//   gl/ea/be = 0 wenn aus, sonst (Varianten-Index + 1)
// Setzt voraus, dass App und Web dieselbe lorelei-Version nutzen (gleiche Reihenfolge).
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

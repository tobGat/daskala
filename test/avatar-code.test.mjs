// Tests für den Avatar-Code-Codec (renderer/utils/avatar.js).
// Schützt die 1:1-Kompatibilität mit dem Web-Editor avatar.schulapps.at:
// Ändert sich die lorelei-Reihenfolge, schlägt der „bekannter Code"-Test an.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SKIN, HAIR, variantsOf, optionsToCode, codeToOptions } from '../renderer/utils/avatar.js'

// Deterministische Options aus einem Seed bauen (ohne echten Zufall).
function buildOptions(seed) {
  const cats = ['head', 'hair', 'eyes', 'eyebrows', 'nose', 'mouth']
  const o = {
    skinColor: [SKIN[(seed * 7 + 1) % SKIN.length]],
    hairColor: [HAIR[(seed * 5 + 2) % HAIR.length]],
    eyebrowsColor: [HAIR[(seed * 5 + 2) % HAIR.length]],
    glassesProbability: seed % 2 ? 100 : 0,
    earringsProbability: seed % 4 === 0 ? 100 : 0,
    beardProbability: seed % 3 === 0 ? 100 : 0,
  }
  cats.forEach((c, i) => { const vs = variantsOf(c); o[c] = [vs[(seed * 3 + i) % vs.length]] })
  if (o.glassesProbability) { const vs = variantsOf('glasses'); o.glasses = [vs[seed % vs.length]] }
  if (o.earringsProbability) { const vs = variantsOf('earrings'); o.earrings = [vs[seed % vs.length]] }
  if (o.beardProbability) { const vs = variantsOf('beard'); o.beard = [vs[seed % vs.length]] }
  return o
}

test('encode→decode→encode ist stabil', () => {
  for (let s = 0; s < 60; s++) {
    const c1 = optionsToCode(buildOptions(s))
    const c2 = optionsToCode(codeToOptions(c1))
    assert.equal(c2, c1, `instabil bei seed ${s}: ${c1} → ${c2}`)
  }
})

test('Format: DSK1 + 11 Zahlenfelder', () => {
  assert.match(optionsToCode(buildOptions(1)), /^DSK1(-\d+){11}$/)
})

test('ungültige Codes ergeben null', () => {
  assert.equal(codeToOptions('quatsch'), null)
  assert.equal(codeToOptions('DSK1-1-2-3'), null) // zu kurz
  assert.equal(codeToOptions(''), null)
  assert.equal(codeToOptions(null), null)
})

test('bekannter Code → erwartete lorelei-Varianten (Kompatibilität)', () => {
  const o = codeToOptions('DSK1-2-5-3-4-1-2-6-3-2-0-1')
  assert.equal(o.head[0], 'variant02')
  assert.equal(o.mouth[0], 'happy03')
  assert.equal(o.skinColor[0], SKIN[6])
  assert.equal(o.hairColor[0], HAIR[3])
  assert.equal(o.eyebrowsColor[0], HAIR[3])
  assert.equal(o.glassesProbability, 100)
  assert.equal(o.earringsProbability, 0)
  assert.equal(o.beardProbability, 100)
})

test('Kleinschreibung/Whitespace werden toleriert', () => {
  const a = codeToOptions('DSK1-2-5-3-4-1-2-6-3-2-0-1')
  const b = codeToOptions('  dsk1-2-5-3-4-1-2-6-3-2-0-1  ')
  assert.deepEqual(b, a)
})

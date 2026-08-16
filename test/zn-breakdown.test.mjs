// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Tests für computeZN (renderer/utils/znBreakdown.js) – die reine Renderer-Nachbildung der
// Zeugnisnoten-Berechnung (Vorschau im ZN-Detail-Modal + Tooltip). Sichert v. a. die
// Niveau-Offset-Parität zum Kern bei UNDATIERTEN Einträgen (§ 20-Sortierung: ohne Datum gilt
// das ÄLTESTE Niveau, nicht das aktuelle). Ausführen:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeZN, gewichteterSchnitt, rangGewicht } from '../renderer/utils/znBreakdown.js'

const GEW = { SA: 0.4, T: 0.3, CUSTOM: 0.1, MA: 0.2 }
// basisIntern teilt durch die Gewichtung (z. B. 1,2/0,4) → IEEE754-Rundungsreste, daher ~vergleichen.
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

// Ein einzelnes SA-Feld mit gegebenem Datum → basisIntern (nur SA vorhanden).
function nurSA({ datum, wert = '3', istDifferenziert = false, niveauHistorie, niveauFallback = 'AHS', rezenzFaktor = 1 }) {
  const sId = 9
  return computeZN({
    spalten: [{ id: 1, kategorie: 'SA', datum, semester: 1, reihenfolge: 0 }],
    eintraege: { [`1_${sId}`]: wert },
    gewichtung: GEW,
    rezenzFaktor,
    istDifferenziert,
    niveauHistorie,
    niveauFallback,
    schuelerId: sId,
  })
}

test('Standardfach: reiner Durchschnitt (Faktor 1)', () => {
  const bd = computeZN({
    spalten: [
      { id: 1, kategorie: 'SA', datum: '2025-10-01', semester: 1, reihenfolge: 0 },
      { id: 2, kategorie: 'SA', datum: '2025-12-01', semester: 1, reihenfolge: 1 },
    ],
    eintraege: { '1_9': '4', '2_9': '2' },
    gewichtung: GEW, rezenzFaktor: 1, istDifferenziert: false, schuelerId: 9,
  })
  approx(bd.basisIntern, 3)
  assert.equal(bd.beitraege.length, 1)
  assert.equal(bd.beitraege[0].kat, 'SA')
})

test('Rezenz (§ 20): neueste Note zählt stärker (Faktor 2)', () => {
  const bd = computeZN({
    spalten: [
      { id: 1, kategorie: 'SA', datum: '2025-10-01', semester: 1, reihenfolge: 0 },
      { id: 2, kategorie: 'SA', datum: '2025-11-01', semester: 1, reihenfolge: 1 },
      { id: 3, kategorie: 'SA', datum: '2025-12-01', semester: 1, reihenfolge: 2 },
    ],
    eintraege: { '1_9': '4', '2_9': '3', '3_9': '2' },
    gewichtung: GEW, rezenzFaktor: 2, istDifferenziert: false, schuelerId: 9,
  })
  approx(bd.basisIntern, 2.7777777777777777)
})

test('Differenziert + UNDATIERT: ältestes Niveau gilt (Parität zum Kern)', () => {
  // Historie absteigend nach gueltig_ab: neu AHS, alt ST → ältestes = ST (Offset +2).
  const hist = [
    { niveau: 'AHS', gueltig_ab: '2026-02-01' },
    { niveau: 'ST', gueltig_ab: '2025-09-01' },
  ]
  const bd = nurSA({ datum: '', wert: '3', istDifferenziert: true, niveauHistorie: hist, niveauFallback: 'AHS' })
  // Ohne Datum → ältestes Niveau ST → intern 3 + 2 = 5 (NICHT 3, das wäre der alte Bug).
  approx(bd.basisIntern, 5)
  assert.equal(bd.beitraege[0].avg, 5)
})

test('Differenziert + DATIERT: Niveau zur Zeit des Datums', () => {
  const hist = [
    { niveau: 'AHS', gueltig_ab: '2026-02-01' },
    { niveau: 'ST', gueltig_ab: '2025-09-01' },
  ]
  // Datum vor dem Wechsel → ST (Offset +2): 3 + 2 = 5.
  approx(nurSA({ datum: '2025-10-01', istDifferenziert: true, niveauHistorie: hist }).basisIntern, 5)
  // Datum nach dem Wechsel → AHS (Offset 0): 3 + 0 = 3.
  approx(nurSA({ datum: '2026-03-01', istDifferenziert: true, niveauHistorie: hist }).basisIntern, 3)
})

test('computeZN: manuelle Mitarbeitsnote überschreibt den Teilnoten-Schnitt', () => {
  const spalten = [
    { id: 1, kategorie: 'SA', datum: '2025-10-01', semester: 1, reihenfolge: 0 },
    { id: 2, kategorie: 'MA', semester: 1, reihenfolge: 1, ma_stufen: 2 },
    { id: 3, kategorie: 'MA', semester: 1, reihenfolge: 2, ma_stufen: 2 },
  ]
  const eintraege = { '1_9': '2', '2_9': '+', '3_9': '-' }
  const base = { spalten, eintraege, gewichtung: GEW, rezenzFaktor: 1, istDifferenziert: false, schuelerId: 9 }
  const bdAuto = computeZN(base)
  approx(bdAuto.maBerechnet, 3)                       // Schnitt aus + (1) und − (5)
  approx(bdAuto.basisIntern, (2 * 0.4 + 3 * 0.2) / 0.6)
  const bdManuell = computeZN({ ...base, maNoteManuell: 1 })
  approx(bdManuell.basisIntern, (2 * 0.4 + 1 * 0.2) / 0.6)
  const maZeile = bdManuell.beitraege.find(b => b.kat === 'Mitarb.')
  assert.equal(maZeile.detail, 'manuell')
  approx(maZeile.avg, 1)
  assert.equal(bdManuell.hatMitarbeit, true)
})

test('computeZN: manuelle Mitarbeitsnote gilt als Mitarbeit (ohne + / −)', () => {
  const spalten = [{ id: 1, kategorie: 'SA', datum: '2025-10-01', semester: 1, reihenfolge: 0 }]
  const bd = computeZN({ spalten, eintraege: { '1_9': '2' }, gewichtung: GEW, rezenzFaktor: 1, istDifferenziert: false, schuelerId: 9, maNoteManuell: 4 })
  assert.equal(bd.hatMitarbeit, true)
  assert.equal(bd.maBerechnet, null)
  approx(bd.basisIntern, (2 * 0.4 + 4 * 0.2) / 0.6)
})

test('rangGewicht: älteste=1, neueste=faktor; m<2 oder faktor<=1 → 1', () => {
  assert.equal(rangGewicht(0, 3, 2), 1)
  assert.equal(rangGewicht(2, 3, 2), 2)
  assert.equal(rangGewicht(0, 1, 2), 1) // Einzelwert
  assert.equal(rangGewicht(1, 3, 1), 1) // Faktor 1
})

test('gewichteterSchnitt bleibt konsistent mit rangGewicht', () => {
  const werte = [
    { n: 4, datum: '2025-10-01', reihenfolge: 0 },
    { n: 3, datum: '2025-11-01', reihenfolge: 1 },
    { n: 2, datum: '2025-12-01', reihenfolge: 2 },
  ]
  assert.equal(gewichteterSchnitt(werte, 1), 3)
  assert.ok(Math.abs(gewichteterSchnitt(werte, 2) - 2.7777777) < 1e-6)
})

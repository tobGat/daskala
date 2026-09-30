// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Unit-Tests für die Kalender-Datums-Helfer. Ausführen: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDaysStr, montagDerWoche, getWochenTage, getMonatsWochen } from '../renderer/utils/datum.js'

test('addDaysStr über Monats- und Jahresgrenzen', () => {
  assert.equal(addDaysStr('2025-01-31', 1), '2025-02-01')
  assert.equal(addDaysStr('2025-12-31', 1), '2026-01-01')
  assert.equal(addDaysStr('2025-03-10', -1), '2025-03-09')
})

test('montagDerWoche liefert immer den Montag', () => {
  assert.equal(montagDerWoche('2025-01-15'), '2025-01-13') // Mi → Mo
  assert.equal(montagDerWoche('2025-01-13'), '2025-01-13') // Mo → Mo
  assert.equal(montagDerWoche('2025-01-19'), '2025-01-13') // So → Mo derselben Woche
})

test('getWochenTage: 7 Tage Mo–So', () => {
  const t = getWochenTage('2025-01-15')
  assert.equal(t.length, 7)
  assert.equal(t[0], '2025-01-13') // Mo
  assert.equal(t[6], '2025-01-19') // So
})

test('getMonatsWochen: Montag-first, deckt den Monat ab', () => {
  const w = getMonatsWochen(2025, 1) // Januar 2025, 1.1. = Mittwoch
  assert.ok(w.length >= 4 && w.length <= 6)
  assert.equal(w[0][0].datum, '2024-12-30')          // Montag vor dem 1.
  assert.equal(w[0][0].imMonat, false)
  // Der 1. Januar liegt in der ersten Zeile und ist imMonat
  const erste = w[0].find(t => t.datum === '2025-01-01')
  assert.ok(erste && erste.imMonat === true)
  // Jede Zeile hat 7 Tage
  assert.ok(w.every(zeile => zeile.length === 7))
  // Letzter Tag des Monats ist enthalten und imMonat
  const alle = w.flat()
  const letzter = alle.find(t => t.datum === '2025-01-31')
  assert.ok(letzter && letzter.imMonat === true)
})

test('getMonatsWochen: Februar 2026 (28 Tage, 1. = Sonntag)', () => {
  const w = getMonatsWochen(2026, 2)
  const alle = w.flat()
  assert.ok(alle.find(t => t.datum === '2026-02-01')?.imMonat === true)
  assert.ok(alle.find(t => t.datum === '2026-02-28')?.imMonat === true)
  // 1.2.2026 ist ein Sonntag → erste Zeile startet am 26.1.
  assert.equal(w[0][0].datum, '2026-01-26')
})

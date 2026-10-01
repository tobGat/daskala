// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Unit-Tests für den ICS-Parser (core/services/ics.js). Ausführen: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import icsMod from '../core/services/ics.js'

const { parseIcs } = icsMod

const HORIZONT = { horizonVon: '2000-01-01', horizonBis: '2100-12-31' }
const wrap = (body) => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`
const vevent = (lines) => wrap(`BEGIN:VEVENT\n${lines}\nEND:VEVENT`)

test('ganztägiger Termin (VALUE=DATE)', () => {
  const e = parseIcs(vevent('UID:a1\nSUMMARY:Wandertag\nDTSTART;VALUE=DATE:20251013\nDTEND;VALUE=DATE:20251014'), HORIZONT)
  assert.equal(e.length, 1)
  assert.equal(e[0].datum, '2025-10-13')
  assert.equal(e[0].ganztags, 1)
  assert.equal(e[0].uhrzeit, null)
  assert.equal(e[0].bisDatum, null) // Ein-Tages-Ganztags: DTEND exklusiv -> kein bisDatum
  assert.equal(e[0].titel, 'Wandertag')
})

test('mehrtägiger ganztägiger Termin (DTEND exklusiv)', () => {
  const e = parseIcs(vevent('SUMMARY:Projektwoche\nDTSTART;VALUE=DATE:20251013\nDTEND;VALUE=DATE:20251016'), HORIZONT)
  assert.equal(e[0].datum, '2025-10-13')
  assert.equal(e[0].bisDatum, '2025-10-15') // 16 minus 1
})

test('zeitgebundener Termin (floating local)', () => {
  const e = parseIcs(vevent('SUMMARY:Sprechstunde\nDTSTART:20251013T083000\nDTEND:20251013T092000'), HORIZONT)
  assert.equal(e[0].datum, '2025-10-13')
  assert.equal(e[0].uhrzeit, '08:30')
  assert.equal(e[0].bisUhrzeit, '09:20')
  assert.equal(e[0].ganztags, 0)
})

test('UTC (Z) wird nach Europe/Vienna umgerechnet – Winter (+1)', () => {
  const e = parseIcs(vevent('SUMMARY:X\nDTSTART:20250115T070000Z'), HORIZONT)
  assert.equal(e[0].datum, '2025-01-15')
  assert.equal(e[0].uhrzeit, '08:00')
})

test('UTC (Z) wird nach Europe/Vienna umgerechnet – Sommer (+2)', () => {
  const e = parseIcs(vevent('SUMMARY:X\nDTSTART:20250715T070000Z'), HORIZONT)
  assert.equal(e[0].datum, '2025-07-15')
  assert.equal(e[0].uhrzeit, '09:00')
})

test('gefaltete Zeilen werden zusammengeführt', () => {
  const e = parseIcs(vevent('SUMMARY:Ein sehr langer\n  Titel über zwei Zeilen\nDTSTART;VALUE=DATE:20251013'), HORIZONT)
  assert.equal(e[0].titel, 'Ein sehr langer Titel über zwei Zeilen')
})

test('Text-Escapes werden aufgelöst', () => {
  const e = parseIcs(vevent('SUMMARY:Test\\, mit\\; Zeichen\nDESCRIPTION:Zeile1\\nZeile2\nDTSTART;VALUE=DATE:20251013'), HORIZONT)
  assert.equal(e[0].titel, 'Test, mit; Zeichen')
  assert.equal(e[0].beschreibung, 'Zeile1\nZeile2')
})

test('RRULE WEEKLY mit COUNT', () => {
  const e = parseIcs(vevent('SUMMARY:S\nDTSTART:20250106T080000\nRRULE:FREQ=WEEKLY;COUNT=3'), HORIZONT)
  assert.deepEqual(e.map(x => x.datum), ['2025-01-06', '2025-01-13', '2025-01-20'])
  assert.ok(e.every(x => x.uhrzeit === '08:00'))
})

test('RRULE WEEKLY mit BYDAY und COUNT', () => {
  const e = parseIcs(vevent('SUMMARY:S\nDTSTART:20250106T080000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'), HORIZONT)
  assert.deepEqual(e.map(x => x.datum), ['2025-01-06', '2025-01-08', '2025-01-13', '2025-01-15'])
})

test('RRULE DAILY mit UNTIL (inklusiv)', () => {
  const e = parseIcs(vevent('SUMMARY:S\nDTSTART;VALUE=DATE:20250106\nRRULE:FREQ=DAILY;UNTIL=20250108'), HORIZONT)
  assert.deepEqual(e.map(x => x.datum), ['2025-01-06', '2025-01-07', '2025-01-08'])
})

test('EXDATE entfernt eine Instanz (COUNT zählt vor EXDATE)', () => {
  const e = parseIcs(vevent('SUMMARY:S\nDTSTART;VALUE=DATE:20250106\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;VALUE=DATE:20250107'), HORIZONT)
  assert.deepEqual(e.map(x => x.datum), ['2025-01-06', '2025-01-08'])
})

test('nicht unterstützte FREQ fällt auf Basistermin zurück', () => {
  const e = parseIcs(vevent('SUMMARY:S\nDTSTART;VALUE=DATE:20250106\nRRULE:FREQ=MONTHLY;COUNT=5'), HORIZONT)
  assert.deepEqual(e.map(x => x.datum), ['2025-01-06'])
})

test('mehrere VEVENTs', () => {
  const e = parseIcs(wrap('BEGIN:VEVENT\nSUMMARY:A\nDTSTART;VALUE=DATE:20250101\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:B\nDTSTART;VALUE=DATE:20250102\nEND:VEVENT'), HORIZONT)
  assert.equal(e.length, 2)
  assert.deepEqual(e.map(x => x.titel), ['A', 'B'])
})

test('fehlender SUMMARY -> Ersatztitel', () => {
  const e = parseIcs(vevent('DTSTART;VALUE=DATE:20250101'), HORIZONT)
  assert.equal(e[0].titel, '(Termin)')
})

test('unbrauchbare Eingabe wirft nicht und liefert []', () => {
  assert.deepEqual(parseIcs('kein ics', HORIZONT), [])
  assert.deepEqual(parseIcs('', HORIZONT), [])
  assert.deepEqual(parseIcs(null, HORIZONT), [])
})

test('endlose Serie wird durch den Horizont begrenzt', () => {
  const e = parseIcs(vevent('SUMMARY:S\nDTSTART;VALUE=DATE:20250106\nRRULE:FREQ=WEEKLY'),
    { horizonVon: '2025-01-01', horizonBis: '2025-01-31' })
  assert.deepEqual(e.map(x => x.datum), ['2025-01-06', '2025-01-13', '2025-01-20', '2025-01-27'])
})

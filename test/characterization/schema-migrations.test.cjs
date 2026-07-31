// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Regressionstest zu fix/initdb-migration-order.
//
// Auf einer FRISCHEN Datenbank (ein einziger initDB-Lauf) müssen alle per
// spalteErgaenzen nachgerüsteten Spalten vorhanden sein. Vor dem Fix liefen die
// Migrationen für `termine`/`supplierstunden` vor deren CREATE TABLE und wurden
// still verschluckt – die Spalten fehlten im ersten Sitzungslauf.
//
// Ausführen:  npm run test:core

const { test, before, after } = require('node:test')
const assert = require('node:assert')
const { createHarness } = require('../helpers/harness.cjs')
const Database = require('better-sqlite3')

// Nachgerüstete Spalten, die auf einer frischen DB vorhanden sein müssen.
const ERWARTET = {
  termine: ['stunde_id', 'bis_uhrzeit'],
  supplierstunden: ['titel', 'inhalt', 'hue_text', 'hue_frist_datum', 'link'],
  stundenplan: ['wochen_intervall', 'anker_datum'],
  todos: ['faelligkeit', 'erinnerung'],
  faecher: ['benotungssystem', 'alle_schueler'],
  klassen: ['teams_link', 'sortierung', 'ist_kv', 'ist_vorlage'],
}

let h, db
before(async () => {
  h = await createHarness()               // kein Seed → reine frische DB
  db = new Database(h.dbPath, { readonly: true })
})
after(() => { db?.close(); h?.cleanup() })

for (const [tabelle, spalten] of Object.entries(ERWARTET)) {
  test(`${tabelle}: nachgeruestete Spalten vorhanden`, () => {
    const vorhanden = new Set(db.prepare(`PRAGMA table_info(${tabelle})`).all().map((c) => c.name))
    for (const s of spalten) {
      assert.ok(vorhanden.has(s), `Spalte ${tabelle}.${s} fehlt auf frischer DB`)
    }
  })
}

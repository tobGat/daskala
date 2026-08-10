// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Portierung Phase 2.3 – "Schema als Daten".
//
// Stellt sicher, dass die deklarative `MIGRATIONS`-Baseline (für Capacitor/Tauri)
// EXAKT dasselbe Endschema erzeugt wie das imperative `applySchema` (Desktop).
// So kann keine der beiden Quellen unbemerkt driften: Ändert jemand applySchema,
// ohne MIGRATIONS nachzuziehen (oder umgekehrt), schlägt dieser Test fehl.
//
// Verglichen wird pro Tabelle die Spalten-Definition (Name, Typ, NOT NULL,
// Default, PK) und die Fremdschlüssel (als normierte Menge), außerdem global die
// Nicht-System-Indizes samt ihrer Spalten. Daten/Seeds sind bewusst NICHT Teil
// des Vergleichs – es geht rein um das Schema.
//
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema, MIGRATIONS } = require('../../core/db/schema.js')

// Frische DB über das imperative Desktop-Schema.
function dbViaApplySchema() {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  return db
}

// Frische DB über die deklarative Migrations-Baseline (wie mobil).
function dbViaMigrations() {
  const db = new Database(':memory:')
  for (const m of MIGRATIONS) db.exec(m.sql)
  return db
}

// Alle Nutzer-Tabellen (ohne SQLite-interne).
function tabellen(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((r) => r.name)
}

// Spalten einer Tabelle als { name: {type, notnull, dflt, pk} }.
function spalten(db, tabelle) {
  const out = {}
  for (const c of db.prepare(`PRAGMA table_info(${tabelle})`).all()) {
    out[c.name] = { type: c.type, notnull: c.notnull, dflt: c.dflt_value, pk: c.pk }
  }
  return out
}

// Fremdschlüssel als sortierte Menge normierter Strings (reihenfolge-unabhängig).
function fremdschluessel(db, tabelle) {
  return db.prepare(`PRAGMA foreign_key_list(${tabelle})`).all()
    .map((f) => `${f.from}->${f.table}.${f.to}:upd=${f.on_update},del=${f.on_delete}`)
    .sort()
}

// Nicht-System-Indizes global als { name: [spalten...] }.
function indizes(db) {
  const out = {}
  const namen = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((r) => r.name)
  for (const n of namen) {
    out[n] = db.prepare(`PRAGMA index_info(${n})`).all().map((c) => c.name)
  }
  return out
}

test('MIGRATIONS-Baseline erzeugt dieselben Tabellen wie applySchema', () => {
  const a = dbViaApplySchema()
  const b = dbViaMigrations()
  try {
    assert.deepStrictEqual(tabellen(b), tabellen(a))
  } finally { a.close(); b.close() }
})

test('MIGRATIONS-Baseline: Spalten & Fremdschlüssel je Tabelle identisch', () => {
  const a = dbViaApplySchema()
  const b = dbViaMigrations()
  try {
    for (const t of tabellen(a)) {
      assert.deepStrictEqual(spalten(b, t), spalten(a, t), `Spalten weichen ab: ${t}`)
      assert.deepStrictEqual(fremdschluessel(b, t), fremdschluessel(a, t), `Fremdschlüssel weichen ab: ${t}`)
    }
  } finally { a.close(); b.close() }
})

test('MIGRATIONS-Baseline: Indizes identisch', () => {
  const a = dbViaApplySchema()
  const b = dbViaMigrations()
  try {
    assert.deepStrictEqual(indizes(b), indizes(a))
  } finally { a.close(); b.close() }
})

test('MIGRATIONS ist wohlgeformt ([{version, description, sql}])', () => {
  assert.ok(Array.isArray(MIGRATIONS) && MIGRATIONS.length >= 1)
  for (const m of MIGRATIONS) {
    assert.strictEqual(typeof m.version, 'number')
    assert.strictEqual(typeof m.description, 'string')
    assert.strictEqual(typeof m.sql, 'string')
    assert.ok(m.sql.includes('CREATE TABLE'))
  }
})

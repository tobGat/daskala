// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Einstellungen (Schlüssel/Wert-Speicher).
//
// Phase-1-Pilot der Kern-Extraktion: plattformunabhängig, KEIN require('electron').
// Die Datenbank wird als Parameter übergeben (better-sqlite3-kompatible Schnittstelle
// mit prepare().get/all/run). Verhalten identisch zu den bisherigen IPC-Handlern.

function getAll(db) {
  const rows = db.prepare('SELECT * FROM einstellungen').all()
  const result = {}
  rows.forEach((r) => { result[r.schluessel] = r.wert })
  return result
}

function get(db, schluessel) {
  return db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(schluessel)?.wert ?? null
}

function set(db, schluessel, wert) {
  db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run(schluessel, wert)
  return true
}

module.exports = { getAll, get, set }

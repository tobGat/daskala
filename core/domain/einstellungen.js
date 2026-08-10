// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Einstellungen (Schlüssel/Wert-Speicher).
//
// Phase-2-Pilot: spricht ausschließlich den asynchronen DbPort an
// (core/db/connection.js) – select/selectOne/execute statt prepare().get/all/run.
// Verhalten identisch; alle Funktionen sind async.

async function getAll(db) {
  const rows = await db.select('SELECT * FROM einstellungen')
  const result = {}
  rows.forEach((r) => { result[r.schluessel] = r.wert })
  return result
}

async function get(db, schluessel) {
  const row = await db.selectOne('SELECT wert FROM einstellungen WHERE schluessel = ?', [schluessel])
  return row?.wert ?? null
}

async function set(db, schluessel, wert) {
  await db.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)', [schluessel, wert])
  return true
}

module.exports = { getAll, get, set }

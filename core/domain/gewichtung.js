// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: globale Gewichtung. Async DbPort; deps = { berechneAlleFuerSchuljahr }.

async function getAll(db) {
  return db.select('SELECT * FROM gewichtung_global')
}

async function update(db, deps, kategorie, gewichtung) {
  await db.execute('INSERT OR REPLACE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)', [kategorie, gewichtung])
  // Alle Fächer im aktiven Schuljahr neu berechnen (auch teilweise globale Gewichtungen sind betroffen)
  const aktuellesSchuljahr = await db.selectOne('SELECT id FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1')
  await deps.berechneAlleFuerSchuljahr(aktuellesSchuljahr?.id)
  return true
}

module.exports = { getAll, update }

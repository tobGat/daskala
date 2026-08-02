// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: globale Gewichtung. db injiziert; berechneAlleFuerSchuljahr wird
// als Abhängigkeit übergeben (wandert später in den Notenberechnungs-Service).
//
// TODO(portierung): noten:rechneAllesNeu gehört thematisch hierher, hängt aber an
// der Notenberechnung und wird mit services/notenberechnung.js extrahiert.

function getAll(db) {
  return db.prepare('SELECT * FROM gewichtung_global').all()
}

function update(db, deps, kategorie, gewichtung) {
  db.prepare('INSERT OR REPLACE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)').run(kategorie, gewichtung)
  // Alle Fächer im aktiven Schuljahr neu berechnen (auch teilweise globale Gewichtungen sind betroffen)
  const aktuellesSchuljahr = db.prepare('SELECT id FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
  deps.berechneAlleFuerSchuljahr(aktuellesSchuljahr?.id)
  return true
}

module.exports = { getAll, update }

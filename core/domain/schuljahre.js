// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schuljahre. Plattformunabhängig, ohne electron; db wird injiziert.

function getAll(db) {
  return db.prepare('SELECT * FROM schuljahre ORDER BY id DESC').all()
}

function create(db, bezeichnung) {
  const info = db.prepare('INSERT INTO schuljahre (bezeichnung) VALUES (?)').run(bezeichnung)
  return info.lastInsertRowid
}

module.exports = { getAll, create }

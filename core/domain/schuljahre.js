// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schuljahre. Plattformunabhängig; spricht den async DbPort an.

const { neueUuid } = require('../db/uuid')

async function getAll(db) {
  return db.select('SELECT * FROM schuljahre ORDER BY id DESC')
}

async function create(db, bezeichnung) {
  const info = await db.execute('INSERT INTO schuljahre (bezeichnung, uuid) VALUES (?, ?)', [bezeichnung, neueUuid()])
  return info.lastInsertRowid
}

module.exports = { getAll, create }

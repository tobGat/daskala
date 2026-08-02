// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: benutzerdefinierte Ferien/Feiertage. db injiziert.

function getAll(db, schuljahrId) {
  return db.prepare('SELECT * FROM custom_ferien WHERE schuljahr_id = ? ORDER BY von').all(schuljahrId)
}

function save(db, schuljahrId, ferien) {
  // ferien = [{ id?, name, von, bis }, ...] – komplett ersetzen.
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM custom_ferien WHERE schuljahr_id = ?').run(schuljahrId)
    const insert = db.prepare('INSERT INTO custom_ferien (schuljahr_id, name, von, bis) VALUES (?, ?, ?, ?)')
    for (const f of ferien) {
      if (f.name && f.von && f.bis) {
        insert.run(schuljahrId, f.name, f.von, f.bis)
      }
    }
  })
  transaction()
  return true
}

module.exports = { getAll, save }

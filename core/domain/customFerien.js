// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: benutzerdefinierte Ferien/Feiertage. Async DbPort.

async function getAll(db, schuljahrId) {
  return db.select('SELECT * FROM custom_ferien WHERE schuljahr_id = ? ORDER BY von', [schuljahrId])
}

async function save(db, schuljahrId, ferien) {
  // ferien = [{ id?, name, von, bis }, ...] – komplett ersetzen.
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM custom_ferien WHERE schuljahr_id = ?', [schuljahrId])
    for (const f of ferien) {
      if (f.name && f.von && f.bis) {
        await tx.execute('INSERT INTO custom_ferien (schuljahr_id, name, von, bis) VALUES (?, ?, ?, ?)', [schuljahrId, f.name, f.von, f.bis])
      }
    }
  })
  return true
}

module.exports = { getAll, save }

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Stunden-/Pausenzeiten. Async DbPort; deps = { logError } (saveAll).

async function getAll(db) {
  return db.select('SELECT * FROM stundenzeiten ORDER BY stunde')
}

async function update(db, id, data) {
  await db.execute('UPDATE stundenzeiten SET beginn = ?, ende = ? WHERE id = ?', [data.beginn, data.ende, id])
  return true
}

async function create(db) {
  const max = await db.selectOne('SELECT MAX(stunde) as m FROM stundenzeiten')
  const naechste = (max?.m ?? 0) + 1
  const info = await db.execute('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)', [naechste, '00:00', '00:00'])
  return info.lastInsertRowid
}

async function remove(db, id) {
  await db.execute('DELETE FROM stundenzeiten WHERE id = ?', [id])
  return true
}

// Komplette Stundenzeiten-Liste in einem Rutsch speichern.
// rows = [{ id?, beginn:'HH:MM', ende:'HH:MM' }] in Anzeigereihenfolge.
// Bestehende IDs werden per UPDATE beibehalten; entfernte Stunden inkl. abhängiger
// stundenplan-/planungs-Zeilen kaskadiert gelöscht.
async function saveAll(db, deps, rows) {
  const liste = Array.isArray(rows) ? rows : []
  await db.transaction(async (tx) => {
    const existing = (await tx.select('SELECT id FROM stundenzeiten')).map((r) => r.id)
    const keepIds = new Set(liste.filter((r) => r.id != null).map((r) => r.id))

    // Entfernte Stunden inkl. Referenzen löschen (foreign_keys = ON, stundenplan kein CASCADE)
    const entfernt = existing.filter((id) => !keepIds.has(id))
    for (const id of entfernt) {
      try { await tx.execute('DELETE FROM stunden_planung WHERE stundenplan_id IN (SELECT id FROM stundenplan WHERE stunde_id = ?)', [id]) } catch (e) { deps.logError('stundenzeiten:speichern stunden_planung', e) }
      await tx.execute('DELETE FROM stundenplan WHERE stunde_id = ?', [id]) // supplierstunden.stunde_id kaskadiert über stundenzeiten
      await tx.execute('DELETE FROM stundenzeiten WHERE id = ?', [id])      // supplierstunden ON DELETE CASCADE
    }

    // Upsert in Reihenfolge; stunde durchgehend 1..N neu vergeben
    const existingSet = new Set(existing)
    let i = 0
    for (const r of liste) {
      const nr = ++i
      if (r.id != null && existingSet.has(r.id)) {
        await tx.execute('UPDATE stundenzeiten SET stunde = ?, beginn = ?, ende = ? WHERE id = ?', [nr, r.beginn, r.ende, r.id])
      } else {
        await tx.execute('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)', [nr, r.beginn, r.ende])
      }
    }
  })
  return db.select('SELECT * FROM stundenzeiten ORDER BY stunde')
}

module.exports = { getAll, update, create, remove, saveAll }

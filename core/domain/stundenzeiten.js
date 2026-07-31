// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Stunden-/Pausenzeiten. db injiziert; deps = { logError } (saveAll).

function getAll(db) {
  return db.prepare('SELECT * FROM stundenzeiten ORDER BY stunde').all()
}

function update(db, id, data) {
  db.prepare('UPDATE stundenzeiten SET beginn = ?, ende = ? WHERE id = ?').run(data.beginn, data.ende, id)
  return true
}

function create(db) {
  const max = db.prepare('SELECT MAX(stunde) as m FROM stundenzeiten').get()
  const naechste = (max?.m ?? 0) + 1
  const info = db.prepare('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)').run(naechste, '00:00', '00:00')
  return info.lastInsertRowid
}

function remove(db, id) {
  db.prepare('DELETE FROM stundenzeiten WHERE id = ?').run(id)
  return true
}

// Komplette Stundenzeiten-Liste in einem Rutsch speichern.
// rows = [{ id?, beginn:'HH:MM', ende:'HH:MM' }] in Anzeigereihenfolge.
// Bestehende IDs werden per UPDATE beibehalten (damit stundenplan.stunde_id gültig bleibt);
// entfernte Stunden werden inkl. abhängiger stundenplan-/planungs-Zeilen kaskadiert gelöscht.
function saveAll(db, deps, rows) {
  const liste = Array.isArray(rows) ? rows : []
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM stundenzeiten').all().map((r) => r.id)
    const keepIds = new Set(liste.filter((r) => r.id != null).map((r) => r.id))

    // Entfernte Stunden inkl. Referenzen löschen (foreign_keys = ON, stundenplan kein CASCADE)
    const entfernt = existing.filter((id) => !keepIds.has(id))
    const delPlanung = db.prepare('DELETE FROM stunden_planung WHERE stundenplan_id IN (SELECT id FROM stundenplan WHERE stunde_id = ?)')
    const delPlan    = db.prepare('DELETE FROM stundenplan WHERE stunde_id = ?')
    const delZeit    = db.prepare('DELETE FROM stundenzeiten WHERE id = ?')
    for (const id of entfernt) {
      try { delPlanung.run(id) } catch (e) { deps.logError('stundenzeiten:speichern stunden_planung', e) }
      delPlan.run(id)          // supplierstunden.stunde_id kaskadiert über stundenzeiten
      delZeit.run(id)          // supplierstunden ON DELETE CASCADE
    }

    // Upsert in Reihenfolge; stunde durchgehend 1..N neu vergeben
    const upd = db.prepare('UPDATE stundenzeiten SET stunde = ?, beginn = ?, ende = ? WHERE id = ?')
    const ins = db.prepare('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)')
    const existingSet = new Set(existing)
    liste.forEach((r, i) => {
      const nr = i + 1
      if (r.id != null && existingSet.has(r.id)) {
        upd.run(nr, r.beginn, r.ende, r.id)
      } else {
        ins.run(nr, r.beginn, r.ende)
      }
    })
  })
  tx()
  return db.prepare('SELECT * FROM stundenzeiten ORDER BY stunde').all()
}

module.exports = { getAll, update, create, remove, saveAll }

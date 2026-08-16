// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schuljahre. Plattformunabhängig; spricht den async DbPort an.

const { neueUuid } = require('../db/uuid')
const klassenDomain = require('./klassen')

async function getAll(db) {
  return db.select('SELECT * FROM schuljahre ORDER BY id DESC')
}

async function create(db, bezeichnung) {
  const info = await db.execute('INSERT INTO schuljahre (bezeichnung, uuid) VALUES (?, ?)', [bezeichnung, neueUuid()])
  return info.lastInsertRowid
}

// Letztes (zuletzt archiviertes) Archiv wiederherstellen = letzten Jahreswechsel
// zurücknehmen, aber NICHTS löschen: Das Archiv wird wieder das aktuelle Schuljahr
// (Schüler:innen reaktiviert); das bisher aktuelle Jahr wandert seinerseits ins
// Archiv (Schüler:innen deaktiviert). Ein versehentlich angelegtes Jahr kann danach
// bei Bedarf über loeschen() entfernt werden.
async function letztesArchivWiederherstellen(db) {
  const archiv = await db.selectOne('SELECT * FROM schuljahre WHERE archiviert = 1 ORDER BY id DESC LIMIT 1')
  if (!archiv) return { ok: false, grund: 'kein-archiv' }
  const aktuell = await db.selectOne('SELECT * FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1')
  return db.transaction(async (tx) => {
    await tx.execute('UPDATE schuljahre SET archiviert = 0 WHERE id = ?', [archiv.id])
    await tx.execute('UPDATE schueler SET aktiv = 1 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [archiv.id])
    // Roster liest die Mitgliedschaft (klassen_schueler.aktiv) → konsistent mitziehen.
    await tx.execute('UPDATE klassen_schueler SET aktiv = 1 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [archiv.id])
    if (aktuell && aktuell.id !== archiv.id) {
      await tx.execute('UPDATE schuljahre SET archiviert = 1 WHERE id = ?', [aktuell.id])
      await tx.execute('UPDATE schueler SET aktiv = 0 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [aktuell.id])
      await tx.execute('UPDATE klassen_schueler SET aktiv = 0 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [aktuell.id])
    }
    await tx.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)', ['schuljahr_aktuell', archiv.bezeichnung])
    return {
      ok: true,
      schuljahrId: archiv.id,
      bezeichnung: archiv.bezeichnung,
      insArchivVerschoben: (aktuell && aktuell.id !== archiv.id) ? aktuell.bezeichnung : null,
    }
  })
}

// Ein archiviertes Schuljahr endgültig löschen (kaskadierend). Nur Archive sind
// löschbar – das aktuelle Jahr bleibt geschützt. deps = { raeumeFachDatenAuf, logError }.
async function loeschen(db, deps, id) {
  const sj = await db.selectOne('SELECT * FROM schuljahre WHERE id = ?', [id])
  if (!sj) return { ok: false, grund: 'nicht-gefunden' }
  if (!sj.archiviert) return { ok: false, grund: 'nicht-archiviert' }
  const klassen = await db.select('SELECT id FROM klassen WHERE schuljahr_id = ?', [id])
  for (const k of klassen) await klassenDomain.remove(db, deps, k.id)
  // termine, custom_ferien und kv_*_status hängen per ON DELETE CASCADE am Schuljahr.
  await db.execute('DELETE FROM schuljahre WHERE id = ?', [id])
  return { ok: true }
}

module.exports = { getAll, create, letztesArchivWiederherstellen, loeschen }

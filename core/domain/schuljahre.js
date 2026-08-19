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

// Schlüssel-Konvention des Reaktivierungs-Snapshots (gespiegelt in jahresabschluss.js).
const reaktKey = (schuljahrId) => `archiv_reaktivierung_${schuljahrId}`

// Aktive Personen/Mitgliedschaften eines Jahres festhalten und das Jahr dann deaktivieren.
// Der Snapshot erlaubt ein späteres, gezieltes Reaktivieren (reaktiviereAusSnapshot).
async function snapshotUndDeaktiviere(tx, schuljahrId) {
  const aktiveSchueler = (await tx.select(
    'SELECT id FROM schueler WHERE aktiv = 1 AND klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [schuljahrId]
  )).map((r) => r.id)
  const aktiveMitglieder = (await tx.select(
    'SELECT ks.klasse_id, ks.schueler_id FROM klassen_schueler ks JOIN klassen k ON ks.klasse_id = k.id WHERE ks.aktiv = 1 AND k.schuljahr_id = ?', [schuljahrId]
  )).map((r) => [r.klasse_id, r.schueler_id])
  await tx.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)',
    [reaktKey(schuljahrId), JSON.stringify({ schueler: aktiveSchueler, mitglieder: aktiveMitglieder })])
  await tx.execute('UPDATE schueler SET aktiv = 0 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [schuljahrId])
  await tx.execute('UPDATE klassen_schueler SET aktiv = 0 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [schuljahrId])
}

// Ein Jahr aus seinem Snapshot reaktivieren: NUR die beim Archivieren aktiven Personen/
// Mitgliedschaften – davor soft-gelöschte (aktiv=0) Schüler:innen bleiben inaktiv. Alt-Archive
// ohne Snapshot (vor dieser Version archiviert) fallen auf das frühere Verhalten zurück (alle).
async function reaktiviereAusSnapshot(tx, schuljahrId) {
  const snapRow = await tx.selectOne('SELECT wert FROM einstellungen WHERE schluessel = ?', [reaktKey(schuljahrId)])
  if (!snapRow) {
    await tx.execute('UPDATE schueler SET aktiv = 1 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [schuljahrId])
    await tx.execute('UPDATE klassen_schueler SET aktiv = 1 WHERE klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)', [schuljahrId])
    return
  }
  let snap = null
  try { snap = JSON.parse(snapRow.wert) } catch { /* defekter Snapshot → nichts reaktivieren */ }
  if (snap) {
    for (const sid of snap.schueler || []) {
      await tx.execute('UPDATE schueler SET aktiv = 1 WHERE id = ?', [sid])
    }
    for (const pair of snap.mitglieder || []) {
      await tx.execute('UPDATE klassen_schueler SET aktiv = 1 WHERE klasse_id = ? AND schueler_id = ?', [pair[0], pair[1]])
    }
  }
  await tx.execute('DELETE FROM einstellungen WHERE schluessel = ?', [reaktKey(schuljahrId)])
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
    // Gezielt reaktivieren (Snapshot aus dem Jahreswechsel); Roster liest klassen_schueler.aktiv.
    await reaktiviereAusSnapshot(tx, archiv.id)
    if (aktuell && aktuell.id !== archiv.id) {
      await tx.execute('UPDATE schuljahre SET archiviert = 1 WHERE id = ?', [aktuell.id])
      // Beim Zurückschieben ins Archiv den Zustand des (nun ex-aktuellen) Jahres sichern, damit ein
      // erneutes Wiederherstellen auch dessen soft-gelöschte Schüler:innen nicht reaktiviert.
      await snapshotUndDeaktiviere(tx, aktuell.id)
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

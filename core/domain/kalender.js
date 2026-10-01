// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: EduPage-/webcal-Kalender-Abos und die daraus importierten Termine.
// Async DbPort; keine weiteren Abhängigkeiten. Der eigentliche Abruf/Parse liegt in
// core/services/kalender.js; hier nur die deterministische DB-Schicht.

// ── Abos (Konfiguration) ─────────────────────────────────────────────────────
async function aboGetAll(db) {
  return db.select('SELECT * FROM kalender_abos ORDER BY id')
}

async function aboCreate(db, data) {
  const info = await db.execute(
    'INSERT INTO kalender_abos (name, url, farbe, aktiv) VALUES (?, ?, ?, ?)',
    [data.name ?? null, data.url, data.farbe ?? null, data.aktiv === 0 ? 0 : 1])
  return info.lastInsertRowid
}

async function aboUpdate(db, id, data) {
  await db.execute(
    'UPDATE kalender_abos SET name = ?, url = ?, farbe = ?, aktiv = ? WHERE id = ?',
    [data.name ?? null, data.url, data.farbe ?? null, data.aktiv === 0 ? 0 : 1, id])
  return true
}

async function aboRemove(db, id) {
  await db.execute('DELETE FROM kalender_abos WHERE id = ?', [id]) // kalender_termine kaskadiert
  return true
}

// Sync-Ergebnis (Zeitpunkt/Fehler/Anzahl) am Abo vermerken.
async function aboSetStatus(db, id, { letzteSync = null, letzterFehler = null, anzahl = null }) {
  await db.execute(
    'UPDATE kalender_abos SET letzte_sync = ?, letzter_fehler = ?, anzahl = ? WHERE id = ?',
    [letzteSync, letzterFehler, anzahl, id])
  return true
}

// ── Importierte Termine ──────────────────────────────────────────────────────
// Nur Termine aktiver Abos; inklusive Abo-Name/-Farbe für die Anzeige.
async function termineGetAll(db, schuljahrId) {
  return db.select(`
      SELECT kt.*, ka.name AS abo_name, ka.farbe AS abo_farbe
      FROM kalender_termine kt
      JOIN kalender_abos ka ON ka.id = kt.abo_id
      WHERE kt.schuljahr_id = ? AND ka.aktiv = 1
      ORDER BY kt.datum, kt.uhrzeit
    `, [schuljahrId])
}

// Alle Termine eines Abos ersetzen (transaktional): löschen + neu einfügen.
async function termineReplaceForAbo(db, aboId, rows) {
  const liste = Array.isArray(rows) ? rows : []
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM kalender_termine WHERE abo_id = ?', [aboId])
    for (const r of liste) {
      await tx.execute(
        `INSERT INTO kalender_termine
           (abo_id, schuljahr_id, uid, titel, datum, bis_datum, uhrzeit, bis_uhrzeit, ganztags, ort, beschreibung)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aboId, r.schuljahrId, r.uid ?? null, r.titel, r.datum, r.bisDatum ?? null,
          r.uhrzeit ?? null, r.bisUhrzeit ?? null, r.ganztags ? 1 : 0, r.ort ?? null, r.beschreibung ?? null])
    }
  })
  return liste.length
}

module.exports = { aboGetAll, aboCreate, aboUpdate, aboRemove, aboSetStatus, termineGetAll, termineReplaceForAbo }

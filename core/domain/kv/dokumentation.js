// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: Dokumentation – Aktenvermerke, Elternkontakte, Fehlstunden.
// Async DbPort; deps = { erzeugeTrigger, pruefeFehlstundenSchwellen }.

// ── Aktenvermerke ────────────────────────────────────────────────────────────
async function aktenGetAlleFuerKlasse(db, klasseId) {
  return db.select(`
      SELECT a.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_aktenvermerke a
      LEFT JOIN schueler s ON s.id = a.schueler_id
      WHERE a.klasse_id = ?
      ORDER BY a.datum DESC, a.id DESC
    `, [klasseId])
}

async function aktenGetAlleFuerSchueler(db, schuelerId) {
  return db.select('SELECT * FROM kv_aktenvermerke WHERE schueler_id = ? ORDER BY datum DESC, id DESC', [schuelerId])
}

async function aktenCreate(db, deps, data) {
  const info = await db.execute(`
      INSERT INTO kv_aktenvermerke (schueler_id, klasse_id, datum, typ, titel, beschreibung, zeugen, folgemassnahme)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
    data.schuelerId ?? null, data.klasseId, data.datum, data.typ,
    data.titel, data.beschreibung, data.zeugen ?? null, data.folgemassnahme ?? null,
  ])
  // Trigger auto: Bei Typ "vorfall" → info-Trigger
  if (data.typ === 'vorfall') {
    await deps.erzeugeTrigger(
      data.klasseId, data.schuelerId ?? null, 'vorfall', 'info',
      `Aktenvermerk: ${data.titel}`,
      data.beschreibung
    )
  }
  return info.lastInsertRowid
}

async function aktenUpdate(db, id, data) {
  await db.execute(`
      UPDATE kv_aktenvermerke
      SET datum = ?, typ = ?, titel = ?, beschreibung = ?, zeugen = ?, folgemassnahme = ?
      WHERE id = ?
    `, [data.datum, data.typ, data.titel, data.beschreibung, data.zeugen ?? null, data.folgemassnahme ?? null, id])
  return true
}

async function aktenDelete(db, id) {
  await db.execute('DELETE FROM kv_aktenvermerke WHERE id = ?', [id])
  return true
}

// ── Elternkontakte ───────────────────────────────────────────────────────────
async function elternGetAlleFuerSchueler(db, schuelerId) {
  return db.select(`
      SELECT * FROM kv_elternkontakte WHERE schueler_id = ?
      ORDER BY erledigt ASC, datum DESC, id DESC
    `, [schuelerId])
}

async function elternGetOffeneFuerKlasse(db, klasseId) {
  return db.select(`
      SELECT e.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_elternkontakte e
      JOIN schueler s ON s.id = e.schueler_id
      WHERE s.klasse_id = ? AND e.erledigt = 0
      ORDER BY e.datum ASC
    `, [klasseId])
}

async function elternCreate(db, data) {
  const info = await db.execute(`
      INSERT INTO kv_elternkontakte (schueler_id, datum, art, initiator, thema, inhalt, erledigt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [data.schuelerId, data.datum, data.art, data.initiator, data.thema, data.inhalt ?? null, data.erledigt ? 1 : 0])
  return info.lastInsertRowid
}

async function elternUpdate(db, id, data) {
  await db.execute(`
      UPDATE kv_elternkontakte
      SET datum = ?, art = ?, initiator = ?, thema = ?, inhalt = ?, erledigt = ?
      WHERE id = ?
    `, [data.datum, data.art, data.initiator, data.thema, data.inhalt ?? null, data.erledigt ? 1 : 0, id])
  return true
}

async function elternSetErledigt(db, id, erledigt) {
  await db.execute('UPDATE kv_elternkontakte SET erledigt = ? WHERE id = ?', [erledigt ? 1 : 0, id])
  return true
}

async function elternDelete(db, id) {
  await db.execute('DELETE FROM kv_elternkontakte WHERE id = ?', [id])
  return true
}

// ── Fehlstunden ──────────────────────────────────────────────────────────────
async function fehlGetAlleFuerSchueler(db, schuelerId) {
  return db.select('SELECT * FROM kv_fehlstunden WHERE schueler_id = ? ORDER BY datum DESC, id DESC', [schuelerId])
}

async function fehlCreate(db, deps, data) {
  const info = await db.execute(`
      INSERT INTO kv_fehlstunden (schueler_id, datum, stunden, entschuldigt, grund)
      VALUES (?, ?, ?, ?, ?)
    `, [data.schuelerId, data.datum, data.stunden, data.entschuldigt ? 1 : 0, data.grund ?? null])
  await deps.pruefeFehlstundenSchwellen(data.schuelerId)
  return info.lastInsertRowid
}

async function fehlUpdate(db, deps, id, data) {
  await db.execute(`
      UPDATE kv_fehlstunden SET datum = ?, stunden = ?, entschuldigt = ?, grund = ? WHERE id = ?
    `, [data.datum, data.stunden, data.entschuldigt ? 1 : 0, data.grund ?? null, id])
  const row = await db.selectOne('SELECT schueler_id FROM kv_fehlstunden WHERE id = ?', [id])
  if (row) await deps.pruefeFehlstundenSchwellen(row.schueler_id)
  return true
}

async function fehlDelete(db, deps, id) {
  const row = await db.selectOne('SELECT schueler_id FROM kv_fehlstunden WHERE id = ?', [id])
  await db.execute('DELETE FROM kv_fehlstunden WHERE id = ?', [id])
  if (row) await deps.pruefeFehlstundenSchwellen(row.schueler_id)
  return true
}

module.exports = {
  aktenGetAlleFuerKlasse, aktenGetAlleFuerSchueler, aktenCreate, aktenUpdate, aktenDelete,
  elternGetAlleFuerSchueler, elternGetOffeneFuerKlasse, elternCreate, elternUpdate, elternSetErledigt, elternDelete,
  fehlGetAlleFuerSchueler, fehlCreate, fehlUpdate, fehlDelete,
}

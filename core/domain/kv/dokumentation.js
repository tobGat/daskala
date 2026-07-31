// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: Dokumentation – Aktenvermerke, Elternkontakte, Fehlstunden.
// db injiziert; deps = { erzeugeTrigger, pruefeFehlstundenSchwellen }.

// ── Aktenvermerke ────────────────────────────────────────────────────────────
function aktenGetAlleFuerKlasse(db, klasseId) {
  return db.prepare(`
      SELECT a.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_aktenvermerke a
      LEFT JOIN schueler s ON s.id = a.schueler_id
      WHERE a.klasse_id = ?
      ORDER BY a.datum DESC, a.id DESC
    `).all(klasseId)
}

function aktenGetAlleFuerSchueler(db, schuelerId) {
  return db.prepare('SELECT * FROM kv_aktenvermerke WHERE schueler_id = ? ORDER BY datum DESC, id DESC').all(schuelerId)
}

function aktenCreate(db, deps, data) {
  const info = db.prepare(`
      INSERT INTO kv_aktenvermerke (schueler_id, klasse_id, datum, typ, titel, beschreibung, zeugen, folgemassnahme)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
    data.schuelerId ?? null, data.klasseId, data.datum, data.typ,
    data.titel, data.beschreibung, data.zeugen ?? null, data.folgemassnahme ?? null
  )
  // Trigger auto: Bei Typ "vorfall" → info-Trigger
  if (data.typ === 'vorfall') {
    deps.erzeugeTrigger(
      data.klasseId, data.schuelerId ?? null, 'vorfall', 'info',
      `Aktenvermerk: ${data.titel}`,
      data.beschreibung
    )
  }
  return info.lastInsertRowid
}

function aktenUpdate(db, id, data) {
  db.prepare(`
      UPDATE kv_aktenvermerke
      SET datum = ?, typ = ?, titel = ?, beschreibung = ?, zeugen = ?, folgemassnahme = ?
      WHERE id = ?
    `).run(data.datum, data.typ, data.titel, data.beschreibung, data.zeugen ?? null, data.folgemassnahme ?? null, id)
  return true
}

function aktenDelete(db, id) {
  db.prepare('DELETE FROM kv_aktenvermerke WHERE id = ?').run(id)
  return true
}

// ── Elternkontakte ───────────────────────────────────────────────────────────
function elternGetAlleFuerSchueler(db, schuelerId) {
  return db.prepare(`
      SELECT * FROM kv_elternkontakte WHERE schueler_id = ?
      ORDER BY erledigt ASC, datum DESC, id DESC
    `).all(schuelerId)
}

function elternGetOffeneFuerKlasse(db, klasseId) {
  return db.prepare(`
      SELECT e.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_elternkontakte e
      JOIN schueler s ON s.id = e.schueler_id
      WHERE s.klasse_id = ? AND e.erledigt = 0
      ORDER BY e.datum ASC
    `).all(klasseId)
}

function elternCreate(db, data) {
  const info = db.prepare(`
      INSERT INTO kv_elternkontakte (schueler_id, datum, art, initiator, thema, inhalt, erledigt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.schuelerId, data.datum, data.art, data.initiator, data.thema, data.inhalt ?? null, data.erledigt ? 1 : 0)
  return info.lastInsertRowid
}

function elternUpdate(db, id, data) {
  db.prepare(`
      UPDATE kv_elternkontakte
      SET datum = ?, art = ?, initiator = ?, thema = ?, inhalt = ?, erledigt = ?
      WHERE id = ?
    `).run(data.datum, data.art, data.initiator, data.thema, data.inhalt ?? null, data.erledigt ? 1 : 0, id)
  return true
}

function elternSetErledigt(db, id, erledigt) {
  db.prepare('UPDATE kv_elternkontakte SET erledigt = ? WHERE id = ?').run(erledigt ? 1 : 0, id)
  return true
}

function elternDelete(db, id) {
  db.prepare('DELETE FROM kv_elternkontakte WHERE id = ?').run(id)
  return true
}

// ── Fehlstunden ──────────────────────────────────────────────────────────────
function fehlGetAlleFuerSchueler(db, schuelerId) {
  return db.prepare('SELECT * FROM kv_fehlstunden WHERE schueler_id = ? ORDER BY datum DESC, id DESC').all(schuelerId)
}

function fehlCreate(db, deps, data) {
  const info = db.prepare(`
      INSERT INTO kv_fehlstunden (schueler_id, datum, stunden, entschuldigt, grund)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.schuelerId, data.datum, data.stunden, data.entschuldigt ? 1 : 0, data.grund ?? null)
  deps.pruefeFehlstundenSchwellen(data.schuelerId)
  return info.lastInsertRowid
}

function fehlUpdate(db, deps, id, data) {
  db.prepare(`
      UPDATE kv_fehlstunden SET datum = ?, stunden = ?, entschuldigt = ?, grund = ? WHERE id = ?
    `).run(data.datum, data.stunden, data.entschuldigt ? 1 : 0, data.grund ?? null, id)
  const row = db.prepare('SELECT schueler_id FROM kv_fehlstunden WHERE id = ?').get(id)
  if (row) deps.pruefeFehlstundenSchwellen(row.schueler_id)
  return true
}

function fehlDelete(db, deps, id) {
  const row = db.prepare('SELECT schueler_id FROM kv_fehlstunden WHERE id = ?').get(id)
  db.prepare('DELETE FROM kv_fehlstunden WHERE id = ?').run(id)
  if (row) deps.pruefeFehlstundenSchwellen(row.schueler_id)
  return true
}

module.exports = {
  aktenGetAlleFuerKlasse, aktenGetAlleFuerSchueler, aktenCreate, aktenUpdate, aktenDelete,
  elternGetAlleFuerSchueler, elternGetOffeneFuerKlasse, elternCreate, elternUpdate, elternSetErledigt, elternDelete,
  fehlGetAlleFuerSchueler, fehlCreate, fehlUpdate, fehlDelete,
}

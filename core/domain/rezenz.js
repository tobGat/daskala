// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: individueller Rezenzfaktor (§ 20 LBVO) pro (Fach, Schüler:in).
// Fehlt eine Zeile, gilt der globale Faktor aus den Einstellungen (Fallback).
// Async DbPort; deps = { berechneAlleFuerFach, rosterIdsFuerFach }.

async function get(db, fachId) {
  const rows = await db.select('SELECT schueler_id, faktor FROM schueler_rezenz WHERE fach_id = ?', [fachId])
  const map = {}
  for (const r of rows) map[r.schueler_id] = r.faktor
  return map
}

// faktor = Zahl → Override setzen; null/undefined → Override entfernen (zurück auf globalen Wert).
async function upsert(handle, fachId, schuelerId, faktor) {
  if (faktor == null) {
    await handle.execute('DELETE FROM schueler_rezenz WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId])
  } else {
    await handle.execute(`
      INSERT INTO schueler_rezenz (fach_id, schueler_id, faktor) VALUES (?, ?, ?)
      ON CONFLICT(fach_id, schueler_id) DO UPDATE SET faktor = excluded.faktor
    `, [fachId, schuelerId, faktor])
  }
}

// Nur diese:r Schüler:in.
async function set(db, deps, fachId, schuelerId, faktor) {
  await upsert(db, fachId, schuelerId, faktor)
  await deps.berechneAlleFuerFach(fachId)
  return true
}

// Ganze Klasse = alle Schüler:innen dieses Fachs.
async function setKlasse(db, deps, fachId, faktor) {
  const ids = await deps.rosterIdsFuerFach(fachId)
  await db.transaction(async (tx) => {
    for (const sId of ids) await upsert(tx, fachId, sId, faktor)
  })
  await deps.berechneAlleFuerFach(fachId)
  return true
}

module.exports = { get, set, setKlasse }

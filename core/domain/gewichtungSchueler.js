// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: individuelle Notengewichtung (SA/Test/Individuell/Mitarbeit) pro (Fach, Schüler:in).
// Fehlt eine Zeile, gilt die Fach- bzw. globale Gewichtung. Werte als Anteile 0..1 (wie faecher.*).
// „Ganze Klasse" wird nicht hier, sondern über faecher.updateGewichtung (Fach-Gewichtung) abgebildet.
// Async DbPort; deps = { berechneAlleFuerFach }.

async function get(db, fachId) {
  const rows = await db.select('SELECT schueler_id, gewichtung_sa, gewichtung_t, gewichtung_custom, gewichtung_ma FROM schueler_gewichtung WHERE fach_id = ?', [fachId])
  const map = {}
  for (const r of rows) map[r.schueler_id] = { sa: r.gewichtung_sa, t: r.gewichtung_t, custom: r.gewichtung_custom, ma: r.gewichtung_ma }
  return map
}

// data = { sa, t, custom, ma } (Anteile) → Override setzen; null/undefined → entfernen (zurück auf Fach).
async function set(db, deps, fachId, schuelerId, data) {
  if (data == null) {
    await db.execute('DELETE FROM schueler_gewichtung WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId])
  } else {
    await db.execute(`
      INSERT INTO schueler_gewichtung (fach_id, schueler_id, gewichtung_sa, gewichtung_t, gewichtung_custom, gewichtung_ma)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id) DO UPDATE SET
        gewichtung_sa = excluded.gewichtung_sa, gewichtung_t = excluded.gewichtung_t,
        gewichtung_custom = excluded.gewichtung_custom, gewichtung_ma = excluded.gewichtung_ma
    `, [fachId, schuelerId, data.sa ?? null, data.t ?? null, data.custom ?? null, data.ma ?? null])
  }
  await deps.berechneAlleFuerFach(fachId)
  return true
}

module.exports = { get, set }

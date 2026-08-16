// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: manuelle Mitarbeitsnote (§ 4 Abs. 2 LBVO – Gesamtbeurteilung) pro (Fach, Schüler:in).
// Fehlt eine Zeile, gilt der berechnete Teilnoten-Schnitt (Bonus/Malus + Hausübung). note = interner
// Wert (1–7, inkl. Niveau-Offset), analog zeugnisnoten.note_manuell. Async DbPort;
// deps = { berechneAlleFuerFach }.

async function get(db, fachId) {
  const rows = await db.select('SELECT schueler_id, note FROM schueler_ma_note WHERE fach_id = ?', [fachId])
  const map = {}
  for (const r of rows) map[r.schueler_id] = r.note
  return map
}

// note = Zahl → manuelle Mitarbeitsnote setzen; null/undefined → entfernen (zurück auf Berechnung).
async function set(db, deps, fachId, schuelerId, note) {
  if (note == null) {
    await db.execute('DELETE FROM schueler_ma_note WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId])
  } else {
    await db.execute(`
      INSERT INTO schueler_ma_note (fach_id, schueler_id, note) VALUES (?, ?, ?)
      ON CONFLICT(fach_id, schueler_id) DO UPDATE SET note = excluded.note
    `, [fachId, schuelerId, note])
  }
  await deps.berechneAlleFuerFach(fachId)
  return true
}

module.exports = { get, set }

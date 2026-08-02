// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Einträge (Noten/Werte je Spalte × Schüler:in) inkl. Verlauf.
// db injiziert; deps = { pushUndo, pruefeNotenTrigger }.

function getAll(db, fachId) {
  return db.prepare(`
      SELECT e.* FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE s.fach_id = ?
    `).all(fachId)
}

function set(db, deps, spalteId, schuelerId, wert) {
  const existing = db.prepare('SELECT wert, kommentar FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').get(spalteId, schuelerId)
  const oldWert = existing ? existing.wert : null
  const wertAlt = existing?.wert ?? null
  const wertNeu = wert || null
  if (wertAlt !== wertNeu) {
    const spalte = db.prepare('SELECT fach_id FROM spalten WHERE id = ?').get(spalteId)
    const kommentarAlt = existing?.kommentar ?? null
    db.prepare(`
        INSERT INTO eintraege_verlauf (fach_id, spalte_id, schueler_id, wert_alt, wert_neu, kommentar_alt, kommentar_neu, aktion)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'aenderung')
      `).run(spalte?.fach_id ?? null, spalteId, schuelerId, wertAlt, wertNeu, kommentarAlt, kommentarAlt)
  }
  const apply = (w) => {
    const hasKommentar = !!db.prepare("SELECT 1 FROM eintraege WHERE spalte_id = ? AND schueler_id = ? AND kommentar IS NOT NULL AND kommentar != ''").get(spalteId, schuelerId)
    if (w === '' || w === null) {
      if (hasKommentar) {
        db.prepare('UPDATE eintraege SET wert = NULL WHERE spalte_id = ? AND schueler_id = ?').run(spalteId, schuelerId)
      } else {
        db.prepare('DELETE FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').run(spalteId, schuelerId)
      }
    } else {
      db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?) ON CONFLICT(spalte_id, schueler_id) DO UPDATE SET wert = excluded.wert').run(spalteId, schuelerId, w)
    }
  }
  apply(wert)
  deps.pushUndo({ description: 'Eintrag', undo: () => apply(oldWert), redo: () => apply(wert) })
  // KV-Trigger-Hook: nur wenn sich der Wert geändert hat
  if (wertAlt !== wertNeu) {
    try { deps.pruefeNotenTrigger(spalteId, schuelerId, wertNeu, wertAlt) } catch (e) { console.error('[KV] pruefeNotenTrigger:', e) }
  }
  return true
}

function setKommentar(db, spalteId, schuelerId, kommentar) {
  const existing = db.prepare('SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').get(spalteId, schuelerId)
  const k = kommentar?.trim() || null
  if (existing) {
    db.prepare('UPDATE eintraege SET kommentar = ? WHERE spalte_id = ? AND schueler_id = ?').run(k, spalteId, schuelerId)
  } else if (k) {
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert, kommentar) VALUES (?, ?, NULL, ?)').run(spalteId, schuelerId, k)
  }
  return true
}

function verlaufGet(db, schuelerId, fachId) {
  return db.prepare(`
      SELECT
        v.id, v.spalte_id, v.schueler_id,
        v.wert_alt, v.wert_neu, v.kommentar_alt, v.kommentar_neu,
        v.zeitstempel, v.aktion,
        s.kategorie, s.kuerzel, s.datum
      FROM eintraege_verlauf v
      LEFT JOIN spalten s ON s.id = v.spalte_id
      WHERE v.schueler_id = ? AND v.fach_id = ?
      ORDER BY v.zeitstempel DESC
      LIMIT 100
    `).all(schuelerId, fachId)
}

module.exports = { getAll, set, setKommentar, verlaufGet }

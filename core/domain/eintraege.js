// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Einträge (Noten/Werte je Spalte × Schüler:in) inkl. Verlauf.
// Async DbPort; deps = { pushUndo, pruefeNotenTrigger }.

const { neueUuid } = require('../db/uuid')

async function getAll(db, fachId) {
  return db.select(`
      SELECT e.* FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE s.fach_id = ?
    `, [fachId])
}

async function set(db, deps, spalteId, schuelerId, wert) {
  const existing = await db.selectOne('SELECT wert, kommentar FROM eintraege WHERE spalte_id = ? AND schueler_id = ?', [spalteId, schuelerId])
  const oldWert = existing ? existing.wert : null
  const wertAlt = existing?.wert ?? null
  const wertNeu = wert || null
  if (wertAlt !== wertNeu) {
    const spalte = await db.selectOne('SELECT fach_id FROM spalten WHERE id = ?', [spalteId])
    const kommentarAlt = existing?.kommentar ?? null
    await db.execute(`
        INSERT INTO eintraege_verlauf (fach_id, spalte_id, schueler_id, wert_alt, wert_neu, kommentar_alt, kommentar_neu, aktion)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'aenderung')
      `, [spalte?.fach_id ?? null, spalteId, schuelerId, wertAlt, wertNeu, kommentarAlt, kommentarAlt])
  }
  const apply = async (w) => {
    const hasKommentar = !!(await db.selectOne("SELECT 1 FROM eintraege WHERE spalte_id = ? AND schueler_id = ? AND kommentar IS NOT NULL AND kommentar != ''", [spalteId, schuelerId]))
    if (w === '' || w === null) {
      if (hasKommentar) {
        await db.execute('UPDATE eintraege SET wert = NULL WHERE spalte_id = ? AND schueler_id = ?', [spalteId, schuelerId])
      } else {
        await db.execute('DELETE FROM eintraege WHERE spalte_id = ? AND schueler_id = ?', [spalteId, schuelerId])
      }
    } else {
      await db.execute('INSERT INTO eintraege (spalte_id, schueler_id, wert, uuid) VALUES (?, ?, ?, ?) ON CONFLICT(spalte_id, schueler_id) DO UPDATE SET wert = excluded.wert', [spalteId, schuelerId, w, neueUuid()])
    }
  }
  await apply(wert)
  deps.pushUndo({ description: 'Eintrag', undo: () => apply(oldWert), redo: () => apply(wert) })
  // KV-Trigger-Hook: nur wenn sich der Wert geändert hat
  if (wertAlt !== wertNeu) {
    try { await deps.pruefeNotenTrigger(spalteId, schuelerId, wertNeu, wertAlt) } catch (e) { console.error('[KV] pruefeNotenTrigger:', e) }
  }
  return true
}

async function setKommentar(db, spalteId, schuelerId, kommentar) {
  const existing = await db.selectOne('SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?', [spalteId, schuelerId])
  const k = kommentar?.trim() || null
  if (existing) {
    await db.execute('UPDATE eintraege SET kommentar = ? WHERE spalte_id = ? AND schueler_id = ?', [k, spalteId, schuelerId])
  } else if (k) {
    await db.execute('INSERT INTO eintraege (spalte_id, schueler_id, wert, kommentar, uuid) VALUES (?, ?, NULL, ?, ?)', [spalteId, schuelerId, k, neueUuid()])
  }
  return true
}

async function verlaufGet(db, schuelerId, fachId) {
  return db.select(`
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
    `, [schuelerId, fachId])
}

module.exports = { getAll, set, setKommentar, verlaufGet }

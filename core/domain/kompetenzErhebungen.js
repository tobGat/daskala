// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kompetenz-Erhebungen: pro Schüler:in und Fach werden zu mehreren Zeitpunkten ("Erhebungen") Niveaus
// je KANN-BESCHREIBUNG (Item) erfasst (Verlauf übers Jahr, Netzdiagramm mit Aggregation je Kompetenzbereich).
// Die Werte sind positionsbasiert (bereich_idx/teilkompetenz_idx/item_idx aus dem Raster) und zusätzlich selbst-
// beschreibend (bereich_name/teilkompetenz_name), damit Anzeige/Aggregation ohne DB-Katalog auskommen.
// Alle Funktionen erhalten den async DbPort als erstes Argument.

// Profil (alle Erhebungen mit ihren Teilkompetenz-Werten) für eine:n Schüler:in in einem Fach.
async function getProfil(db, schuelerId, fachId) {
  const erhebungenRows = await db.select(
    'SELECT id, schulstufe, schulzweig, datum, titel, erstellt_am FROM kompetenz_erhebungen WHERE schueler_id = ? AND fach_id = ? ORDER BY datum, id',
    [schuelerId, fachId]
  )
  const werteRows = await db.select(
    `SELECT w.erhebung_id, w.bereich_idx, w.teilkompetenz_idx, w.item_idx, w.bereich_name, w.teilkompetenz_name, w.niveau, w.notiz
       FROM kompetenz_erhebung_werte w
       JOIN kompetenz_erhebungen e ON e.id = w.erhebung_id
      WHERE e.schueler_id = ? AND e.fach_id = ?
      ORDER BY w.bereich_idx, w.teilkompetenz_idx, w.item_idx`,
    [schuelerId, fachId]
  )
  const werteByErhebung = {}
  for (const w of werteRows) {
    if (!werteByErhebung[w.erhebung_id]) werteByErhebung[w.erhebung_id] = []
    werteByErhebung[w.erhebung_id].push({
      bereich_idx: w.bereich_idx,
      teilkompetenz_idx: w.teilkompetenz_idx,
      item_idx: w.item_idx,
      bereich_name: w.bereich_name,
      teilkompetenz_name: w.teilkompetenz_name,
      niveau: w.niveau,
      notiz: w.notiz,
    })
  }
  const erhebungen = erhebungenRows.map(e => ({
    id: e.id,
    schulstufe: e.schulstufe,
    schulzweig: e.schulzweig,
    datum: e.datum,
    titel: e.titel,
    erstellt_am: e.erstellt_am,
    werte: werteByErhebung[e.id] ?? [],
  }))
  const letzte = erhebungenRows.length ? erhebungenRows[erhebungenRows.length - 1] : null
  return { erhebungen, letzteSchulstufe: letzte?.schulstufe ?? null, letzteSchulzweig: letzte?.schulzweig ?? null }
}

// Eine neue Erhebung samt Teilkompetenz-Werten speichern. Gibt die neue erhebung_id zurück.
async function speichern(db, { schuelerId, fachId, schulstufe, schulzweig, datum, titel, werte }) {
  return db.transaction(async tx => {
    const info = await tx.execute(
      'INSERT INTO kompetenz_erhebungen (schueler_id, fach_id, schulstufe, schulzweig, datum, titel) VALUES (?, ?, ?, ?, ?, ?)',
      [schuelerId, fachId, schulstufe, schulzweig ?? null, datum, titel ?? null]
    )
    const erhebungId = info.lastInsertRowid
    for (const w of werte ?? []) {
      await tx.execute(
        `INSERT INTO kompetenz_erhebung_werte
           (erhebung_id, bereich_idx, teilkompetenz_idx, item_idx, bereich_name, teilkompetenz_name, niveau, notiz)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [erhebungId, w.bereich_idx, w.teilkompetenz_idx, w.item_idx, w.bereich_name, w.teilkompetenz_name, w.niveau ?? 0, w.notiz ?? null]
      )
    }
    return erhebungId
  })
}

// Bestehende Erhebung aktualisieren (Kopf + Werte-Upsert je Teilkompetenz-Position).
async function update(db, erhebungId, { datum, titel, werte }) {
  return db.transaction(async tx => {
    await tx.execute(
      'UPDATE kompetenz_erhebungen SET datum = COALESCE(?, datum), titel = ? WHERE id = ?',
      [datum ?? null, titel ?? null, erhebungId]
    )
    for (const w of werte ?? []) {
      await tx.execute(
        `INSERT INTO kompetenz_erhebung_werte
           (erhebung_id, bereich_idx, teilkompetenz_idx, item_idx, bereich_name, teilkompetenz_name, niveau, notiz)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(erhebung_id, bereich_idx, teilkompetenz_idx, item_idx)
           DO UPDATE SET niveau = excluded.niveau, notiz = excluded.notiz,
                         bereich_name = excluded.bereich_name, teilkompetenz_name = excluded.teilkompetenz_name`,
        [erhebungId, w.bereich_idx, w.teilkompetenz_idx, w.item_idx, w.bereich_name, w.teilkompetenz_name, w.niveau ?? 0, w.notiz ?? null]
      )
    }
    return true
  })
}

// Erhebung löschen (Werte cascaden über FK).
async function remove(db, erhebungId) {
  await db.execute('DELETE FROM kompetenz_erhebungen WHERE id = ?', [erhebungId])
  return true
}

module.exports = { getProfil, speichern, update, remove }

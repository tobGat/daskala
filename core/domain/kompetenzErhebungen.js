// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kompetenz-Erhebungen: pro Schüler:in und Fach werden zu mehreren Zeitpunkten ("Erhebungen")
// Niveaus je Kompetenzbereich erfasst (Verlauf übers Jahr, Radar-Diagramm). Achsen-Katalog ist die
// bestehende Tabelle `kompetenzbereiche`; deren Zeilen werden beim ersten Speichern aus den
// Raster-Bereichsnamen einmalig geseedet. Alle Funktionen erhalten den async DbPort als erstes Argument.

// Profil (Achsen + alle Erhebungen mit Werten) für eine:n Schüler:in in einem Fach.
async function getProfil(db, schuelerId, fachId) {
  const alleBereiche = await db.select(
    'SELECT id, titel, beschreibung, reihenfolge FROM kompetenzbereiche WHERE fach_id = ? ORDER BY reihenfolge, id',
    [fachId]
  )
  const erhebungenRows = await db.select(
    'SELECT id, schulstufe, datum, titel, erstellt_am FROM kompetenz_erhebungen WHERE schueler_id = ? AND fach_id = ? ORDER BY datum, id',
    [schuelerId, fachId]
  )
  const werteRows = await db.select(
    `SELECT w.erhebung_id, w.kompetenzbereich_id, w.niveau, w.notiz
       FROM kompetenz_erhebung_werte w
       JOIN kompetenz_erhebungen e ON e.id = w.erhebung_id
      WHERE e.schueler_id = ? AND e.fach_id = ?`,
    [schuelerId, fachId]
  )
  // Achsen = nur die Bereiche, die von einer Erhebung dieser Person tatsächlich genutzt werden.
  // So stören generische Alt-Bereiche (aus initVorlagen bei der Fach-Anlage) das Netzdiagramm nicht.
  const usedIds = new Set(werteRows.map(w => w.kompetenzbereich_id))
  const bereiche = alleBereiche.filter(b => usedIds.has(b.id))
  const werteByErhebung = {}
  for (const w of werteRows) {
    if (!werteByErhebung[w.erhebung_id]) werteByErhebung[w.erhebung_id] = {}
    werteByErhebung[w.erhebung_id][w.kompetenzbereich_id] = w.niveau
  }
  const erhebungen = erhebungenRows.map(e => ({
    id: e.id,
    schulstufe: e.schulstufe,
    datum: e.datum,
    titel: e.titel,
    erstellt_am: e.erstellt_am,
    werte: werteByErhebung[e.id] ?? {},
  }))
  const letzteSchulstufe = erhebungenRows.length ? erhebungenRows[erhebungenRows.length - 1].schulstufe : null
  return { bereiche, erhebungen, letzteSchulstufe }
}

// Kompetenzbereiche eines Fachs idempotent aus den Raster-Bereichsnamen anlegen (nach titel).
// Gibt eine Zuordnung { bereichName -> id } für ALLE übergebenen Namen zurück.
async function ensureBereicheTx(tx, fachId, bereiche) {
  const vorhandene = await tx.select('SELECT id, titel FROM kompetenzbereiche WHERE fach_id = ?', [fachId])
  const nameToId = {}
  for (const b of vorhandene) nameToId[b.titel] = b.id
  let reihenfolge = vorhandene.length
  for (const b of bereiche) {
    if (nameToId[b.name] != null) continue
    const info = await tx.execute(
      'INSERT INTO kompetenzbereiche (fach_id, titel, beschreibung, reihenfolge) VALUES (?, ?, ?, ?)',
      [fachId, b.name, b.beschreibung ?? null, reihenfolge]
    )
    nameToId[b.name] = info.lastInsertRowid
    reihenfolge++
  }
  return nameToId
}

// Eine neue Erhebung samt Werten speichern. bereiche = [{name, beschreibung?}] (Reihenfolge = Achsen),
// werte = [{bereichName?|kompetenzbereich_id?, niveau, notiz?}]. Gibt die neue erhebung_id zurück.
async function speichern(db, { schuelerId, fachId, schulstufe, datum, titel, bereiche, werte }) {
  return db.transaction(async tx => {
    const nameToId = await ensureBereicheTx(tx, fachId, bereiche ?? [])
    const info = await tx.execute(
      'INSERT INTO kompetenz_erhebungen (schueler_id, fach_id, schulstufe, datum, titel) VALUES (?, ?, ?, ?, ?)',
      [schuelerId, fachId, schulstufe, datum, titel ?? null]
    )
    const erhebungId = info.lastInsertRowid
    for (const w of werte ?? []) {
      const kbId = w.kompetenzbereich_id ?? nameToId[w.bereichName]
      if (kbId == null) continue
      await tx.execute(
        'INSERT INTO kompetenz_erhebung_werte (erhebung_id, kompetenzbereich_id, niveau, notiz) VALUES (?, ?, ?, ?)',
        [erhebungId, kbId, w.niveau ?? 0, w.notiz ?? null]
      )
    }
    return erhebungId
  })
}

// Bestehende Erhebung aktualisieren (Kopf + Werte-Upsert je Kompetenzbereich).
async function update(db, erhebungId, { datum, titel, werte }) {
  return db.transaction(async tx => {
    await tx.execute(
      'UPDATE kompetenz_erhebungen SET datum = COALESCE(?, datum), titel = ? WHERE id = ?',
      [datum ?? null, titel ?? null, erhebungId]
    )
    for (const w of werte ?? []) {
      await tx.execute(
        `INSERT INTO kompetenz_erhebung_werte (erhebung_id, kompetenzbereich_id, niveau, notiz)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(erhebung_id, kompetenzbereich_id) DO UPDATE SET niveau = excluded.niveau, notiz = excluded.notiz`,
        [erhebungId, w.kompetenzbereich_id, w.niveau ?? 0, w.notiz ?? null]
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

module.exports = { getProfil, ensureBereicheTx, speichern, update, remove }

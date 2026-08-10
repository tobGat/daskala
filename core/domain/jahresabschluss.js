// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Jahresabschluss – altes Schuljahr archivieren, neues anlegen,
// ausgewählte Klassen/Fächer vorrücken, Schüler:innen zuordnen. Async DbPort,
// gesamte Logik in einer Transaktion.

const { neueUuid } = require('../db/uuid')

async function neuesSchuljahr(db, { altesSchuljahreId, neueBezeichnung, klassen = null, schuelerZuordnungen }) {
  return db.transaction(async (tx) => {
    // Altes Schuljahr archivieren
    await tx.execute('UPDATE schuljahre SET archiviert = 1 WHERE id = ?', [altesSchuljahreId])

    // Neues Schuljahr anlegen
    const neuesSchuljahr = await tx.execute('INSERT INTO schuljahre (bezeichnung, uuid) VALUES (?, ?)', [neueBezeichnung, neueUuid()])
    const neuesSchuljahreId = neuesSchuljahr.lastInsertRowid

    // Aktuelles Schuljahr persistieren, damit Kalender/Stundenplan/Ferien auch nach Neustart folgen
    await tx.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)', ['schuljahr_aktuell', neueBezeichnung])
    // Neues Jahr beginnt immer im 1. Semester
    await tx.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)', ['semester_aktuell', '1'])

    const klasseIdMapping = {}
    const fachIdMapping = {}
    const schuelerIdMapping = {}

    // Auswahl der vorzurückenden Klassen/Fächer. Fehlt "klassen" (Alt-Aufrufer) → alle Klassen, alle Fächer.
    let auswahl = klassen
    if (!auswahl) {
      auswahl = (await tx.select('SELECT id FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0', [altesSchuljahreId]))
        .map(k => ({ alteKlasseId: k.id, neuerName: null, fachIds: null }))   // fachIds null = alle Fächer
    }

    for (const kSel of auswahl) {
      const alteKlasse = await tx.selectOne('SELECT * FROM klassen WHERE id = ?', [kSel.alteKlasseId])
      if (!alteKlasse) continue
      const neueKlasse = await tx.execute('INSERT INTO klassen (schuljahr_id, name, reihenfolge, uuid) VALUES (?, ?, ?, ?)', [neuesSchuljahreId, kSel.neuerName ?? alteKlasse.name, alteKlasse.reihenfolge, neueUuid()])
      klasseIdMapping[alteKlasse.id] = neueKlasse.lastInsertRowid

      // Nur ausgewählte Fächer übernehmen (fachIds null = alle)
      const fachFilter = Array.isArray(kSel.fachIds) ? new Set(kSel.fachIds) : null
      const alteFaecher = await tx.select('SELECT * FROM faecher WHERE klasse_id = ?', [alteKlasse.id])
      for (const altesFach of alteFaecher) {
        if (fachFilter && !fachFilter.has(altesFach.id)) continue   // nicht angehakt → nicht vorrücken
        const nf = await tx.execute('INSERT INTO faecher (klasse_id, name, reihenfolge, alle_schueler, benotungssystem, uuid) VALUES (?, ?, ?, ?, ?, ?)', [neueKlasse.lastInsertRowid, altesFach.name, altesFach.reihenfolge, altesFach.alle_schueler ?? 1, altesFach.benotungssystem ?? 'standard', neueUuid()])
        fachIdMapping[altesFach.id] = nf.lastInsertRowid
      }
    }

    // Schüler:innen zuordnen (nur für vorgerückte Klassen; klasseIdMapping existiert nur für diese)
    for (const z of schuelerZuordnungen) {
      if (!klasseIdMapping[z.alteKlasseId]) continue   // Klasse nicht vorgerückt → Schüler:in bleibt im alten Jahr
      if (z.aktion === 'ausgeschieden') {
        await tx.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [z.schuelerId])
      } else if (z.aktion === 'bleibt') {
        // Schüler:in in neuer Klasse anlegen
        const s = await tx.selectOne('SELECT * FROM schueler WHERE id = ?', [z.schuelerId])
        const ns = await tx.execute('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, uuid) VALUES (?, ?, ?, ?, ?)', [klasseIdMapping[z.alteKlasseId], s.vorname, s.nachname, s.reihenfolge, neueUuid()])
        schuelerIdMapping[z.schuelerId] = ns.lastInsertRowid
        await tx.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [z.schuelerId])
      }
    }

    // Fach-Zuordnung (Gruppenfächer) ins neue Jahr übernehmen, IDs remappt (nur "bleibt"-Schüler:innen).
    for (const [altFachId, neuFachId] of Object.entries(fachIdMapping)) {
      const f = await tx.selectOne('SELECT alle_schueler FROM faecher WHERE id = ?', [neuFachId])
      if (f.alle_schueler) continue   // "alle"-Fächer brauchen keine Junction-Zeilen
      const rows = await tx.select('SELECT schueler_id FROM fach_schueler WHERE fach_id = ?', [altFachId])
      for (const r of rows) {
        const neuSid = schuelerIdMapping[r.schueler_id]
        if (neuSid) await tx.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [neuFachId, neuSid])   // ausgeschiedene fehlen im Mapping → übersprungen
      }
    }

    return neuesSchuljahreId
  })
}

module.exports = { neuesSchuljahr }

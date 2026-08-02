// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Jahresabschluss – altes Schuljahr archivieren, neues anlegen,
// ausgewählte Klassen/Fächer vorrücken, Schüler:innen zuordnen. Reine DB-Logik
// in einer Transaktion. `db` pro Aufruf.

function neuesSchuljahr(db, { altesSchuljahreId, neueBezeichnung, klassen = null, schuelerZuordnungen }) {
  const tx = db.transaction(() => {
    // Altes Schuljahr archivieren
    db.prepare('UPDATE schuljahre SET archiviert = 1 WHERE id = ?').run(altesSchuljahreId)

    // Neues Schuljahr anlegen
    const neuesSchuljahr = db.prepare('INSERT INTO schuljahre (bezeichnung) VALUES (?)').run(neueBezeichnung)
    const neuesSchuljahreId = neuesSchuljahr.lastInsertRowid

    // Aktuelles Schuljahr persistieren, damit Kalender/Stundenplan/Ferien auch nach Neustart folgen
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run('schuljahr_aktuell', neueBezeichnung)

    const klasseIdMapping = {}
    const fachIdMapping = {}
    const schuelerIdMapping = {}

    // Auswahl der vorzurückenden Klassen/Fächer. Fehlt "klassen" (Alt-Aufrufer) → alle Klassen, alle Fächer.
    let auswahl = klassen
    if (!auswahl) {
      auswahl = db.prepare('SELECT id FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0').all(altesSchuljahreId)
        .map(k => ({ alteKlasseId: k.id, neuerName: null, fachIds: null }))   // fachIds null = alle Fächer
    }

    for (const kSel of auswahl) {
      const alteKlasse = db.prepare('SELECT * FROM klassen WHERE id = ?').get(kSel.alteKlasseId)
      if (!alteKlasse) continue
      const neueKlasse = db.prepare('INSERT INTO klassen (schuljahr_id, name, reihenfolge) VALUES (?, ?, ?)')
        .run(neuesSchuljahreId, kSel.neuerName ?? alteKlasse.name, alteKlasse.reihenfolge)
      klasseIdMapping[alteKlasse.id] = neueKlasse.lastInsertRowid

      // Nur ausgewählte Fächer übernehmen (fachIds null = alle)
      const fachFilter = Array.isArray(kSel.fachIds) ? new Set(kSel.fachIds) : null
      const alteFaecher = db.prepare('SELECT * FROM faecher WHERE klasse_id = ?').all(alteKlasse.id)
      for (const altesFach of alteFaecher) {
        if (fachFilter && !fachFilter.has(altesFach.id)) continue   // nicht angehakt → nicht vorrücken
        const nf = db.prepare('INSERT INTO faecher (klasse_id, name, reihenfolge, alle_schueler) VALUES (?, ?, ?, ?)')
          .run(neueKlasse.lastInsertRowid, altesFach.name, altesFach.reihenfolge, altesFach.alle_schueler ?? 1)
        fachIdMapping[altesFach.id] = nf.lastInsertRowid
      }
    }

    // Schüler:innen zuordnen (nur für vorgerückte Klassen; klasseIdMapping existiert nur für diese)
    for (const z of schuelerZuordnungen) {
      if (!klasseIdMapping[z.alteKlasseId]) continue   // Klasse nicht vorgerückt → Schüler:in bleibt im alten Jahr
      if (z.aktion === 'ausgeschieden') {
        db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(z.schuelerId)
      } else if (z.aktion === 'bleibt') {
        // Schüler:in in neuer Klasse anlegen
        const s = db.prepare('SELECT * FROM schueler WHERE id = ?').get(z.schuelerId)
        const ns = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)').run(klasseIdMapping[z.alteKlasseId], s.vorname, s.nachname, s.reihenfolge)
        schuelerIdMapping[z.schuelerId] = ns.lastInsertRowid
        db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(z.schuelerId)
      }
    }

    // Fach-Zuordnung (Gruppenfächer) ins neue Jahr übernehmen, IDs remappt (nur "bleibt"-Schüler:innen).
    for (const [altFachId, neuFachId] of Object.entries(fachIdMapping)) {
      const f = db.prepare('SELECT alle_schueler FROM faecher WHERE id = ?').get(neuFachId)
      if (f.alle_schueler) continue   // "alle"-Fächer brauchen keine Junction-Zeilen
      const rows = db.prepare('SELECT schueler_id FROM fach_schueler WHERE fach_id = ?').all(altFachId)
      const ins = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
      for (const r of rows) {
        const neuSid = schuelerIdMapping[r.schueler_id]
        if (neuSid) ins.run(neuFachId, neuSid)   // ausgeschiedene fehlen im Mapping → übersprungen
      }
    }

    return neuesSchuljahreId
  })

  return tx()
}

module.exports = { neuesSchuljahr }

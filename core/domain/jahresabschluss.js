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

    // Pre-Wechsel-Zustand des alten Jahres festhalten (VOR jeder Deaktivierung): welche Personen und
    // Mitgliedschaften waren beim Archivieren aktiv? „Archiv wiederherstellen" (schuljahre.js)
    // reaktiviert dann gezielt nur diese – und belebt keine davor soft-gelöschten (aktiv=0)
    // Schüler:innen wieder. Schlüssel-Konvention `archiv_reaktivierung_<schuljahrId>` (s. schuljahre.js).
    const aktiveSchuelerVorher = (await tx.select(
      'SELECT id FROM schueler WHERE aktiv = 1 AND klasse_id IN (SELECT id FROM klassen WHERE schuljahr_id = ?)',
      [altesSchuljahreId]
    )).map((r) => r.id)
    const aktiveMitgliederVorher = (await tx.select(
      'SELECT ks.klasse_id, ks.schueler_id FROM klassen_schueler ks JOIN klassen k ON ks.klasse_id = k.id WHERE ks.aktiv = 1 AND k.schuljahr_id = ?',
      [altesSchuljahreId]
    )).map((r) => [r.klasse_id, r.schueler_id])
    await tx.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)',
      [`archiv_reaktivierung_${altesSchuljahreId}`, JSON.stringify({ schueler: aktiveSchuelerVorher, mitglieder: aktiveMitgliederVorher })])

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
        // Farbe + LBVO-Gewichtungskonfiguration mitnehmen (analog klassen:duplizieren); Noten bleiben leer.
        const nf = await tx.execute(
          'INSERT INTO faecher (klasse_id, name, farbe, reihenfolge, alle_schueler, benotungssystem, gewichtung_sa, gewichtung_t, gewichtung_custom, gewichtung_ma, uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [neueKlasse.lastInsertRowid, altesFach.name, altesFach.farbe ?? null, altesFach.reihenfolge, altesFach.alle_schueler ?? 1, altesFach.benotungssystem ?? 'standard', altesFach.gewichtung_sa, altesFach.gewichtung_t, altesFach.gewichtung_custom, altesFach.gewichtung_ma, neueUuid()])
        fachIdMapping[altesFach.id] = nf.lastInsertRowid
      }
    }

    // Schüler:innen zuordnen (nur für vorgerückte Klassen; klasseIdMapping existiert nur für diese)
    for (const z of schuelerZuordnungen) {
      if (!klasseIdMapping[z.alteKlasseId]) continue   // Klasse nicht vorgerückt → Schüler:in bleibt im alten Jahr
      if (z.aktion === 'ausgeschieden') {
        await tx.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [z.schuelerId])
        await tx.execute('UPDATE klassen_schueler SET aktiv = 0 WHERE schueler_id = ?', [z.schuelerId])
      } else if (z.aktion === 'bleibt') {
        const neueKlasseId = klasseIdMapping[z.alteKlasseId]
        if (schuelerIdMapping[z.schuelerId]) {
          // Person wurde bereits (über eine andere vorgerückte Klasse) angelegt → nur zusätzliche
          // Mitgliedschaft ergänzen (ist_stammklasse=0), NICHT erneut als Person duplizieren.
          const nsid = schuelerIdMapping[z.schuelerId]
          const maxR = (await tx.selectOne('SELECT MAX(reihenfolge) as m FROM klassen_schueler WHERE klasse_id = ?', [neueKlasseId]))?.m ?? 0
          await tx.execute('INSERT OR IGNORE INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse) VALUES (?, ?, ?, 1, 0)', [neueKlasseId, nsid, maxR + 1])
        } else {
          // Neue Person-Zeile fürs neue Jahr (Phase 1). Übertragbare Personendaten mitnehmen
          // (Merkmale/Avatar/Stammdaten); Noten/Zeugnisdaten bleiben bewusst leer. SPF folgt unten.
          const s = await tx.selectOne('SELECT * FROM schueler WHERE id = ?', [z.schuelerId])
          const ns = await tx.execute(
            'INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, aktiv, lernschwaeche, legasthenie, avatar, geburtsdatum, strasse, plz, ort, telefon, email, notfallnummer, erziehungsberechtigte, abholberechtigte, anmerkungen, uuid) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [neueKlasseId, s.vorname, s.nachname, s.reihenfolge, s.lernschwaeche ?? 0, s.legasthenie ?? 0, s.avatar ?? null,
              s.geburtsdatum ?? null, s.strasse ?? null, s.plz ?? null, s.ort ?? null, s.telefon ?? null, s.email ?? null,
              s.notfallnummer ?? null, s.erziehungsberechtigte ?? null, s.abholberechtigte ?? null, s.anmerkungen ?? null, neueUuid()])
          schuelerIdMapping[z.schuelerId] = ns.lastInsertRowid
          await tx.execute('INSERT INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse) VALUES (?, ?, ?, 1, 1)', [neueKlasseId, ns.lastInsertRowid, s.reihenfolge])
          await tx.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [z.schuelerId])
          await tx.execute('UPDATE klassen_schueler SET aktiv = 0 WHERE schueler_id = ?', [z.schuelerId])
        }
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

    // SPF (fachbezogen) ins neue Jahr übernehmen: nur vorgerückte Personen + vorgerückte Fächer.
    // Danach das Summen-Flag der neuen Person ableiten (statt SPF verloren gehen zu lassen).
    for (const [altSid, neuSid] of Object.entries(schuelerIdMapping)) {
      const spfRows = await tx.select('SELECT fach_id FROM schueler_fach_spf WHERE schueler_id = ?', [altSid])
      let hatSpf = false
      for (const r of spfRows) {
        const neuFid = fachIdMapping[r.fach_id]
        if (neuFid) { await tx.execute('INSERT OR IGNORE INTO schueler_fach_spf (schueler_id, fach_id) VALUES (?, ?)', [neuSid, neuFid]); hatSpf = true }
      }
      if (hatSpf) await tx.execute('UPDATE schueler SET spf = 1 WHERE id = ?', [neuSid])
    }

    return neuesSchuljahreId
  })
}

module.exports = { neuesSchuljahr }

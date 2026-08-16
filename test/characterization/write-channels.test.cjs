// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Charakterisierungstests – schreibende IPC-Kanäle (Phase 0).
//
// Jeder Kanal wird gegen eine FRISCHE Fixture-Kopie ausgeführt; danach wird der
// Rückgabewert UND der Zustand der betroffenen Tabellen als Snapshot verglichen.
// Zeitstempel-Spalten werden normalisiert (siehe harness.snapshotTables).
//
// Ausführen:        npm run test:core
// Snapshots neu:    npm run test:core:update   (nur bewusst – Verhalten geändert!)

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { createHarness, ladeSeed } = require('../helpers/harness.cjs')

// name: eindeutiger Schlüssel/Testtitel · channel/args: Aufruf · tables: Zustand danach
const CASES = [
  { name: 'einstellungen:set', channel: 'einstellungen:set', args: ['theme', 'dark'], tables: ['einstellungen'] },
  { name: 'klassen:create', channel: 'klassen:create', args: [{ schuljahrId: 1, name: '4D', farbe: '#22d3ee', teamsLink: null, istVorlage: 0 }], tables: ['klassen'] },
  // Sonderfall: manuelle Kaskade beim Löschen einer Klasse (Klasse 1 = voller Baum).
  { name: 'klassen:delete (Kaskade)', channel: 'klassen:delete', args: [1], tables: ['klassen', 'faecher', 'schueler', 'eintraege', 'zeugnisnoten', 'notizen'] },
  { name: 'faecher:create', channel: 'faecher:create', args: [{ klasseId: 1, name: 'Englisch', farbe: null, benotungssystem: 'standard', alleSchueler: 1 }], tables: ['faecher'] },
  { name: 'schueler:create', channel: 'schueler:create', args: [{ klasseId: 1, vorname: 'Greta', nachname: 'Novak', fachIds: [1] }], tables: ['schueler', 'fach_schueler'] },
  { name: 'spalten:create', channel: 'spalten:create', args: [{ fachId: 1, semester: 2, kategorie: 'SA', kuerzel: 'SA2', datum: '2026-03-10', notiz: null }], tables: ['spalten'] },
  { name: 'eintraege:set (neu)', channel: 'eintraege:set', args: [1, 3, '4'], tables: ['eintraege', 'eintraege_verlauf'] },
  { name: 'eintraege:set (update)', channel: 'eintraege:set', args: [1, 1, '1'], tables: ['eintraege', 'eintraege_verlauf'] },
  { name: 'notizen:set', channel: 'notizen:set', args: [3, 1, 'Fleißig im Unterricht.'], tables: ['notizen'] },
  // Sonderfall: setzt aktuelles Niveau UND schreibt einen Historie-Eintrag.
  { name: 'niveau:set', channel: 'niveau:set', args: [1, 3, 'ST', '2026-02-01'], tables: ['schueler_niveau', 'schueler_niveau_historie'] },
  { name: 'termine:create', channel: 'termine:create', args: [{ titel: 'Sprechtag', datum: '2025-12-01', uhrzeit: '10:00', bisUhrzeit: '11:00', notiz: null, klasseId: 1, schuljahrId: 1, stundeId: null }], tables: ['termine'] },
  { name: 'termine:update', channel: 'termine:update', args: [1, { titel: 'Elternabend (verschoben)', datum: '2025-10-21', uhrzeit: '18:30', bisUhrzeit: '20:00', notiz: 'Aula', klasseId: 1, stundeId: null }], tables: ['termine'] },
  { name: 'todos:create', channel: 'todos:create', args: [{ titel: 'Kopien vorbereiten', klasseId: 1, fachId: 1, faelligkeit: '2025-11-01', erinnerung: null }], tables: ['todos'] },
  { name: 'todos:toggleErledigt', channel: 'todos:toggleErledigt', args: [1], tables: ['todos'] },
  { name: 'stundenplan:create', channel: 'stundenplan:create', args: [{ wochentag: 4, stundeId: 2, fachId: 1, wochenIntervall: 1 }], tables: ['stundenplan'] },
  // Sonderfall: Ziel-Slot belegt → Tausch der beiden Stunden (transaktional).
  { name: 'stundenplan:verschieben (Tausch)', channel: 'stundenplan:verschieben', args: [1, 1, 2], tables: ['stundenplan'] },

  // ── Schuljahre / Klassen / Fächer ──────────────────────────────────────────
  { name: 'schuljahre:create', channel: 'schuljahre:create', args: ['2026/27'], tables: ['schuljahre'] },
  // Letztes Archiv (SJ 2) wird wieder aktuell, SJ 1 wandert ins Archiv (Tausch, nichts gelöscht);
  // Schüler:innen des nun archivierten SJ 1 werden deaktiviert.
  { name: 'schuljahre:letztesArchivWiederherstellen', channel: 'schuljahre:letztesArchivWiederherstellen', args: [], tables: ['schuljahre', 'schueler'] },
  // Archiviertes Schuljahr (SJ 2) endgültig löschen.
  { name: 'schuljahre:loeschen', channel: 'schuljahre:loeschen', args: [2], tables: ['schuljahre'] },
  { name: 'klassen:rename', channel: 'klassen:rename', args: [1, '1A neu'], tables: ['klassen'] },
  { name: 'klassen:setFarbe', channel: 'klassen:setFarbe', args: [1, '#000000'], tables: ['klassen'] },
  { name: 'klassen:setTeamsLink', channel: 'klassen:setTeamsLink', args: [1, 'https://teams/1a'], tables: ['klassen'] },
  { name: 'klassen:setIstKv', channel: 'klassen:setIstKv', args: [2, 1], tables: ['klassen'] },
  { name: 'klassen:setSortierung', channel: 'klassen:setSortierung', args: [1, 'vorname'], tables: ['klassen'] },
  { name: 'klassen:reorder', channel: 'klassen:reorder', args: [[{ id: 1, reihenfolge: 3 }, { id: 2, reihenfolge: 1 }, { id: 3, reihenfolge: 2 }]], tables: ['klassen'] },
  { name: 'faecher:rename', channel: 'faecher:rename', args: [1, 'Deutsch neu'], tables: ['faecher'] },
  { name: 'faecher:setFarbe', channel: 'faecher:setFarbe', args: [1, '#abcdef'], tables: ['faecher'] },
  { name: 'faecher:setBenotungssystem', channel: 'faecher:setBenotungssystem', args: [1, 'punkte'], tables: ['faecher'] },
  { name: 'faecher:resetGewichtung', channel: 'faecher:resetGewichtung', args: [1], tables: ['faecher'] },
  { name: 'faecher:updateGewichtung', channel: 'faecher:updateGewichtung', args: [1, { gewichtungSa: 3, gewichtungT: 1, gewichtungCustom: 1, maMaxEinfluss: 0.5, hueMaxEinfluss: 0.5 }], tables: ['faecher'] },
  { name: 'faecher:setSchueler', channel: 'faecher:setSchueler', args: [1, { alle: false, schuelerIds: [1, 2] }], tables: ['faecher', 'fach_schueler'] },
  { name: 'faecher:delete', channel: 'faecher:delete', args: [3], tables: ['faecher'] },

  // ── Schüler:innen ──────────────────────────────────────────────────────────
  { name: 'schueler:update', channel: 'schueler:update', args: [1, { vorname: 'Anna-Maria', nachname: 'Bauer', lernschwaeche: 1 }], tables: ['schueler'] },
  { name: 'schueler:setAvatar', channel: 'schueler:setAvatar', args: [1, 'DSK1|test'], tables: ['schueler'] },
  { name: 'schueler:reorder', channel: 'schueler:reorder', args: [[{ id: 1, reihenfolge: 9 }, { id: 2, reihenfolge: 1 }]], tables: ['schueler'] },
  { name: 'schueler:delete', channel: 'schueler:delete', args: [6], tables: ['schueler'] },

  // ── Spalten / Einträge / Zeugnisnoten ──────────────────────────────────────
  { name: 'spalten:update', channel: 'spalten:update', args: [1, { kuerzel: 'SA1x', datum: '2025-10-16', notiz: 'geändert' }], tables: ['spalten'] },
  { name: 'spalten:delete', channel: 'spalten:delete', args: [2], tables: ['spalten', 'eintraege'] },
  { name: 'spalten:toggleEingeklappt', channel: 'spalten:toggleEingeklappt', args: [1], tables: ['spalten'] },
  { name: 'spalten:setEingeklappt', channel: 'spalten:setEingeklappt', args: [[1, 2], 1], tables: ['spalten'] },
  { name: 'spalten:sortByKategorie', channel: 'spalten:sortByKategorie', args: [1, 1], tables: ['spalten'] },
  { name: 'spalten:sortChronologisch', channel: 'spalten:sortChronologisch', args: [1, 1], tables: ['spalten'] },
  { name: 'eintraege:setKommentar', channel: 'eintraege:setKommentar', args: [1, 1, 'gut gemacht'], tables: ['eintraege', 'eintraege_verlauf'] },
  { name: 'zeugnisnoten:setManuell', channel: 'zeugnisnoten:setManuell', args: [1, 3, '2'], tables: ['zeugnisnoten'] },
  { name: 'zeugnisnoten:clearManuell', channel: 'zeugnisnoten:clearManuell', args: [1, 2], tables: ['zeugnisnoten'] },
  { name: 'zeugnisnoten:berechne', channel: 'zeugnisnoten:berechne', args: [1, 1], tables: ['zeugnisnoten'] },
  { name: 'zeugnisnoten:berechneFach', channel: 'zeugnisnoten:berechneFach', args: [1], tables: ['zeugnisnoten'] },
  { name: 'gewichtungGlobal:update', channel: 'gewichtungGlobal:update', args: ['SA', 4], tables: ['gewichtung_global'] },
  { name: 'noten:rechneAllesNeu', channel: 'noten:rechneAllesNeu', args: [], tables: ['zeugnisnoten'] },

  // ── Rezenz (§ 20 LBVO) pro (Fach, Schüler:in) ──────────────────────────────
  { name: 'rezenz:set', channel: 'rezenz:set', args: [1, 3, 2], tables: ['schueler_rezenz'] },
  { name: 'rezenz:setKlasse', channel: 'rezenz:setKlasse', args: [1, 1.5], tables: ['schueler_rezenz'] },

  // ── Niveau / Kompetenzen ───────────────────────────────────────────────────
  { name: 'niveau:deleteHistorie', channel: 'niveau:deleteHistorie', args: [1, 2, '2026-02-01'], tables: ['schueler_niveau_historie'] },
  { name: 'kompetenzbereiche:create', channel: 'kompetenzbereiche:create', args: [1, 'Hören', 'Zuhören und verstehen'], tables: ['kompetenzbereiche'] },
  { name: 'kompetenzbereiche:update', channel: 'kompetenzbereiche:update', args: [1, { titel: 'Lesen neu', beschreibung: 'geändert' }], tables: ['kompetenzbereiche'] },
  { name: 'kompetenzbereiche:delete', channel: 'kompetenzbereiche:delete', args: [2], tables: ['kompetenzbereiche', 'schueler_kompetenzen'] },
  { name: 'kompetenzbereiche:reorder', channel: 'kompetenzbereiche:reorder', args: [[2, 1]], tables: ['kompetenzbereiche'] },
  { name: 'schuelerKompetenzen:set', channel: 'schuelerKompetenzen:set', args: [1, 1, 2, 'Notiz'], tables: ['schueler_kompetenzen'] },

  // ── Stundenzeiten / Stundenplan ────────────────────────────────────────────
  { name: 'stundenzeiten:update', channel: 'stundenzeiten:update', args: [1, { beginn: '08:00', ende: '08:50' }], tables: ['stundenzeiten'] },
  { name: 'stundenzeiten:create', channel: 'stundenzeiten:create', args: [], tables: ['stundenzeiten'] },
  { name: 'stundenzeiten:delete', channel: 'stundenzeiten:delete', args: [4], tables: ['stundenzeiten'] },
  { name: 'stundenplan:update', channel: 'stundenplan:update', args: [1, { fachId: 2, wochenIntervall: 1 }], tables: ['stundenplan'] },
  { name: 'stundenplan:delete', channel: 'stundenplan:delete', args: [4], tables: ['stundenplan'] },

  // ── Wochen-Planung ─────────────────────────────────────────────────────────
  { name: 'stundenPlanung:save', channel: 'stundenPlanung:save', args: [1, '2025-10-20', 'Titel', 'Inhalt', 0, null, null, null], tables: ['stunden_planung'] },
  { name: 'stundenPlanung:removeEntfall', channel: 'stundenPlanung:removeEntfall', args: [1, '2025-10-13'], tables: ['stunden_planung'] },
  { name: 'stundenPlanung:delete', channel: 'stundenPlanung:delete', args: [1, '2025-10-13'], tables: ['stunden_planung'] },

  // ── Supplierstunden ────────────────────────────────────────────────────────
  { name: 'supplierstunden:create', channel: 'supplierstunden:create', args: [{ wocheDatum: '2025-10-20', wochentag: 1, stundeId: 1, klasseText: '2B', fachText: 'Musik', notiz: null }], tables: ['supplierstunden'] },
  { name: 'supplierstunden:update', channel: 'supplierstunden:update', args: [1, { fachText: 'Deutsch', klasseText: '1A', notiz: 'x', titel: 'Lesen', inhalt: null, hueText: null, hueFristDatum: null, link: null }], tables: ['supplierstunden'] },
  { name: 'supplierstunden:delete', channel: 'supplierstunden:delete', args: [1], tables: ['supplierstunden'] },

  // ── Todos / Termine / Ferien ───────────────────────────────────────────────
  { name: 'todos:update', channel: 'todos:update', args: [1, { titel: 'Geändert', klasseId: 1, fachId: 1, faelligkeit: '2025-10-20', erinnerung: null }], tables: ['todos'] },
  { name: 'todos:delete', channel: 'todos:delete', args: [2], tables: ['todos'] },
  { name: 'termine:delete', channel: 'termine:delete', args: [2], tables: ['termine'] },
  { name: 'customFerien:save', channel: 'customFerien:save', args: [1, [{ name: 'Fenstertag', von: '2025-11-04', bis: '2025-11-04' }]], tables: ['custom_ferien'] },

  // ── Jahresplanung ──────────────────────────────────────────────────────────
  { name: 'jahresplanung:create', channel: 'jahresplanung:create', args: [{ fachId: 1, titel: 'Lyrik', inhalt: 'Gedichte', lernziele: '', kompetenzen: '', datumVon: '2025-12-01', datumBis: '2025-12-20', farbe: '#000' }], tables: ['jahresplanung_abschnitte'] },
  { name: 'jahresplanung:update', channel: 'jahresplanung:update', args: [1, { titel: 'Balladen neu', inhalt: 'x', lernziele: '', kompetenzen: '', datumVon: '2025-10-01', datumBis: '2025-10-31', farbe: '#fb6936' }], tables: ['jahresplanung_abschnitte'] },
  { name: 'jahresplanung:delete', channel: 'jahresplanung:delete', args: [2], tables: ['jahresplanung_abschnitte'] },
  { name: 'jahresplanung:swap', channel: 'jahresplanung:swap', args: [1, 2], tables: ['jahresplanung_abschnitte'] },

  // ── Sitzplan ───────────────────────────────────────────────────────────────
  { name: 'sitzplan:createTisch', channel: 'sitzplan:createTisch', args: [1, 'einzel', 300, 300], tables: ['sitzplan_tische'] },
  { name: 'sitzplan:moveTisch', channel: 'sitzplan:moveTisch', args: [1, 150, 160], tables: ['sitzplan_tische'] },
  { name: 'sitzplan:setRotation', channel: 'sitzplan:setRotation', args: [1, 90], tables: ['sitzplan_tische'] },
  { name: 'sitzplan:assignSchueler', channel: 'sitzplan:assignSchueler', args: [1, 3], tables: ['sitzplan_sitzplaetze'] },
  { name: 'sitzplan:deleteTisch', channel: 'sitzplan:deleteTisch', args: [2], tables: ['sitzplan_tische', 'sitzplan_sitzplaetze'] },
  { name: 'sitzplan:duplicateTisch', channel: 'sitzplan:duplicateTisch', args: [1, 1, 400, 400], tables: ['sitzplan_tische', 'sitzplan_sitzplaetze'] },

  // ── Klassenvorstand (KV) ───────────────────────────────────────────────────
  { name: 'kv:jahresaufgaben:createTemplate', channel: 'kv:jahresaufgaben:createTemplate', args: [{ monat: 11, titel: 'Neue Aufgabe', beschreibung: 'x', kategorie: 'organisation' }], tables: ['kv_jahresaufgaben'] },
  { name: 'kv:jahresaufgaben:updateTemplate', channel: 'kv:jahresaufgaben:updateTemplate', args: [1, { monat: 9, titel: 'Klassenliste neu', beschreibung: 'y', rechtsbezug: '§ 20 SchUG', kategorie: 'organisation' }], tables: ['kv_jahresaufgaben'] },
  { name: 'kv:jahresaufgaben:deleteTemplate', channel: 'kv:jahresaufgaben:deleteTemplate', args: [2], tables: ['kv_jahresaufgaben'] },
  { name: 'kv:jahresaufgaben:setStatus', channel: 'kv:jahresaufgaben:setStatus', args: [1, 1, 1, '2025-09-20', 'Notiz'], tables: ['kv_jahresaufgaben_status'] },
  { name: 'kv:wochenaufgaben:createTemplate', channel: 'kv:wochenaufgaben:createTemplate', args: [{ titel: 'Neue Wochenaufgabe', rechtsbezug: null }], tables: ['kv_wochenaufgaben'] },
  { name: 'kv:wochenaufgaben:updateTemplate', channel: 'kv:wochenaufgaben:updateTemplate', args: [1, { titel: 'Absenzen neu', rechtsbezug: null }], tables: ['kv_wochenaufgaben'] },
  { name: 'kv:wochenaufgaben:deleteTemplate', channel: 'kv:wochenaufgaben:deleteTemplate', args: [1], tables: ['kv_wochenaufgaben'] },
  { name: 'kv:wochenaufgaben:setStatus', channel: 'kv:wochenaufgaben:setStatus', args: [1, 1, 1, 39, 2025, '2025-09-26', null], tables: ['kv_wochenaufgaben_status'] },
  { name: 'kv:trigger:create', channel: 'kv:trigger:create', args: [{ klasseId: 1, schuelerId: 2, typ: 'verhalten', schweregrad: 'info', ausloeser: 'x', beschreibung: 'y' }], tables: ['kv_trigger'] },
  { name: 'kv:trigger:reagieren', channel: 'kv:trigger:reagieren', args: [1, 'Gespräch geführt'], tables: ['kv_trigger'] },
  { name: 'kv:trigger:delete', channel: 'kv:trigger:delete', args: [1], tables: ['kv_trigger'] },
  { name: 'kv:aktenvermerke:create', channel: 'kv:aktenvermerke:create', args: [{ schuelerId: 1, klasseId: 1, datum: '2025-10-10', typ: 'Lob', titel: 'Gut', beschreibung: 'x' }], tables: ['kv_aktenvermerke'] },
  { name: 'kv:aktenvermerke:update', channel: 'kv:aktenvermerke:update', args: [1, { datum: '2025-10-02', typ: 'Vorfall', titel: 'Störung neu', beschreibung: 'z', zeugen: null, folgemassnahme: null }], tables: ['kv_aktenvermerke'] },
  { name: 'kv:aktenvermerke:delete', channel: 'kv:aktenvermerke:delete', args: [1], tables: ['kv_aktenvermerke'] },
  { name: 'kv:elternkontakte:create', channel: 'kv:elternkontakte:create', args: [{ schuelerId: 1, datum: '2025-10-11', art: 'E-Mail', initiator: 'Eltern', thema: 'x', inhalt: null, erledigt: 0 }], tables: ['kv_elternkontakte'] },
  { name: 'kv:elternkontakte:update', channel: 'kv:elternkontakte:update', args: [1, { datum: '2025-10-03', art: 'Telefonat', initiator: 'Lehrperson', thema: 'Verhalten neu', inhalt: 'y', erledigt: 1 }], tables: ['kv_elternkontakte'] },
  { name: 'kv:elternkontakte:setErledigt', channel: 'kv:elternkontakte:setErledigt', args: [2, 1], tables: ['kv_elternkontakte'] },
  { name: 'kv:elternkontakte:delete', channel: 'kv:elternkontakte:delete', args: [1], tables: ['kv_elternkontakte'] },
  { name: 'kv:fehlstunden:create', channel: 'kv:fehlstunden:create', args: [{ schuelerId: 2, datum: '2025-10-12', stunden: 1, entschuldigt: 0, grund: null }], tables: ['kv_fehlstunden', 'kv_trigger'] },
  { name: 'kv:fehlstunden:update', channel: 'kv:fehlstunden:update', args: [1, { datum: '2025-10-04', stunden: 3, entschuldigt: 1, grund: 'Krankheit' }], tables: ['kv_fehlstunden'] },
  { name: 'kv:fehlstunden:delete', channel: 'kv:fehlstunden:delete', args: [1], tables: ['kv_fehlstunden'] },

  // ── Weitere DB-Writes (Vorlagen, Import, Duplizieren, Planung übertragen) ──
  { name: 'kompetenzbereiche:initVorlagen', channel: 'kompetenzbereiche:initVorlagen', args: [2, 'Musik'], tables: ['kompetenzbereiche'] },
  { name: 'stundenzeiten:saveAll', channel: 'stundenzeiten:saveAll', args: [[{ id: 1, beginn: '07:55', ende: '08:45' }, { beginn: '08:50', ende: '09:40' }]], tables: ['stundenzeiten'] },
  { name: 'schueler:importBatch', channel: 'schueler:importBatch', args: [1, [{ vorname: 'Ida', nachname: 'Wolf' }, { vorname: 'Jan', nachname: 'Vogel' }], [1]], tables: ['schueler', 'fach_schueler'] },
  { name: 'stundenPlanung:setEntfall', channel: 'stundenPlanung:setEntfall', args: [1, '2025-10-20', false, []], tables: ['stunden_planung'] },
  { name: 'jahresplanung:importVonFach', channel: 'jahresplanung:importVonFach', args: [1, 3, {}], tables: ['jahresplanung_abschnitte'] },
  { name: 'jahresplanung:anwendenAufFaecher', channel: 'jahresplanung:anwendenAufFaecher', args: [1, [3], {}], tables: ['jahresplanung_abschnitte'] },
  { name: 'klassen:duplizieren', channel: 'klassen:duplizieren', args: [{ klasseId: 1, neuerName: '1A Kopie', mitPlanung: false, mitSchueler: true }], tables: ['klassen', 'faecher', 'schueler'] },

  // ── Undo (leerer Stack → deterministisch) ──────────────────────────────────
  { name: 'undo:state', channel: 'undo:state', args: [], tables: [] },
  { name: 'undo:execute', channel: 'undo:execute', args: [], tables: [] },
  { name: 'undo:redo', channel: 'undo:redo', args: [], tables: [] },
]

const SNAP_PATH = path.join(__dirname, 'snapshots', 'write-channels.json')
const UPDATE = process.env.SNAPSHOT_UPDATE === '1'
const collected = {}

// Beim Aktualisieren erst nach allen Tests schreiben.
process.on('exit', () => {
  if (UPDATE && Object.keys(collected).length) {
    fs.mkdirSync(path.dirname(SNAP_PATH), { recursive: true })
    fs.writeFileSync(SNAP_PATH, JSON.stringify(collected, null, 2) + '\n', 'utf8')
  }
})

for (const c of CASES) {
  test(c.name, async () => {
    const h = await createHarness({ seedSql: ladeSeed() })
    try {
      const ret = await h.callHandler(c.channel, ...c.args)
      // JSON-Roundtrip: verwirft undefined-Properties konsistent mit dem Snapshot.
      const actual = JSON.parse(JSON.stringify({ ret: ret === undefined ? null : ret, state: h.snapshotTables(c.tables) }))
      if (UPDATE) { collected[c.name] = actual; return }
      const expected = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'))
      assert.deepStrictEqual(actual, expected[c.name])
    } finally {
      h.cleanup()
    }
  })
}

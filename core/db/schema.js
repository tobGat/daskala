// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern: Datenbank-Schema (CREATE TABLE + Migrationen + Vor-Belegung) als
// electron-freie Funktion. `db` ist eine offene better-sqlite3-kompatible
// Verbindung (Pragmas/Verbindungsaufbau bleiben in der Plattform-Schicht).
// `deps` = { logError }.

// Aktuelle Schema-Version. Erhoehen bei neuer EINMALIGER Migration (Daten-Umbau/Rebuild);
// reine Spalten-Ergaenzungen laufen idempotent ueber spalteErgaenzen().
const SCHEMA_VERSION = 6

// ─── Schema als Daten (Portierung Phase 2.3) ─────────────────────────────────
//
// `MIGRATIONS` beschreibt das Schema deklarativ als [{ version, description, sql }].
// Diese Form brauchen die mobilen Zielrahmen (Capacitor `@capacitor-community/sqlite`,
// Tauri `tauri_plugin_sql::Migration`), die Migrationen versionsweise auf eine FRISCHE
// DB anwenden.
//
// Version 1 ist die konsolidierte Baseline: jede Tabelle bereits in ihrer heutigen
// Endform (die per `spalteErgaenzen` nachgerüsteten Spalten sind hier direkt in die
// CREATE-Statements eingearbeitet). Für den Desktop bleibt `applySchema` unten die
// Wahrheit; es kennt zusätzlich den inkrementellen Migrationspfad bestehender
// Produktiv-Datenbanken. Ein Paritätstest (test/characterization/schema-as-data)
// stellt sicher, dass beide Wege exakt dasselbe Endschema erzeugen – kein Drift.
const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS einstellungen (
      schluessel TEXT PRIMARY KEY,
      wert TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS schuljahre (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bezeichnung TEXT NOT NULL,
      archiviert INTEGER DEFAULT 0,
      start_datum TEXT,
      end_datum TEXT,
      uuid TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS klassen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schuljahr_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      farbe TEXT,
      teams_link TEXT,
      sortierung TEXT DEFAULT 'nachname',
      ist_kv INTEGER DEFAULT 0,
      ist_vorlage INTEGER DEFAULT 0,
      uuid TEXT,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id)
    )`,
  `CREATE TABLE IF NOT EXISTS faecher (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      gewichtung_sa REAL,
      gewichtung_t REAL,
      gewichtung_ma REAL,
      gewichtung_hue REAL,
      gewichtung_custom REAL,
      gewichtung_man REAL,
      ma_max_einfluss REAL,
      hue_max_einfluss REAL,
      farbe TEXT,
      ma_hue_max_einfluss REAL,
      benotungssystem TEXT DEFAULT 'standard',
      alle_schueler INTEGER DEFAULT 1,
      uuid TEXT,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS schueler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      vorname TEXT NOT NULL,
      nachname TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      lernschwaeche INTEGER DEFAULT 0,
      legasthenie INTEGER DEFAULT 0,
      spf INTEGER DEFAULT 0,
      avatar TEXT,
      geburtsdatum TEXT,
      strasse TEXT,
      plz TEXT,
      ort TEXT,
      telefon TEXT,
      email TEXT,
      notfallnummer TEXT,
      erziehungsberechtigte TEXT,
      abholberechtigte TEXT,
      anmerkungen TEXT,
      uuid TEXT,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS spalten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      semester INTEGER NOT NULL DEFAULT 1,
      kategorie TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      datum TEXT,
      reihenfolge INTEGER DEFAULT 0,
      eingeklappt INTEGER DEFAULT 0,
      notiz TEXT,
      ma_stufen INTEGER DEFAULT 2,
      ma_symbol TEXT DEFAULT 'pm',
      ma_symbole TEXT,
      uuid TEXT,
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    )`,
  `CREATE TABLE IF NOT EXISTS eintraege (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spalte_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      wert TEXT DEFAULT '',
      kommentar TEXT,
      uuid TEXT,
      UNIQUE(spalte_id, schueler_id),
      FOREIGN KEY (spalte_id) REFERENCES spalten(id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id)
    )`,
  `CREATE TABLE IF NOT EXISTS eintraege_verlauf (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id       INTEGER,
      spalte_id     INTEGER NOT NULL,
      schueler_id   INTEGER NOT NULL,
      wert_alt      TEXT,
      wert_neu      TEXT,
      kommentar_alt TEXT,
      kommentar_neu TEXT,
      zeitstempel   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      aktion        TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS zeugnisnoten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      note_berechnet REAL,
      note_manuell INTEGER,
      s1_eingerechnet INTEGER DEFAULT 0,
      uuid TEXT,
      UNIQUE(fach_id, schueler_id, semester),
      FOREIGN KEY (fach_id) REFERENCES faecher(id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id)
    )`,
  `CREATE TABLE IF NOT EXISTS notizen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      text TEXT DEFAULT '',
      uuid TEXT,
      UNIQUE(schueler_id, fach_id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    )`,
  `CREATE TABLE IF NOT EXISTS gewichtung_global (
      kategorie TEXT PRIMARY KEY,
      gewichtung REAL NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS stundenzeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stunde INTEGER NOT NULL,
      beginn TEXT NOT NULL,
      ende TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS stundenplan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wochentag INTEGER NOT NULL,
      stunde_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      wochen_intervall INTEGER DEFAULT 1,
      anker_datum TEXT,
      FOREIGN KEY (stunde_id) REFERENCES stundenzeiten(id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    )`,
  `CREATE TABLE IF NOT EXISTS stunden_planung (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stundenplan_id INTEGER NOT NULL,
      woche_datum TEXT NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT NOT NULL DEFAULT '',
      musizieren INTEGER NOT NULL DEFAULT 0,
      hue_text TEXT,
      hue_frist_datum TEXT,
      link TEXT,
      entfall INTEGER DEFAULT 0,
      FOREIGN KEY (stundenplan_id) REFERENCES stundenplan(id) ON DELETE CASCADE,
      UNIQUE(stundenplan_id, woche_datum)
    )`,
  `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titel TEXT NOT NULL,
      erledigt INTEGER DEFAULT 0,
      klasse_id INTEGER,
      fach_id INTEGER,
      faelligkeit TEXT,
      erinnerung TEXT,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE SET NULL
    )`,
  `CREATE TABLE IF NOT EXISTS fach_schueler (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  // Klassen-Mitgliedschaft (n:m): eine Schüler:in kann mehreren Klassen angehören.
  // reihenfolge/aktiv gelten PRO Klasse; ist_stammklasse = KV-/Anzeige-Default (≤1 pro Schuljahr).
  // Identität über den PK (klasse_id, schueler_id) bzw. die Entitäts-UUIDs – keine eigene uuid nötig.
  `CREATE TABLE IF NOT EXISTS klassen_schueler (
      klasse_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      ist_stammklasse INTEGER DEFAULT 0,
      PRIMARY KEY (klasse_id, schueler_id),
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  // SPF (sonderpädagogischer Förderbedarf) PRO Fach: eine Person kann SPF nur in bestimmten Fächern
  // haben. Vorhandene Zeile = SPF in diesem Fach. schueler.spf bleibt als Summen-Flag (≥1 Fach).
  `CREATE TABLE IF NOT EXISTS schueler_fach_spf (
      schueler_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      PRIMARY KEY (schueler_id, fach_id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS schueler_niveau (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau TEXT NOT NULL DEFAULT 'AHS',
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS schueler_niveau_historie (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau TEXT NOT NULL,
      gueltig_ab TEXT NOT NULL,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS schueler_rezenz (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      faktor REAL NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  // Manuelle Mitarbeitsnote (§ 4 Abs. 2 LBVO – Gesamtbeurteilung): überschreibt den berechneten
  // Teilnoten-Schnitt. note = interner Wert (1–7, inkl. Niveau-Offset), analog zeugnisnoten.note_manuell.
  `CREATE TABLE IF NOT EXISTS schueler_ma_note (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      note INTEGER NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  // Individuelle Notengewichtung pro (Fach, Schüler:in). Fehlt eine Zeile, gilt die Fach- bzw.
  // globale Gewichtung. Werte als Anteile 0..1 (wie faecher.gewichtung_*).
  `CREATE TABLE IF NOT EXISTS schueler_gewichtung (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      gewichtung_sa REAL,
      gewichtung_t REAL,
      gewichtung_custom REAL,
      gewichtung_ma REAL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS termine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titel TEXT NOT NULL,
      datum TEXT NOT NULL,
      uhrzeit TEXT,
      notiz TEXT,
      klasse_id INTEGER,
      schuljahr_id INTEGER NOT NULL,
      stunde_id INTEGER,
      bis_uhrzeit TEXT,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE SET NULL,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS custom_ferien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schuljahr_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      von TEXT NOT NULL,
      bis TEXT NOT NULL,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS kompetenzbereiche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL,
      beschreibung TEXT,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS schueler_kompetenzen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kompetenzbereich_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau INTEGER NOT NULL DEFAULT 0,
      notiz TEXT,
      aktualisiert TEXT,
      UNIQUE(kompetenzbereich_id, schueler_id),
      FOREIGN KEY (kompetenzbereich_id) REFERENCES kompetenzbereiche(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS supplierstunden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      woche_datum TEXT NOT NULL,
      wochentag INTEGER NOT NULL,
      stunde_id INTEGER NOT NULL,
      klasse_text TEXT NOT NULL DEFAULT '',
      fach_text TEXT NOT NULL DEFAULT '',
      notiz TEXT,
      titel TEXT,
      inhalt TEXT,
      hue_text TEXT,
      hue_frist_datum TEXT,
      link TEXT,
      FOREIGN KEY (stunde_id) REFERENCES stundenzeiten(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS jahresplanung_abschnitte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT DEFAULT '',
      datum_von TEXT,
      datum_bis TEXT,
      farbe TEXT,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      material_ordner TEXT,
      lernziele TEXT,
      kompetenzen TEXT,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS abschnitt_materialien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abschnitt_id INTEGER NOT NULL,
      typ TEXT NOT NULL,
      ref TEXT NOT NULL,
      anzeigename TEXT,
      beschreibung TEXT,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      erstellt_am TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (abschnitt_id) REFERENCES jahresplanung_abschnitte(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS sitzplan_tische (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      typ TEXT NOT NULL DEFAULT 'einzel',
      x REAL NOT NULL DEFAULT 100,
      y REAL NOT NULL DEFAULT 100,
      fach_id INTEGER,
      rotation INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS sitzplan_sitzplaetze (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tisch_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      schueler_id INTEGER,
      UNIQUE(tisch_id, position),
      FOREIGN KEY (tisch_id) REFERENCES sitzplan_tische(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE SET NULL
    )`,
  `CREATE TABLE IF NOT EXISTS sitzplan_fach_zuweisungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitzplatz_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER,
      UNIQUE(sitzplatz_id, fach_id),
      FOREIGN KEY (sitzplatz_id) REFERENCES sitzplan_sitzplaetze(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE SET NULL
    )`,
  `CREATE TABLE IF NOT EXISTS kv_jahresaufgaben (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      monat        INTEGER NOT NULL,
      titel        TEXT NOT NULL,
      beschreibung TEXT,
      rechtsbezug  TEXT,
      kategorie    TEXT,
      sortierung   INTEGER DEFAULT 0,
      parent_id    INTEGER REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS kv_jahresaufgaben_status (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id   INTEGER NOT NULL REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE,
      schuljahr_id INTEGER NOT NULL REFERENCES schuljahre(id) ON DELETE CASCADE,
      klasse_id    INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      erledigt_am  TEXT,
      notiz        TEXT,
      UNIQUE(aufgabe_id, schuljahr_id, klasse_id)
    )`,
  `CREATE TABLE IF NOT EXISTS kv_wochenaufgaben (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titel       TEXT NOT NULL,
      rechtsbezug TEXT,
      sortierung  INTEGER DEFAULT 0,
      aktiv       INTEGER DEFAULT 1
    )`,
  `CREATE TABLE IF NOT EXISTS kv_wochenaufgaben_status (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id    INTEGER NOT NULL REFERENCES kv_wochenaufgaben(id) ON DELETE CASCADE,
      schuljahr_id  INTEGER NOT NULL REFERENCES schuljahre(id) ON DELETE CASCADE,
      klasse_id     INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      kalenderwoche INTEGER NOT NULL,
      jahr          INTEGER NOT NULL,
      erledigt_am   TEXT,
      notiz         TEXT,
      UNIQUE(aufgabe_id, klasse_id, kalenderwoche, jahr)
    )`,
  `CREATE TABLE IF NOT EXISTS kv_trigger (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id    INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      schueler_id  INTEGER REFERENCES schueler(id) ON DELETE CASCADE,
      typ          TEXT NOT NULL,
      schweregrad  TEXT NOT NULL DEFAULT 'info',
      ausloeser    TEXT,
      beschreibung TEXT,
      erstellt_am  TEXT DEFAULT (datetime('now', 'localtime')),
      reagiert_am  TEXT,
      reaktion     TEXT,
      archiviert   INTEGER DEFAULT 0
    )`,
  `CREATE TABLE IF NOT EXISTS kv_aktenvermerke (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id    INTEGER REFERENCES schueler(id) ON DELETE CASCADE,
      klasse_id      INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      datum          TEXT NOT NULL,
      typ            TEXT NOT NULL,
      titel          TEXT NOT NULL,
      beschreibung   TEXT NOT NULL,
      zeugen         TEXT,
      folgemassnahme TEXT,
      erstellt_am    TEXT DEFAULT (datetime('now', 'localtime'))
    )`,
  `CREATE TABLE IF NOT EXISTS kv_elternkontakte (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id INTEGER NOT NULL REFERENCES schueler(id) ON DELETE CASCADE,
      datum       TEXT NOT NULL,
      art         TEXT NOT NULL,
      initiator   TEXT NOT NULL,
      thema       TEXT NOT NULL,
      inhalt      TEXT,
      erledigt    INTEGER DEFAULT 1
    )`,
  `CREATE TABLE IF NOT EXISTS kv_fehlstunden (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id  INTEGER NOT NULL REFERENCES schueler(id) ON DELETE CASCADE,
      datum        TEXT NOT NULL,
      stunden      INTEGER NOT NULL,
      entschuldigt INTEGER NOT NULL DEFAULT 0,
      grund        TEXT
    )`,
]

const INDEX_DDL = [
  `CREATE INDEX IF NOT EXISTS idx_niveau_historie_lookup
      ON schueler_niveau_historie (fach_id, schueler_id, gueltig_ab)`,
  `CREATE INDEX IF NOT EXISTS idx_abschnitt_materialien_abschnitt
      ON abschnitt_materialien (abschnitt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_kv_trigger_klasse_archiv
      ON kv_trigger (klasse_id, archiviert)`,
  `CREATE INDEX IF NOT EXISTS idx_kv_aktenvermerke_klasse
      ON kv_aktenvermerke (klasse_id, datum DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_kv_fehlstunden_schueler
      ON kv_fehlstunden (schueler_id, datum)`,
  `CREATE INDEX IF NOT EXISTS idx_klassen_schueler_schueler
      ON klassen_schueler (schueler_id)`,
  `CREATE INDEX IF NOT EXISTS idx_schueler_fach_spf_fach
      ON schueler_fach_spf (fach_id)`,
  // UUID-Weiche (Phase 2.4): geräteübergreifend eindeutige Identität je Entität
  // für ein späteres Zusammenführen. UNIQUE-Index; mehrere NULL sind in SQLite
  // erlaubt, daher stören noch nicht befüllte Zeilen die Eindeutigkeit nicht.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_schuljahre_uuid ON schuljahre (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_klassen_uuid ON klassen (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_faecher_uuid ON faecher (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_schueler_uuid ON schueler (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_spalten_uuid ON spalten (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_eintraege_uuid ON eintraege (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_zeugnisnoten_uuid ON zeugnisnoten (uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notizen_uuid ON notizen (uuid)`,
]

// Deklaratives, versioniertes Schema für die mobilen Zielrahmen (siehe oben).
const MIGRATIONS = [
  {
    version: 1,
    description: 'Initiales Schema (Baseline, konsolidiert aus Desktop-Schema v1.x)',
    sql: [...TABLE_DDL, ...INDEX_DDL].map((s) => s.trim() + ';').join('\n\n'),
  },
  {
    version: 2,
    // LBVO v1.3: benotete Mitarbeit (MAN) als Default-Gewichtung seeden und Umstieg auf EINE
    // durchgehende Jahresnote (Slot semester=3) – die getrennten Semesternoten (Slots 1 & 2)
    // entfallen. Beide Statements sind idempotent (INSERT OR IGNORE / DELETE), daher beim
    // versions-losen Mobil-Bootstrap bei jedem Start unbedenklich. Fehlende SPALTEN
    // (faecher.gewichtung_man, spalten.ma_symbole) werden – da ALTER nicht idempotent ist –
    // separat in platform/capacitor/bootstrap.js per PRAGMA-Guard ergänzt.
    description: 'LBVO v1.3: MAN-Gewichtung seeden + eine durchgehende Jahresnote (Slots 1/2 entfernen)',
    sql: [
      "INSERT OR IGNORE INTO gewichtung_global (kategorie, gewichtung) VALUES ('MAN', 0.30);",
      'DELETE FROM zeugnisnoten WHERE semester IN (1, 2);',
    ].join('\n\n'),
  },
  {
    version: 3,
    // Mitarbeit neu (§ 4 Abs. 2 LBVO): die benotete Mitarbeit (Kategorie MAN) entfällt – MA wird
    // selbst zur Note (Verhältnis + / −, inkl. Hausübung). Alte MAN-Spalten samt Einträgen löschen.
    // Idempotent (nach dem ersten Lauf gibt es keine MAN-Zeilen mehr), daher beim versions-losen
    // Mobil-Bootstrap bei jedem Start unbedenklich.
    description: 'LBVO v1.4: benotete Mitarbeit (MAN) entfernen – MA wird selbst zur Note',
    sql: [
      "DELETE FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE kategorie = 'MAN');",
      "DELETE FROM spalten WHERE kategorie = 'MAN';",
    ].join('\n\n'),
  },
]

function applySchema(db, deps) {
  // Idempotente Spalten-Migration (ALTER TABLE ADD COLUMN, falls fehlend).
  const spalteErgaenzen = (tabelle, spalte, definition) => {
    const vorhanden = db.prepare(`PRAGMA table_info(${tabelle})`).all().some((c) => c.name === spalte)
    if (vorhanden) return
    try {
      db.exec(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${definition}`)
    } catch (e) {
      deps.logError(`migration:spalte ${tabelle}.${spalte}`, e)
    }
  }

  // Schema-Version einmalig lesen: steuert die nicht-idempotenten Migrationen unten.
  const schemaVersion = db.pragma('user_version', { simple: true })

  db.exec(`
    CREATE TABLE IF NOT EXISTS einstellungen (
      schluessel TEXT PRIMARY KEY,
      wert TEXT
    );

    CREATE TABLE IF NOT EXISTS schuljahre (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bezeichnung TEXT NOT NULL,
      archiviert INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS klassen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schuljahr_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id)
    );

    CREATE TABLE IF NOT EXISTS faecher (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      gewichtung_sa REAL,
      gewichtung_t REAL,
      gewichtung_ma REAL,
      gewichtung_hue REAL,
      gewichtung_custom REAL,
      ma_max_einfluss REAL,
      hue_max_einfluss REAL,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id)
    );

    CREATE TABLE IF NOT EXISTS schueler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      vorname TEXT NOT NULL,
      nachname TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id)
    );

    CREATE TABLE IF NOT EXISTS spalten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      semester INTEGER NOT NULL DEFAULT 1,
      kategorie TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      datum TEXT,
      reihenfolge INTEGER DEFAULT 0,
      eingeklappt INTEGER DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    );

    CREATE TABLE IF NOT EXISTS eintraege (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spalte_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      wert TEXT DEFAULT '',
      UNIQUE(spalte_id, schueler_id),
      FOREIGN KEY (spalte_id) REFERENCES spalten(id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id)
    );

    CREATE TABLE IF NOT EXISTS eintraege_verlauf (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id       INTEGER,
      spalte_id     INTEGER NOT NULL,
      schueler_id   INTEGER NOT NULL,
      wert_alt      TEXT,
      wert_neu      TEXT,
      kommentar_alt TEXT,
      kommentar_neu TEXT,
      zeitstempel   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      aktion        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zeugnisnoten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      note_berechnet REAL,
      note_manuell INTEGER,
      UNIQUE(fach_id, schueler_id, semester),
      FOREIGN KEY (fach_id) REFERENCES faecher(id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id)
    );

    CREATE TABLE IF NOT EXISTS notizen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      text TEXT DEFAULT '',
      UNIQUE(schueler_id, fach_id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    );

    CREATE TABLE IF NOT EXISTS gewichtung_global (
      kategorie TEXT PRIMARY KEY,
      gewichtung REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stundenzeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stunde INTEGER NOT NULL,
      beginn TEXT NOT NULL,
      ende TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stundenplan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wochentag INTEGER NOT NULL,
      stunde_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      FOREIGN KEY (stunde_id) REFERENCES stundenzeiten(id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    );

    CREATE TABLE IF NOT EXISTS stunden_planung (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stundenplan_id INTEGER NOT NULL,
      woche_datum TEXT NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT NOT NULL DEFAULT '',
      musizieren INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (stundenplan_id) REFERENCES stundenplan(id) ON DELETE CASCADE,
      UNIQUE(stundenplan_id, woche_datum)
    );
  `)

  // ── Spalten-Migration für ältere DBs (idempotent, nur falls Spalte fehlt) ──
  spalteErgaenzen('schueler', 'lernschwaeche', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schueler', 'legasthenie', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schueler', 'spf', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schueler', 'avatar', 'TEXT')
  // Stammdaten (Kontakt/Notfall/Berechtigte) – reine Spalten-Ergänzungen, kein Versions-Bump nötig.
  spalteErgaenzen('schueler', 'geburtsdatum', 'TEXT')
  spalteErgaenzen('schueler', 'strasse', 'TEXT')
  spalteErgaenzen('schueler', 'plz', 'TEXT')
  spalteErgaenzen('schueler', 'ort', 'TEXT')
  spalteErgaenzen('schueler', 'telefon', 'TEXT')
  spalteErgaenzen('schueler', 'email', 'TEXT')
  spalteErgaenzen('schueler', 'notfallnummer', 'TEXT')
  spalteErgaenzen('schueler', 'erziehungsberechtigte', 'TEXT')
  spalteErgaenzen('schueler', 'abholberechtigte', 'TEXT')
  spalteErgaenzen('schueler', 'anmerkungen', 'TEXT')
  spalteErgaenzen('klassen', 'farbe', 'TEXT')
  spalteErgaenzen('faecher', 'farbe', 'TEXT')
  spalteErgaenzen('stunden_planung', 'musizieren', 'INTEGER DEFAULT 0')
  spalteErgaenzen('zeugnisnoten', 's1_eingerechnet', 'INTEGER DEFAULT 0')

  // Fach-spezifische Deckelung des MA/HÜ-Einflusses (NULL = globaler Standard).
  // MA & HÜ getrennt steuerbar; frühere gemeinsame Spalte 'ma_hue_max_einfluss' als Migrationsquelle.
  spalteErgaenzen('faecher', 'ma_hue_max_einfluss', 'REAL')
  spalteErgaenzen('faecher', 'ma_max_einfluss', 'REAL')
  spalteErgaenzen('faecher', 'hue_max_einfluss', 'REAL')
  // Eigene Gewichtung der benoteten Mitarbeit (Kategorie MAN). NICHT verwechseln mit
  // dem alten, hart-genullten 'gewichtung_ma' (MA = Bonus/Malus, keine Note).
  spalteErgaenzen('faecher', 'gewichtung_man', 'REAL')

  // Einmalige Daten-Migrationen – dürfen NICHT bei jedem Start laufen (siehe user_version).
  if (schemaVersion < 1) {
    // Altes HÜ-Fachgewicht entfernen: Hausübung hat kein eigenes Gewicht (fließt in die
    // Mitarbeitsnote ein). gewichtung_ma bleibt hingegen erhalten – MA ist wieder note-bildend.
    try {
      db.prepare('UPDATE faecher SET gewichtung_hue = NULL WHERE gewichtung_hue IS NOT NULL').run()
    } catch (e) { deps.logError('migration:gewichtung-hue-loeschen', e) }
    // Alten gemeinsamen Wert einmalig auf beide getrennten Spalten übertragen.
    // Muss einmalig sein – ein später bewusst geleerter Wert würde sonst neu befüllt.
    try {
      db.prepare('UPDATE faecher SET ma_max_einfluss = ma_hue_max_einfluss, hue_max_einfluss = ma_hue_max_einfluss WHERE ma_hue_max_einfluss IS NOT NULL AND ma_max_einfluss IS NULL AND hue_max_einfluss IS NULL').run()
    } catch (e) { deps.logError('migration:ma-hue-aufteilen', e) }
  }

  // Todos-Tabelle
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titel TEXT NOT NULL,
      erledigt INTEGER DEFAULT 0,
      klasse_id INTEGER,
      fach_id INTEGER,
      faelligkeit TEXT,
      erinnerung TEXT,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE SET NULL
    )
  `)
  spalteErgaenzen('todos', 'faelligkeit', 'TEXT')
  spalteErgaenzen('todos', 'erinnerung', 'TEXT')
  spalteErgaenzen('spalten', 'notiz', 'TEXT')
  // Mitarbeits-Bewertungsstufen: 2 = +/− (bzw. Pfeile), 3 = +/~/− (positiv/neutral/negativ),
  // 4 = Smiley-Skala (😄🙂🙁😞). Default 2.
  spalteErgaenzen('spalten', 'ma_stufen', 'INTEGER DEFAULT 2')
  // Symboldarstellung der 2-stufigen Mitarbeit: 'pm' = + / −, 'pfeil' = ↗ / ↘.
  // Rein optisch – gespeichert werden weiterhin '+' / '−', die Bewertung ist identisch.
  spalteErgaenzen('spalten', 'ma_symbol', "TEXT DEFAULT 'pm'")
  // Eigene Symbole der mehrstufigen Mitarbeit (JSON-Array): Länge 3 für +/~/−, Länge 4 für die
  // Smiley-Skala. NULL = Defaults. Wertung positionsbasiert (Stufe → Teilnote).
  spalteErgaenzen('spalten', 'ma_symbole', 'TEXT')
  spalteErgaenzen('eintraege', 'kommentar', 'TEXT')
  spalteErgaenzen('stunden_planung', 'hue_text', 'TEXT')
  spalteErgaenzen('stunden_planung', 'hue_frist_datum', 'TEXT')
  spalteErgaenzen('stunden_planung', 'link', 'TEXT')
  spalteErgaenzen('stunden_planung', 'entfall', 'INTEGER DEFAULT 0')
  // Wochen-Rhythmus: Stunde findet nur alle N Wochen statt (1 = jede Woche).
  // anker_datum = Montag einer Woche, in der die Stunde stattfindet (Parität).
  spalteErgaenzen('stundenplan', 'wochen_intervall', 'INTEGER DEFAULT 1')
  spalteErgaenzen('stundenplan', 'anker_datum', 'TEXT')
  // Hinweis: Migrationen für `supplierstunden` und `termine` stehen bewusst
  // NACH deren CREATE TABLE weiter unten – sonst schlagen sie auf einer frischen
  // DB fehl (Tabelle existiert an dieser Stelle noch nicht).
  spalteErgaenzen('klassen', 'teams_link', 'TEXT')
  spalteErgaenzen('faecher', 'benotungssystem', "TEXT DEFAULT 'standard'")
  spalteErgaenzen('faecher', 'alle_schueler', 'INTEGER DEFAULT 1')

  // Fach-spezifische Schüler-Teilmenge (Gruppen). Nur befüllt, wenn faecher.alle_schueler = 0.
  db.exec(`
    CREATE TABLE IF NOT EXISTS fach_schueler (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Klassen-Mitgliedschaft (n:m) – Schüler:in kann mehreren Klassen angehören. reihenfolge/aktiv
  // pro Klasse, ist_stammklasse = KV-/Anzeige-Default. Backfill aus schueler.klasse_id unten (v<5).
  db.exec(`
    CREATE TABLE IF NOT EXISTS klassen_schueler (
      klasse_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      ist_stammklasse INTEGER DEFAULT 0,
      PRIMARY KEY (klasse_id, schueler_id),
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_klassen_schueler_schueler ON klassen_schueler (schueler_id)`)

  // SPF pro Fach (v<6): SPF gilt nur in ausgewählten Fächern. schueler.spf bleibt Summen-Flag.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_fach_spf (
      schueler_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      PRIMARY KEY (schueler_id, fach_id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_schueler_fach_spf_fach ON schueler_fach_spf (fach_id)`)

  // Schüler-Niveau pro Fach (AHS/ST-Differenzierung) — aktueller Stand
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_niveau (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau TEXT NOT NULL DEFAULT 'AHS',
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Niveau-Historie: Verlauf der Wechsel mit Gültigkeitsdatum
  // Pro Wechsel ein Eintrag mit gueltig_ab (TEXT 'YYYY-MM-DD').
  // Das aktuelle Niveau ist der jüngste Eintrag mit gueltig_ab <= heute.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_niveau_historie (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau TEXT NOT NULL,
      gueltig_ab TEXT NOT NULL,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_niveau_historie_lookup
      ON schueler_niveau_historie (fach_id, schueler_id, gueltig_ab)`).run()
  } catch {}

  // Individueller Rezenzfaktor (§ 20 LBVO) pro (Fach, Schüler:in). Fehlt eine Zeile,
  // gilt der globale Faktor aus den Einstellungen (Fallback). Additiv, keine Migration nötig.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_rezenz (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      faktor REAL NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Manuelle Mitarbeitsnote (§ 4 Abs. 2 LBVO) pro (Fach, Schüler:in). Fehlt eine Zeile,
  // gilt der berechnete Teilnoten-Schnitt. note = interner Wert (1–7). Additiv, keine Migration.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_ma_note (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      note INTEGER NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Individuelle Notengewichtung (SA/Test/Individuell/Mitarbeit) pro (Fach, Schüler:in).
  // Fehlt eine Zeile, gilt die Fach- bzw. globale Gewichtung. Additiv, keine Migration.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_gewichtung (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      gewichtung_sa REAL,
      gewichtung_t REAL,
      gewichtung_custom REAL,
      gewichtung_ma REAL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Termine
  db.exec(`
    CREATE TABLE IF NOT EXISTS termine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titel TEXT NOT NULL,
      datum TEXT NOT NULL,
      uhrzeit TEXT,
      notiz TEXT,
      klasse_id INTEGER,
      schuljahr_id INTEGER NOT NULL,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE SET NULL,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id) ON DELETE CASCADE
    )
  `)
  spalteErgaenzen('termine', 'stunde_id', 'INTEGER')
  spalteErgaenzen('termine', 'bis_uhrzeit', 'TEXT')

  // Benutzerdefinierte Ferien (Ergänzung/Überschreibung der berechneten Ferien)
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_ferien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schuljahr_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      von TEXT NOT NULL,
      bis TEXT NOT NULL,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id) ON DELETE CASCADE
    )
  `)

  // Kompetenzbereiche pro Fach
  db.exec(`
    CREATE TABLE IF NOT EXISTS kompetenzbereiche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL,
      beschreibung TEXT,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    )
  `)

  // Schüler:innen-Kompetenzen (Niveau pro Kompetenzbereich)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_kompetenzen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kompetenzbereich_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau INTEGER NOT NULL DEFAULT 0,
      notiz TEXT,
      aktualisiert TEXT,
      UNIQUE(kompetenzbereich_id, schueler_id),
      FOREIGN KEY (kompetenzbereich_id) REFERENCES kompetenzbereiche(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Supplierstunden
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplierstunden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      woche_datum TEXT NOT NULL,
      wochentag INTEGER NOT NULL,
      stunde_id INTEGER NOT NULL,
      klasse_text TEXT NOT NULL DEFAULT '',
      fach_text TEXT NOT NULL DEFAULT '',
      notiz TEXT,
      FOREIGN KEY (stunde_id) REFERENCES stundenzeiten(id) ON DELETE CASCADE
    )
  `)
  spalteErgaenzen('supplierstunden', 'titel', 'TEXT')
  spalteErgaenzen('supplierstunden', 'inhalt', 'TEXT')
  spalteErgaenzen('supplierstunden', 'hue_text', 'TEXT')
  spalteErgaenzen('supplierstunden', 'hue_frist_datum', 'TEXT')
  spalteErgaenzen('supplierstunden', 'link', 'TEXT')

  // Jahresplanung
  db.exec(`
    CREATE TABLE IF NOT EXISTS jahresplanung_abschnitte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT DEFAULT '',
      datum_von TEXT,
      datum_bis TEXT,
      farbe TEXT,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    );
  `)
  // Migration: datum_von/datum_bis nullable machen + reihenfolge hinzufügen.
  // reihenfolge muss VOR dem evtl. Tabellen-Rebuild existieren (wird dort referenziert).
  spalteErgaenzen('jahresplanung_abschnitte', 'reihenfolge', 'INTEGER NOT NULL DEFAULT 0')
  // Einmaliger Tabellen-Rebuild (nur sehr alte DBs) – hier vor abschnitt_materialien,
  // das per FK auf diese Tabelle verweist; darum an dieser Stelle und nicht zentral.
  if (schemaVersion < 1) try {
    // Prüfe ob datum_von noch NOT NULL ist (alte DBs)
    const info = db.prepare("PRAGMA table_info(jahresplanung_abschnitte)").all()
    const vonCol = info.find(c => c.name === 'datum_von')
    if (vonCol && vonCol.notnull === 1) {
      db.exec(`
        CREATE TABLE jahresplanung_abschnitte_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fach_id INTEGER NOT NULL,
          titel TEXT NOT NULL DEFAULT '',
          inhalt TEXT DEFAULT '',
          datum_von TEXT,
          datum_bis TEXT,
          farbe TEXT,
          reihenfolge INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
        );
        INSERT INTO jahresplanung_abschnitte_new (id, fach_id, titel, inhalt, datum_von, datum_bis, farbe, reihenfolge)
          SELECT id, fach_id, titel, inhalt, datum_von, datum_bis, farbe, COALESCE(reihenfolge, 0) FROM jahresplanung_abschnitte;
        DROP TABLE jahresplanung_abschnitte;
        ALTER TABLE jahresplanung_abschnitte_new RENAME TO jahresplanung_abschnitte;
      `)
    }
  } catch (e) { deps.logError('migration:jahresplanung-datum-nullable', e) }
  // Leaf-Ordnername pro Abschnitt (Materialordner). Elternpfade werden live abgeleitet.
  spalteErgaenzen('jahresplanung_abschnitte', 'material_ordner', 'TEXT')
  spalteErgaenzen('jahresplanung_abschnitte', 'lernziele', 'TEXT')
  spalteErgaenzen('jahresplanung_abschnitte', 'kompetenzen', 'TEXT')

  // Materialien pro Abschnitt: Links + optionale Datei-Metadaten (Sidecar keyed by Dateiname).
  // Dokumente selbst liegen als Dateien im Ordner (Wahrheit), hier nur Metadaten.
  db.exec(`
    CREATE TABLE IF NOT EXISTS abschnitt_materialien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abschnitt_id INTEGER NOT NULL,
      typ TEXT NOT NULL,               -- 'datei' | 'link'
      ref TEXT NOT NULL,               -- Dateiname (datei) / URL (link)
      anzeigename TEXT,
      beschreibung TEXT,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      erstellt_am TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (abschnitt_id) REFERENCES jahresplanung_abschnitte(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_abschnitt_materialien_abschnitt
      ON abschnitt_materialien(abschnitt_id);
  `)

  // Sitzplan-Tabellen
  db.exec(`
    CREATE TABLE IF NOT EXISTS sitzplan_fach_zuweisungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitzplatz_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER,
      UNIQUE(sitzplatz_id, fach_id),
      FOREIGN KEY (sitzplatz_id) REFERENCES sitzplan_sitzplaetze(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE SET NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS sitzplan_tische (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      typ TEXT NOT NULL DEFAULT 'einzel',
      x REAL NOT NULL DEFAULT 100,
      y REAL NOT NULL DEFAULT 100,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sitzplan_sitzplaetze (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tisch_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      schueler_id INTEGER,
      UNIQUE(tisch_id, position),
      FOREIGN KEY (tisch_id) REFERENCES sitzplan_tische(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE SET NULL
    );
  `)
  spalteErgaenzen('sitzplan_tische', 'fach_id', 'INTEGER')
  // Drehung eines Tisches in Grad (0/90/180/270) für den Sitzplan.
  spalteErgaenzen('sitzplan_tische', 'rotation', 'INTEGER NOT NULL DEFAULT 0')

  // Sortierung der Schüler:innen-Liste pro Klasse: 'nachname' (Default), 'vorname' oder 'manuell'.
  spalteErgaenzen('klassen', 'sortierung', "TEXT DEFAULT 'nachname'")

  // ─── KV-Modul (Klassenvorstand) ──────────────────────────────────────────────
  spalteErgaenzen('klassen', 'ist_kv', 'INTEGER DEFAULT 0')
  spalteErgaenzen('klassen', 'ist_vorlage', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schuljahre', 'start_datum', 'TEXT')
  spalteErgaenzen('schuljahre', 'end_datum', 'TEXT')

  db.exec(`
    -- Jahresaufgaben-Templates
    CREATE TABLE IF NOT EXISTS kv_jahresaufgaben (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      monat        INTEGER NOT NULL,
      titel        TEXT NOT NULL,
      beschreibung TEXT,
      rechtsbezug  TEXT,
      kategorie    TEXT,
      sortierung   INTEGER DEFAULT 0
    );

    -- Erledigungs-Status pro Klasse + Schuljahr
    CREATE TABLE IF NOT EXISTS kv_jahresaufgaben_status (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id   INTEGER NOT NULL REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE,
      schuljahr_id INTEGER NOT NULL REFERENCES schuljahre(id) ON DELETE CASCADE,
      klasse_id    INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      erledigt_am  TEXT,
      notiz        TEXT,
      UNIQUE(aufgabe_id, schuljahr_id, klasse_id)
    );

    -- Wochenaufgaben-Templates
    CREATE TABLE IF NOT EXISTS kv_wochenaufgaben (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titel       TEXT NOT NULL,
      rechtsbezug TEXT,
      sortierung  INTEGER DEFAULT 0,
      aktiv       INTEGER DEFAULT 1
    );

    -- Wochenaufgaben-Status pro Klasse + KW
    CREATE TABLE IF NOT EXISTS kv_wochenaufgaben_status (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id    INTEGER NOT NULL REFERENCES kv_wochenaufgaben(id) ON DELETE CASCADE,
      schuljahr_id  INTEGER NOT NULL REFERENCES schuljahre(id) ON DELETE CASCADE,
      klasse_id     INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      kalenderwoche INTEGER NOT NULL,
      jahr          INTEGER NOT NULL,
      erledigt_am   TEXT,
      notiz         TEXT,
      UNIQUE(aufgabe_id, klasse_id, kalenderwoche, jahr)
    );

    -- Trigger-Events (manuell + automatisch)
    CREATE TABLE IF NOT EXISTS kv_trigger (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id    INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      schueler_id  INTEGER REFERENCES schueler(id) ON DELETE CASCADE,
      typ          TEXT NOT NULL,
      schweregrad  TEXT NOT NULL DEFAULT 'info',
      ausloeser    TEXT,
      beschreibung TEXT,
      erstellt_am  TEXT DEFAULT (datetime('now', 'localtime')),
      reagiert_am  TEXT,
      reaktion     TEXT,
      archiviert   INTEGER DEFAULT 0
    );

    -- Aktenvermerke
    CREATE TABLE IF NOT EXISTS kv_aktenvermerke (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id    INTEGER REFERENCES schueler(id) ON DELETE CASCADE,
      klasse_id      INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      datum          TEXT NOT NULL,
      typ            TEXT NOT NULL,
      titel          TEXT NOT NULL,
      beschreibung   TEXT NOT NULL,
      zeugen         TEXT,
      folgemassnahme TEXT,
      erstellt_am    TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Elternkontakte
    CREATE TABLE IF NOT EXISTS kv_elternkontakte (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id INTEGER NOT NULL REFERENCES schueler(id) ON DELETE CASCADE,
      datum       TEXT NOT NULL,
      art         TEXT NOT NULL,
      initiator   TEXT NOT NULL,
      thema       TEXT NOT NULL,
      inhalt      TEXT,
      erledigt    INTEGER DEFAULT 1
    );

    -- Fehlstunden
    CREATE TABLE IF NOT EXISTS kv_fehlstunden (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id  INTEGER NOT NULL REFERENCES schueler(id) ON DELETE CASCADE,
      datum        TEXT NOT NULL,
      stunden      INTEGER NOT NULL,
      entschuldigt INTEGER NOT NULL DEFAULT 0,
      grund        TEXT
    );
  `)

  // Sub-Aufgaben: parent_id NACH dem CREATE TABLE (sonst schlägt es auf frischer DB fehl).
  spalteErgaenzen('kv_jahresaufgaben', 'parent_id', 'INTEGER REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE')

  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_trigger_klasse_archiv ON kv_trigger (klasse_id, archiviert)`).run()
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_aktenvermerke_klasse ON kv_aktenvermerke (klasse_id, datum DESC)`).run()
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_fehlstunden_schueler ON kv_fehlstunden (schueler_id, datum)`).run()
  } catch {}

  // ─── KV-Seed-Daten (nur bei leeren Tabellen) ────────────────────────────────
  if (db.prepare('SELECT COUNT(*) as c FROM kv_jahresaufgaben').get().c === 0) {
    const ja = db.prepare('INSERT INTO kv_jahresaufgaben (monat, titel, beschreibung, rechtsbezug, kategorie, sortierung) VALUES (?, ?, ?, ?, ?, ?)')
    // Monat (1..12 Kalender), Titel, Beschreibung, Rechtsbezug, Kategorie, Sortierung
    const seeds = [
      // September — Schulbeginn, Organisation
      [9, 'Klassenliste & Sitzplan',         'Aktuelle Klassenliste prüfen, Sitzplan festlegen.', null,          'organisation', 1],
      [9, 'Begrüßung & Klassenregeln',       'Erste Klassenstunde, Regeln gemeinsam besprechen.', null,          'organisation', 2],
      [9, 'Belehrungen durchführen',         'Hausordnung, Brandschutz, Verhalten bei Unfällen.', '§ 47 SchUG',   'doku',         3],
      [9, 'Notfallkontakte einholen',        'Telefon- und Mailadressen der Eltern aktualisieren.', null,        'doku',         4],
      [9, 'Klassendienste verteilen',        'Tafeldienst, Garderobendienst, Klassenbuchführung.', null,         'organisation', 5],
      [9, 'Termin Klassenforum festlegen',   'Datum für das Klassenforum vorbereiten.',          '§ 63a SchUG',  'elternarbeit', 6],
      // Oktober — Elternarbeit, Beobachtung
      [10, 'Klassenforum durchführen',       'Wahl Elternvertretung, Information über Vorhaben.','§ 63a SchUG', 'elternarbeit', 1],
      [10, 'Erste Elterngespräche',          'Persönlicher Kontakt zu allen Familien herstellen.', null,        'elternarbeit', 2],
      [10, 'Klassendynamik beobachten',      'Erste Aktenvermerke zu auffälligem Verhalten.',     null,         'doku',         3],
      [10, 'Schulveranstaltungen planen',    'Wandertage, Projekttage langfristig vorbereiten.',  null,         'organisation', 4],
      // November — Leistungsstand
      [11, 'Leistungsstand erheben',         'Mit Fachlehrer:innen Rücksprache halten.',          '§ 54 SchUG', 'doku',         1],
      [11, 'Elternsprechtag',                'Vorbereitung & Durchführung.',                       null,        'elternarbeit', 2],
      [11, 'Frühwarnungen vorbereiten',      'Schüler:innen mit Gefährdung dokumentieren.',       '§ 19 SchUG','doku',         3],
      [11, 'Aktenvermerke aktualisieren',    'Beobachtungen verschriftlichen.',                    null,        'doku',         4],
      // Dezember — Frühwarnungen, Konferenz
      [12, 'Frühwarnungen versenden',        'Schriftliche Verständigung Eltern + Bestätigung.', '§ 19 Abs. 4 SchUG','doku',  1],
      [12, 'Konferenzanträge einbringen',    'Vorbereitung Notenkonferenz Semester 1.',           null,        'konferenz',    2],
      [12, 'Verhaltensbeurteilung vorbereiten','Vorschläge zur Verhaltensnote.',                  '§ 20 SchUG', 'konferenz',    3],
      [12, 'Weihnachtsfeier organisieren',   'Klassenaktion zum Semesterende.',                    null,        'organisation', 4],
      // Jänner — Semester 1 abschließen
      [1, 'Notenkonferenz Sem. 1',           'Teilnahme + Protokollführung.',                      '§ 20 SchUG', 'konferenz',    1],
      [1, 'Schulnachrichten ausgeben',       'Verteilung und Empfangsbestätigung.',                '§ 19 SchUG', 'doku',         2],
      [1, 'Elterngespräche bei Gefährdung',  'Persönliche Rücksprache bei NG/Frühwarnung.',        null,        'elternarbeit', 3],
      [1, 'Aktenvermerke verifizieren',      'Vollständigkeit aller Vorfälle prüfen.',             null,        'doku',         4],
      // Februar — Semester 2 startet
      [2, 'Semester 2 — Zielvereinbarungen', 'Mit der Klasse neue Ziele formulieren.',             null,        'organisation', 1],
      [2, 'Schulveranstaltungen Sem.2',      'Sportwoche, Projekttage anmelden + genehmigen.',     null,        'organisation', 2],
      [2, 'Fehlstundenkonto prüfen',         'Grenzen 5/15/30 Stunden im Auge behalten.',          '§ 45 SchUG','doku',         3],
      // März — Standortbestimmung
      [3, 'Leistungsstand erheben',          'Zweite Rücksprache mit Fachlehrer:innen.',           '§ 54 SchUG','doku',         1],
      [3, 'Elternsprechtag',                 'Frühjahrs-Sprechtag durchführen.',                   null,        'elternarbeit', 2],
      [3, 'Aktenvermerke aktualisieren',     'Quartalsweise Sichtung.',                            null,        'doku',         3],
      [3, 'Berufsorientierung planen',       'Falls altersrelevant: BO-Termine festlegen.',        null,        'organisation', 4],
      // April — Frühwarnungen 2
      [4, 'Frühwarnungen Sem. 2 versenden',  'Schriftliche Verständigung bei Gefährdung.',         '§ 19 SchUG','doku',         1],
      [4, 'Elterngespräche bei NG-Gefahr',   'Persönlicher Kontakt + Folgemaßnahmen.',             null,        'elternarbeit', 2],
      [4, 'Schulveranstaltungs-Check',       'Genehmigungsstatus aller geplanten Aktionen.',       null,        'organisation', 3],
      // Mai — Endphase Vorbereitung
      [5, 'Konferenzanträge einbringen',     'Vorbereitung Schlusskonferenz, Verhaltensnoten.',    '§ 20 SchUG','konferenz',    1],
      [5, 'Verhaltensbeurteilung finalisieren','Endbewertung Verhalten.',                          '§ 20 SchUG','konferenz',    2],
      [5, 'Aktenvermerke schließen',         'Offene Vorfälle dokumentieren und abschließen.',     null,        'doku',         3],
      [5, 'Klassenausflug organisieren',     'Letzte Aktion vor Schulschluss.',                    null,        'organisation', 4],
      // Juni — Abschluss
      [6, 'Notenkonferenz Schulschluss',     'Teilnahme + Beschluss Aufstiegsentscheidungen.',     '§ 20 SchUG','konferenz',    1],
      [6, 'Zeugnisse vorbereiten',           'Zeugnisformulare, Vermerke, Unterschriften.',        null,        'doku',         2],
      [6, 'Zeugnisverteilung',               'Persönliche Übergabe + Abschluss.',                  null,        'organisation', 3],
      [6, 'Klassendokumentation archivieren','KV-Akten ordentlich ablegen.',                        null,        'doku',         4],
      [6, 'Rückmeldung an Direktion',        'KV-Jahresbericht (kurz).',                            null,        'doku',         5],
      // Juli / August — Nachhol, Wiederholungsprüfungen
      [7, 'Wiederholungsprüfungen begleiten','Termine kommunizieren, organisatorische Unterstützung.','§ 23 SchUG','organisation',1],
      [8, 'Vorbereitung neues Schuljahr',    'Klassenliste sichten, Sitzplan-Entwurf, To-Dos sammeln.',null,    'organisation', 1],
    ]
    for (const s of seeds) ja.run(...s)
  }

  if (db.prepare('SELECT COUNT(*) as c FROM kv_wochenaufgaben').get().c === 0) {
    const wa = db.prepare('INSERT INTO kv_wochenaufgaben (titel, rechtsbezug, sortierung) VALUES (?, ?, ?)')
    const wseeds = [
      ['Klassenbuch durchgesehen',                  '§ 54 SchUG', 1],
      ['Entschuldigungen eingesammelt',             '§ 45 SchUG', 2],
      ['Fehlstundenkonto geprüft (5/15/30 h)',      null,         3],
      ['Rückmeldungen vom Lehrer:innenteam',        '§ 54 SchUG', 4],
      ['Aktenvermerke nachgezogen',                 null,         5],
      ['Offene Eltern-Rückrufe/Mails',              '§ 48 SchUG', 6],
      ['Wochenausblick (Termine, Veranstaltungen)', null,         7],
    ]
    for (const w of wseeds) wa.run(...w)
  }

  // Standard-Gewichtungen (Summe = 100 %)
  // Nur bei frischer DB werden alle eingefügt; bestehende Werte bleiben unangetastet.
  const insertGewichtung = db.prepare(
    'INSERT OR IGNORE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)'
  )
  insertGewichtung.run('SA', 0.35)
  insertGewichtung.run('T', 0.25)
  insertGewichtung.run('MA', 0.20)
  insertGewichtung.run('HÜ', 0.10)
  insertGewichtung.run('CUSTOM', 0.10)
  // Benotete Mitarbeit (MAN). INSERT OR IGNORE = idempotent, back-fillt Bestands-DBs.
  insertGewichtung.run('MAN', 0.30)

  // Duplikate in stundenzeiten bereinigen (fehlerhafter INSERT OR IGNORE ohne UNIQUE)
  db.prepare(`
    DELETE FROM stundenzeiten WHERE id NOT IN (
      SELECT MIN(id) FROM stundenzeiten GROUP BY stunde
    )
  `).run()

  // Standard-Stundenzeiten nur einfügen wenn Tabelle leer
  const stundenCount = db.prepare('SELECT COUNT(*) as c FROM stundenzeiten').get().c
  if (stundenCount === 0) {
    const stunden = [
      [1, '07:55', '08:40'],
      [2, '08:45', '09:30'],
      [3, '09:45', '10:30'],
      [4, '10:35', '11:20'],
      [5, '11:25', '12:10'],
      [6, '12:15', '13:00'],
      [7, '13:05', '13:50'],
      [8, '13:55', '14:40'],
    ]
    const insertStunde = db.prepare(
      'INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)'
    )
    for (const [stunde, beginn, ende] of stunden) {
      insertStunde.run(stunde, beginn, ende)
    }
  }

  // Standard-Einstellungen
  const insertEinstellung = db.prepare(
    'INSERT OR IGNORE INTO einstellungen (schluessel, wert) VALUES (?, ?)'
  )
  insertEinstellung.run('erststart_abgeschlossen', '0')
  insertEinstellung.run('theme', 'hell')
  insertEinstellung.run('ma_plus_wert', '1')
  insertEinstellung.run('ma_minus_wert', '5')
  insertEinstellung.run('semester2_monat', '2')
  // Planungs-Features (Stundenplan, Jahres-/Klassenplanung) — default aus.
  // Wer die Planung in Daskala separat zu einem Tool wie Teachino nutzen möchte,
  // schaltet das in den Einstellungen ein.
  insertEinstellung.run('planung_aktiv', '0')

  // Aktuelles Schuljahr ermitteln
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const schuljahrBez = month >= 9
    ? `${year}/${String(year + 1).slice(2)}`
    : `${year - 1}/${String(year).slice(2)}`
  insertEinstellung.run('schuljahr_aktuell', schuljahrBez)

  const semester = month >= 9 || month <= 1 ? '1' : '2'
  insertEinstellung.run('semester_aktuell', semester)

  // ─── UUID-Weiche (Phase 2.4, additiv) ────────────────────────────────────────
  // Zusätzliche geräteübergreifend eindeutige Identität je Entität für ein späteres
  // Zusammenführen getrennt gepflegter Bestände. Der Integer-PK bleibt interner
  // Schlüssel und FK-Referenz – an bestehenden Beziehungen ändert sich nichts.
  const UUID_ENTITAETEN = ['schuljahre', 'klassen', 'faecher', 'schueler', 'spalten', 'eintraege', 'zeugnisnoten', 'notizen']
  for (const t of UUID_ENTITAETEN) spalteErgaenzen(t, 'uuid', 'TEXT')
  // Einmaliges Backfill bestehender Zeilen (nur < Version 2). SQLite-seitig erzeugt
  // (randomblob), damit es ohne JS-Abhängigkeit in jedem Zielrahmen läuft.
  if (schemaVersion < 2) {
    const UUID_SQL = `lower(
      hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
      substr(hex(randomblob(2)), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' ||
      hex(randomblob(6))
    )`
    for (const t of UUID_ENTITAETEN) {
      try { db.prepare(`UPDATE ${t} SET uuid = (${UUID_SQL}) WHERE uuid IS NULL`).run() }
      catch (e) { deps.logError(`migration:uuid-backfill ${t}`, e) }
    }
  }
  // UNIQUE-Index je Entität (mehrere NULL sind in SQLite erlaubt).
  try {
    for (const t of UUID_ENTITAETEN) {
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_uuid ON ${t} (uuid)`).run()
    }
  } catch (e) { deps.logError('migration:uuid-index', e) }

  if (schemaVersion < 3) {
    // Umstieg auf EINE durchgehende Jahresnote (Slot semester=3). Die getrennten
    // Semesternoten (Slots 1 & 2) entfallen. Bewusst gesetzte MANUELLE Semesternoten
    // sollen aber nicht verloren gehen: falls Slot 3 keine manuelle Note hat, wird die
    // manuelle Note aus Slot 2 (bevorzugt) bzw. Slot 1 uebernommen; danach werden 1 & 2 geloescht.
    try {
      for (const sem of [2, 1]) {
        db.prepare(`
          UPDATE zeugnisnoten SET note_manuell = (
            SELECT z.note_manuell FROM zeugnisnoten z
            WHERE z.fach_id = zeugnisnoten.fach_id AND z.schueler_id = zeugnisnoten.schueler_id AND z.semester = ?
          )
          WHERE semester = 3 AND note_manuell IS NULL
            AND EXISTS (
              SELECT 1 FROM zeugnisnoten z
              WHERE z.fach_id = zeugnisnoten.fach_id AND z.schueler_id = zeugnisnoten.schueler_id
                AND z.semester = ? AND z.note_manuell IS NOT NULL
            )
        `).run(sem, sem)
      }
      db.prepare('DELETE FROM zeugnisnoten WHERE semester IN (1, 2)').run()
    } catch (e) { deps.logError('migration:zeugnisnoten-einzelnote', e) }
  }

  if (schemaVersion < 4) {
    // Mitarbeit neu (§ 4 Abs. 2 LBVO): die benotete Mitarbeit (Kategorie MAN) entfällt – MA wird
    // selbst zur Note (Verhältnis + / −, inkl. Hausübung). Alte MAN-Spalten samt Einträgen löschen;
    // die eine Jahresnote wird danach neu berechnet (App.jsx-Once-Recompute).
    try {
      db.prepare("DELETE FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE kategorie = 'MAN')").run()
      db.prepare("DELETE FROM spalten WHERE kategorie = 'MAN'").run()
    } catch (e) { deps.logError('migration:man-entfernen', e) }
  }

  if (schemaVersion < 5) {
    // Klassen-Mitgliedschaft n:m: bestehende 1:1-Bindung (schueler.klasse_id) in die neue Junction
    // backfillen – je Bestands-Schüler:in genau eine Zeile mit ist_stammklasse=1. reihenfolge/aktiv
    // 1:1 übernehmen. Einmalig (user_version-gesteuert), damit gelöschte Mitgliedschaften nicht
    // wieder auferstehen.
    try {
      // WHERE klasse_id IN (…): verwaiste schueler.klasse_id (ohne passende klassen-Zeile) auslassen –
      // sonst bräche der EINE INSERT bei foreign_keys=ON komplett ab und ließe die Roster leer.
      db.prepare(`
        INSERT OR IGNORE INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse)
        SELECT klasse_id, id, reihenfolge, aktiv, 1 FROM schueler
        WHERE klasse_id IN (SELECT id FROM klassen)
      `).run()
    } catch (e) { deps.logError('migration:klassen-schueler-backfill', e) }
  }

  if (schemaVersion < 6) {
    // SPF wird fachbezogen: bestehende global-SPF-Schüler:innen (schueler.spf=1) erhalten einen
    // SPF-Eintrag für alle Fächer ihrer Stammklasse – so bleibt der Badge dort erhalten, wo er
    // vorher erschien. Danach kann pro Kind je Fach verfeinert werden. Einmalig (user_version).
    try {
      db.prepare(`
        INSERT OR IGNORE INTO schueler_fach_spf (schueler_id, fach_id)
        SELECT s.id, f.id FROM schueler s
        JOIN faecher f ON f.klasse_id = s.klasse_id
        WHERE s.spf = 1
          AND (f.alle_schueler = 1 OR EXISTS (SELECT 1 FROM fach_schueler fs WHERE fs.fach_id = f.id AND fs.schueler_id = s.id))
      `).run()
    } catch (e) { deps.logError('migration:spf-fach-backfill', e) }
  }

  // Alle einmaligen Migrationen dieser Version sind durchlaufen → Schema-Version festschreiben.
  if (schemaVersion < SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`)
}

module.exports = { applySchema, MIGRATIONS, SCHEMA_VERSION, TABLE_DDL, INDEX_DDL }

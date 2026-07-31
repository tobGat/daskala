-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Tobias Gatterbauer
--
-- Charakterisierungs-Fixture (Phase 0). REINE DATEN – kein Schema.
-- Das Schema wird ausschließlich von main.js/initDB erzeugt; dieser Seed füllt
-- eine bereits angelegte, leere DB. Explizite IDs → deterministische Snapshots.
--
-- Einfügereihenfolge respektiert die Fremdschlüssel (foreign_keys = ON).
--
-- Stand: Pilot-Umfang (Kern-Entitäten). Wird in Phase 0 zur vollständigen
-- Fixture (Stundenplan, Sitzplan, KV …) ausgebaut, sobald das Muster steht.

-- ── Schuljahre ──────────────────────────────────────────────────────────────
INSERT INTO schuljahre (id, bezeichnung, archiviert, start_datum, end_datum) VALUES
  (1, '2025/26', 0, '2025-09-08', '2026-07-03'),
  (2, '2024/25', 1, '2024-09-09', '2025-07-04');

-- ── Einstellungen (Schlüssel/Wert) ──────────────────────────────────────────
-- main.js/initDB legt per INSERT OR IGNORE Default-Einstellungen an. Für einen
-- deterministischen, von der (wachsenden) Default-Liste entkoppelten Snapshot
-- wird hier bewusst geleert und ein fester Satz gesetzt.
DELETE FROM einstellungen;
INSERT INTO einstellungen (schluessel, wert) VALUES
  ('theme', 'light'),
  ('planung_aktiv', '1'),
  ('bundesland', 'W'),
  ('wetter_aktiv', '0'),
  ('zn_gewichtung_sn1', '50');

-- ── Klassen (Schuljahr 1) ───────────────────────────────────────────────────
-- Eine Vorlagenklasse (ist_vorlage = 1) prüft, dass klassen:getAll sie ausschließt.
INSERT INTO klassen (id, schuljahr_id, name, reihenfolge, farbe, sortierung, ist_kv, ist_vorlage) VALUES
  (1, 1, '1A', 1, '#fb6936', 'nachname', 1, 0),
  (2, 1, '2B', 2, '#34d399', 'vorname',  0, 0),
  (3, 1, '3C', 3, NULL,      'nachname', 0, 0),
  (4, 1, 'Vorlage Musik', 9, NULL, 'nachname', 0, 1);

-- ── Fächer ──────────────────────────────────────────────────────────────────
INSERT INTO faecher (id, klasse_id, name, reihenfolge, alle_schueler, benotungssystem) VALUES
  (1, 1, 'Deutsch',     1, 1, 'standard'),
  (2, 1, 'Mathematik',  2, 1, 'standard'),
  (3, 2, 'Musik',       1, 1, 'standard');

-- ── Schüler:innen (Klasse 1, sortierung = nachname) ─────────────────────────
-- Auer/Ben vor Auer/Emma (Tie-break Vorname), inaktive:r Felix wird ausgeschlossen.
INSERT INTO schueler (id, klasse_id, vorname, nachname, reihenfolge, aktiv) VALUES
  (1, 1, 'Anna',  'Bauer',      1, 1),
  (2, 1, 'Ben',   'Auer',       2, 1),
  (3, 1, 'Clara', 'Zimmermann', 3, 1),
  (4, 1, 'David', 'Müller',     4, 1),
  (5, 1, 'Emma',  'Auer',       5, 1),
  (6, 1, 'Felix', 'Xaver',      6, 0);

-- ── Spalten (Fach 1 = Deutsch) ──────────────────────────────────────────────
INSERT INTO spalten (id, fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES
  (1, 1, 1, 'SA', 'SA1', '2025-10-15', 1),
  (2, 1, 1, 'T',  'T1',  '2025-11-20', 2);

-- ── Einträge (Noten in den Spalten) ─────────────────────────────────────────
INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES
  (1, 1, '2'),
  (1, 2, '3'),
  (2, 1, '1');

-- ── Zeugnisnoten (Fach 1 = Deutsch) ─────────────────────────────────────────
INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, note_manuell, s1_eingerechnet) VALUES
  (1, 1, 1, 2.0,  NULL, 0),
  (1, 1, 2, 2.5,  NULL, 1),
  (1, 2, 1, 3.0,  NULL, 0),
  (1, 2, 2, NULL, 3,    1);

-- ── Notizen (Schüler:in × Fach) ─────────────────────────────────────────────
INSERT INTO notizen (schueler_id, fach_id, text) VALUES
  (1, 1, 'Sehr engagiert, liest gern vor.'),
  (2, 1, 'Braucht Unterstützung bei Rechtschreibung.');

-- ── Globale Gewichtung ──────────────────────────────────────────────────────
-- main.js/initDB legt Default-Gewichtungen an → für einen festen Snapshot leeren.
DELETE FROM gewichtung_global;
INSERT INTO gewichtung_global (kategorie, gewichtung) VALUES
  ('SA', 3.0),
  ('T',  1.0),
  ('custom', 1.0);

-- ── Schüler-Niveau (Fach 1 differenziert AHS/ST) ────────────────────────────
INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES
  (1, 1, 'AHS'),
  (1, 2, 'ST'),
  (1, 3, 'AHS');

INSERT INTO schueler_niveau_historie (id, fach_id, schueler_id, niveau, gueltig_ab) VALUES
  (1, 1, 2, 'AHS', '2025-09-08'),
  (2, 1, 2, 'ST',  '2026-02-01');

-- ── Kompetenzen (Fach 1) ────────────────────────────────────────────────────
INSERT INTO kompetenzbereiche (id, fach_id, titel, beschreibung, reihenfolge) VALUES
  (1, 1, 'Lesen',     'Sinnerfassend lesen', 1),
  (2, 1, 'Schreiben', 'Texte verfassen',     2);

INSERT INTO schueler_kompetenzen (id, kompetenzbereich_id, schueler_id, niveau, notiz, aktualisiert) VALUES
  (1, 1, 1, 3, NULL,           '2025-10-01'),
  (2, 1, 2, 2, 'übt fleißig',  '2025-10-01');

-- ── Stunden-/Pausenzeiten ───────────────────────────────────────────────────
-- main.js/initDB legt Default-Stundenzeiten an → für einen festen Snapshot leeren.
DELETE FROM stundenzeiten;
INSERT INTO stundenzeiten (id, stunde, beginn, ende) VALUES
  (1, 1, '07:55', '08:45'),
  (2, 2, '08:50', '09:40'),
  (3, 3, '09:55', '10:45');

-- ── Stundenplan (inkl. 14-tägiger Stunde) ───────────────────────────────────
INSERT INTO stundenplan (id, wochentag, stunde_id, fach_id, wochen_intervall, anker_datum) VALUES
  (1, 1, 1, 1, 1, NULL),          -- Mo, 1. Std, Deutsch
  (2, 1, 2, 2, 1, NULL),          -- Mo, 2. Std, Mathematik
  (3, 2, 1, 1, 1, NULL),          -- Di, 1. Std, Deutsch
  (4, 3, 3, 2, 2, '2025-09-08');  -- Mi, 3. Std, Mathematik, 14-tägig

INSERT INTO stunden_planung (id, stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link, entfall) VALUES
  (1, 1, '2025-10-13', 'Balladen', 'Einführung Balladen', 0, 'Gedicht auswählen', '2025-10-14', NULL, 0);

-- ── Supplierstunde ──────────────────────────────────────────────────────────
INSERT INTO supplierstunden (id, woche_datum, wochentag, stunde_id, klasse_text, fach_text, notiz, titel, inhalt, hue_text, hue_frist_datum, link) VALUES
  (1, '2025-10-13', 2, 3, '1A', 'Deutsch', 'Vertretung Kollegin', 'Lesestunde', NULL, NULL, NULL, NULL);

-- ── Termine ─────────────────────────────────────────────────────────────────
INSERT INTO termine (id, titel, datum, uhrzeit, bis_uhrzeit, notiz, klasse_id, schuljahr_id, stunde_id) VALUES
  (1, 'Elternabend', '2025-10-20', '18:00', '19:30', 'Aula',       1, 1, NULL),
  (2, 'Wandertag',   '2025-10-05', NULL,    NULL,    NULL,         1, 1, 2);

-- ── Todos ───────────────────────────────────────────────────────────────────
INSERT INTO todos (id, titel, erledigt, klasse_id, fach_id, faelligkeit, erinnerung, reihenfolge) VALUES
  (1, 'Schularbeiten korrigieren', 0, 1, 1, '2025-10-16', '2025-10-15', 1),
  (2, 'Materialien kopieren',      0, 1, 1, '2025-10-10', NULL,         2);

-- ── Benutzerdefinierte Ferien ───────────────────────────────────────────────
INSERT INTO custom_ferien (id, schuljahr_id, name, von, bis) VALUES
  (1, 1, 'Schulautonom frei', '2025-11-03', '2025-11-03');

-- ── Jahresplanung (Fach 1) ──────────────────────────────────────────────────
INSERT INTO jahresplanung_abschnitte (id, fach_id, titel, inhalt, datum_von, datum_bis, farbe, reihenfolge, material_ordner, lernziele, kompetenzen) VALUES
  (1, 1, 'Balladen', 'Balladen lesen und schreiben', '2025-10-01', '2025-10-31', '#fb6936', 1, NULL, 'Balladen erkennen', 'Lesen, Schreiben');

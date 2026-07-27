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

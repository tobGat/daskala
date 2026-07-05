# Daskala — KV-Modul

**Spezifikation**
Stand: Mai 2026 · Autor: Tobias

---

## 1. Ziel

Erweiterung von Daskala um ein Klassenvorstand-Modul, das die drei Ebenen der KV-Arbeit operationalisiert:

1. **Jahresplaner** — wiederkehrende Aufgaben pro Monat
2. **Wochenroutine** — kleine Wochen-Checks (≈ 10 min)
3. **Trigger-Warnungen** — ereignisgetriebene Pflichten (Frühwarnung, Fehlstundenschwellen, Aktenvermerke …)

Rechtliche Grundlage: § 54 SchUG sowie §§ 19, 20, 45, 47, 48, 63a SchUG.

---

## 2. Annahmen über den Daskala-Bestand

> *Bitte vor Beginn prüfen und ggf. korrigieren. Wenn Annahmen falsch sind, Migration entsprechend anpassen.*

- Daskala läuft als **Electron-App** (Renderer + Main, vermutlich mit `better-sqlite3`).
- Existierende Entitäten: `klasse`, `schueler`, `fach`, `note` (oder Äquivalent).
- Datenbank liegt lokal unter `~/.daskala/daskala.db` (oder analog im App-Data-Pfad).
- DSGVO: Alles strikt **lokal**, keine Cloud-Calls.
- UI vermutlich React oder Svelte; Tailwind als Styling-Layer.

**Falls eines davon nicht zutrifft:** zuerst kurze Klarstellung mit Tobias, danach Spec anpassen.

---

## 3. Scope

### In Scope (MVP)
- Datenmodell für die 4 KV-Bereiche (s. § 4)
- 4 neue Views: Dashboard, Jahresplaner, Wochenroutine, Trigger-Liste
- Erweiterung der `schueler`-Detailansicht um KV-Daten (Fehlstundenkonto, Aktenvermerke, Elternkontakte)
- Automatische Trigger-Erzeugung auf Basis bestehender Fehlstunden/Notendaten
- PDF-Export der Wochen-/Jahres-Checkliste (analog zur bestehenden HTML-Checkliste)

### Out of Scope (vorerst)
- E-Mail-Versand an Eltern (nur Vorlagen generieren)
- Mehrbenutzer-Synchronisation
- Mobile-App
- Cloud-Backup

---

## 4. Datenmodell (SQLite)

```sql
-- Schuljahr-Kontext (falls noch nicht vorhanden)
CREATE TABLE IF NOT EXISTS schuljahr (
  id          INTEGER PRIMARY KEY,
  bezeichnung TEXT NOT NULL,           -- "2026/27"
  start_datum DATE NOT NULL,
  end_datum   DATE NOT NULL,
  aktiv       INTEGER DEFAULT 0
);

-- 4.1 Jahresplaner-Aufgaben (Vorlagen)
CREATE TABLE kv_jahresaufgabe_template (
  id          INTEGER PRIMARY KEY,
  monat       INTEGER NOT NULL,        -- 1..12 (Schuljahr: 9..6)
  titel       TEXT NOT NULL,
  beschreibung TEXT,
  rechtsbezug TEXT,                    -- "§ 19 Abs. 4 SchUG"
  kategorie   TEXT,                    -- "konferenz" | "elternarbeit" | "doku" | "organisation"
  sortierung  INTEGER DEFAULT 0
);

-- 4.2 Jahresplaner-Status (pro Schuljahr & Klasse)
CREATE TABLE kv_jahresaufgabe_status (
  id           INTEGER PRIMARY KEY,
  template_id  INTEGER NOT NULL REFERENCES kv_jahresaufgabe_template(id),
  schuljahr_id INTEGER NOT NULL REFERENCES schuljahr(id),
  klasse_id    INTEGER NOT NULL REFERENCES klasse(id),
  erledigt_am  DATETIME,
  notiz        TEXT,
  UNIQUE(template_id, schuljahr_id, klasse_id)
);

-- 4.3 Wochenroutine-Aufgaben (Vorlagen, ähnlich zu 4.1)
CREATE TABLE kv_wochenaufgabe_template (
  id          INTEGER PRIMARY KEY,
  titel       TEXT NOT NULL,
  rechtsbezug TEXT,
  sortierung  INTEGER DEFAULT 0,
  aktiv       INTEGER DEFAULT 1
);

-- 4.4 Wochenroutine-Status pro KW
CREATE TABLE kv_wochenaufgabe_status (
  id           INTEGER PRIMARY KEY,
  template_id  INTEGER NOT NULL REFERENCES kv_wochenaufgabe_template(id),
  schuljahr_id INTEGER NOT NULL REFERENCES schuljahr(id),
  klasse_id    INTEGER NOT NULL REFERENCES klasse(id),
  kalenderwoche INTEGER NOT NULL,      -- 1..53
  jahr         INTEGER NOT NULL,
  erledigt_am  DATETIME,
  notiz        TEXT,
  UNIQUE(template_id, klasse_id, kalenderwoche, jahr)
);

-- 4.5 Trigger-Events (manuell + automatisch erzeugt)
CREATE TABLE kv_trigger_event (
  id           INTEGER PRIMARY KEY,
  klasse_id    INTEGER NOT NULL REFERENCES klasse(id),
  schueler_id  INTEGER REFERENCES schueler(id),    -- optional
  typ          TEXT NOT NULL,                      -- "fruehwarnung" | "fehlstunden_30" | "fehlstunden_15" | "vorfall" | "elternkontakt" | "kindeswohl" | "schulveranstaltung"
  schweregrad  TEXT NOT NULL DEFAULT 'info',       -- "info" | "warn" | "critical"
  auslöser     TEXT,                                -- Maschinen-Beschreibung
  beschreibung TEXT,                                -- Freitext
  erstellt_am  DATETIME DEFAULT CURRENT_TIMESTAMP,
  reagiert_am  DATETIME,                            -- wann hat der KV reagiert
  reaktion     TEXT,                                -- was wurde getan
  archiviert   INTEGER DEFAULT 0
);

-- 4.6 Aktenvermerke (Vorfälle, Beobachtungen, Gespräche)
CREATE TABLE kv_aktenvermerk (
  id            INTEGER PRIMARY KEY,
  schueler_id   INTEGER REFERENCES schueler(id),
  klasse_id     INTEGER NOT NULL REFERENCES klasse(id),
  datum         DATE NOT NULL,
  typ           TEXT NOT NULL,                     -- "vorfall" | "gespraech_eltern" | "gespraech_schueler" | "beobachtung" | "erziehungsmassnahme"
  titel         TEXT NOT NULL,
  beschreibung  TEXT NOT NULL,
  zeugen        TEXT,
  folgemassnahme TEXT,
  erstellt_am   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4.7 Elternkontakte (Telefonate, Mails, persönliche Gespräche)
CREATE TABLE kv_elternkontakt (
  id           INTEGER PRIMARY KEY,
  schueler_id  INTEGER NOT NULL REFERENCES schueler(id),
  datum        DATE NOT NULL,
  art          TEXT NOT NULL,                     -- "telefon" | "mail" | "persoenlich" | "elternsprechtag"
  initiator    TEXT NOT NULL,                     -- "kv" | "eltern"
  thema        TEXT NOT NULL,
  inhalt       TEXT,
  erledigt     INTEGER DEFAULT 1                  -- 0 = offener Rückruf
);

-- 4.8 Fehlstundenkonto (sofern nicht schon existent)
-- Falls Daskala bereits Anwesenheit trackt: hier nur ergänzen.
-- Sonst minimale Variante:
CREATE TABLE kv_fehlstunde (
  id            INTEGER PRIMARY KEY,
  schueler_id   INTEGER NOT NULL REFERENCES schueler(id),
  datum         DATE NOT NULL,
  stunden       INTEGER NOT NULL,
  entschuldigt  INTEGER NOT NULL DEFAULT 0,
  grund         TEXT
);
```

**Seed-Daten**: Vorlagen aus der bestehenden HTML-Checkliste (`kv-checkliste.html`) übernehmen — 12 Monate × 3–6 Aufgaben sowie 7 Wochenaufgaben. Liste ist im Anhang A.

---

## 5. UI-Struktur

### 5.1 Neue Top-Level-Navigation: „KV"
Sichtbar nur, wenn aktueller Benutzer als KV mindestens einer Klasse markiert ist.

### 5.2 Views

#### A. KV-Dashboard (Landing)
- **Heutige offene Trigger** (kritisch zuerst)
- **Diese Woche fällig** (aus Wochenroutine + Jahresplaner)
- **Klassen-Auswahl** (falls KV mehrerer Klassen)
- **Quick-Actions**: „Aktenvermerk anlegen", „Elternkontakt loggen", „Fehlstunde eintragen"

#### B. Jahresplaner
- Raster wie in der HTML-Checkliste (12 Karten)
- Klick auf Aufgabe → Häkchen + optionale Notiz
- Filter: erledigt / offen / alle
- Druckansicht (siehe § 7)

#### C. Wochenroutine
- Tabelle: Zeilen = Aufgaben, Spalten = letzte 8 KW
- Aktuelle KW hervorgehoben
- Ein Klick = erledigt mit Zeitstempel
- Lange gedrückt / Rechtsklick = Notiz

#### D. Trigger-Liste
- Liste aller offenen Trigger, gruppiert nach Schweregrad
- Pro Trigger: Auslöser, betroffene Person, Reaktionsfeld
- „Abgearbeitet" = setzt `reagiert_am` + verschiebt in Archiv

#### E. Schülerprofil (Erweiterung der bestehenden Schüler-Detailansicht)
Tabs / Sektionen:
- **Übersicht** (existierend, beibehalten)
- **Fehlstunden** (Konto, Schwellen 5/15/30 farblich)
- **Aktenvermerke** (chronologisch)
- **Elternkontakte** (chronologisch, offene Rückrufe oben)
- **Trigger-Historie**

### 5.3 Komponenten-Hinweise
- Konsistent mit bestehendem Daskala-Styling
- Tastatur-Shortcuts: `n` = neuer Aktenvermerk, `e` = neuer Elternkontakt, `t` = Trigger-Liste

---

## 6. Automatische Trigger

Beim Speichern relevanter Daten werden Trigger-Events erzeugt:

| Auslöser | Trigger-Typ | Schweregrad |
|---|---|---|
| Note < 4 in einem Fach eingetragen | `fruehwarnung` | warn |
| Note-Verschlechterung um ≥ 2 Stufen | `fruehwarnung` | warn |
| Summe unentschuldigte Fehlstunden ≥ 15 | `fehlstunden_15` | warn |
| Summe unentschuldigte Fehlstunden ≥ 30 | `fehlstunden_30` | critical |
| Neuer Aktenvermerk Typ „vorfall" | `vorfall` | info |
| Offener Elternkontakt > 3 Tage | `elternkontakt` | warn |
| Schulveranstaltung in < 14 Tagen ohne Genehmigungs-Status | `schulveranstaltung` | warn |

Trigger werden nicht stumm geschlossen — sie verlangen `reagiert_am` + `reaktion`-Text, bevor sie ins Archiv wandern. Das erzwingt Dokumentation.

---

## 7. Druck-/Export

- Bestehende HTML-Checkliste (`kv-checkliste.html`) als Vorlage übernehmen
- PDF-Export via Electron-Print (`webContents.printToPDF`)
- Dynamische Variante: aktuelle Klasse + Schuljahr in Header einsetzen, Stati übernehmen (Häkchen für erledigt)

---

## 8. Phasen / Reihenfolge

### Phase 1 — Fundament (1–2 Sitzungen)
1. Migration anlegen: alle `kv_*`-Tabellen + `schuljahr` (falls fehlt)
2. Seed der Vorlagen aus Anhang A
3. KV-Markierung pro Klasse (`klasse.kv_user_id` oder ähnlich)
4. Navigationspunkt „KV" + leere Views

### Phase 2 — Jahresplaner & Wochenroutine
1. Jahresplaner-View mit Toggle-Häkchen + Notizen
2. Wochenroutine-View mit KW-Spalten
3. Persistenz testen

### Phase 3 — Trigger & Aktenvermerke
1. Trigger-Liste
2. Aktenvermerk-CRUD + Integration ins Schülerprofil
3. Elternkontakt-CRUD
4. Automatische Trigger-Hooks an Note-/Fehlstunden-Save

### Phase 4 — Dashboard & Export
1. KV-Dashboard mit aggregierten Daten
2. PDF-Export der Checklisten
3. Polishing, Shortcuts

---

## 9. Akzeptanzkriterien

Pro Phase erfüllt, wenn:

- [ ] Migrationen laufen ohne Fehler (`down` + `up` getestet)
- [ ] Jede neue View lädt < 200 ms bei 30 Schüler:innen
- [ ] Alle CRUD-Operationen sind im Renderer mit Hot-Reload nutzbar
- [ ] Keine externen HTTP-Calls (DSGVO-Check)
- [ ] Tastatur-Shortcuts funktionieren
- [ ] PDF-Export erzeugt eine A4-Seite, druckbar
- [ ] Manueller Smoke-Test mit Beispielklasse (Anhang B) erfolgreich

---

## 10. Technik-Notizen

- **Datumshandling**: `date-fns` mit Locale `de-AT`. KW-Berechnung nach ISO 8601.
- **Schuljahr-Logik**: Schuljahr beginnt am 1. Montag im September (OÖ). Helfer-Funktion `getCurrentSchuljahr()` zentral.
- **Migrations**: bestehende Daskala-Migrationsstrategie übernehmen (vermutlich `knex` oder eigene SQL-Files).
- **Tests**: Mindestens Trigger-Auto-Erzeugung mit Unit-Test abdecken.

---

## Anhang A — Seed-Daten Vorlagen

### Jahresaufgaben (gekürzt; volle Liste aus `kv-checkliste.html` extrahieren)

```
9 | Klassenliste & Sitzplan        | organisation
9 | Begrüßung & Klassenregeln       | organisation
9 | Belehrungen                     | doku
9 | Notfallkontakte einholen        | doku
9 | Klassendienste verteilen        | organisation
9 | Termin Klassenforum festlegen   | elternarbeit
10 | Klassenforum durchführen       | elternarbeit  | § 63a SchUG
10 | Erste Elterngespräche          | elternarbeit
10 | Klassendynamik beobachten      | doku
10 | Schulveranstaltungen planen    | organisation
11 | Leistungsstand erheben         | doku
11 | Elternsprechtag                | elternarbeit
11 | Frühwarnungen vorbereiten      | doku
11 | Aktenvermerke aktualisieren    | doku
12 | Frühwarnungen versenden        | doku          | § 19 Abs. 4 SchUG
12 | Konferenzanträge einbringen    | konferenz
12 | Verhaltensbeurteilung vorbereiten | konferenz  | § 20 SchUG
... (komplette Liste in der HTML-Checkliste, Monate 1–8)
```

### Wochenaufgaben

```
1 | Klassenbuch durchgesehen                       | § 54 SchUG
2 | Entschuldigungen eingesammelt                  | § 45 SchUG
3 | Fehlstundenkonto geprüft (5/15/30 h)           |
4 | Rückmeldungen vom Lehrer:innenteam             | § 54 SchUG
5 | Aktenvermerke nachgezogen                      |
6 | Offene Eltern-Rückrufe/Mails                   | § 48 SchUG
7 | Wochenausblick (Termine, Veranstaltungen)      |
```

---

## Anhang B — Smoke-Test-Szenario

1. Beispielklasse mit 5 Schüler:innen anlegen
2. Bei einem:r Schüler:in 30 unentschuldigte Stunden eintragen → muss `fehlstunden_30`-Trigger erzeugen (critical)
3. „Nicht genügend" eintragen → muss `fruehwarnung`-Trigger erzeugen
4. Aktenvermerk Typ „vorfall" → muss in Trigger-Liste auftauchen
5. Elternkontakt mit `erledigt=0` und Datum vor 4 Tagen → muss als offener Rückruf-Trigger erscheinen
6. Jahresaufgabe abhaken → Persistenz prüfen (Neustart)
7. PDF-Export prüfen

---

## Offene Fragen für Tobias

- Hat Daskala bereits eine Anwesenheits-/Fehlstunden-Erfassung? Falls ja → Tabelle 4.8 entfällt.
- Wie ist das Schulhalbjahr aktuell modelliert? (Semesterwechsel-Trigger relevant)
- Soll der KV-Tab auch dann sichtbar sein, wenn man nur stellvertretend hilft?
- Eltern-Vorlagen-Texte (Frühwarnung, 30h-Verständigung): in dieser Phase mitliefern oder später?

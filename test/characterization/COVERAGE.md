# Charakterisierungs-Abdeckung (Phase 0)

Übersicht, welche der **207 IPC-Kanäle** abgesichert sind. Der Abdeckungs-Wächter
`coverage.test.cjs` erzwingt: **jeder Kanal ist entweder charakterisiert oder mit
Grund ausgeschlossen** – ein neuer, nicht abgesicherter Kanal lässt den Test
fehlschlagen. Kein stiller blinder Fleck.

Ausführen: `npm run test:core` · Neu einfrieren: `npm run test:core:update`

## Zusammenfassung

| | abgedeckt | ausgeschlossen | Summe |
|---|---:|---:|---:|
| READ  | 50  | 4  | 54 |
| WRITE | 108 | 35 | 143 |
| EXPORT| 0   | 10 | 10 |
| **Summe** | **158** | **49** | **207** |

- **READ (50):** `read-channels.test.cjs` – Rückgabewert-Snapshots über alle Domänen
  (Kern, Fächer, Schüler:innen inkl. Leistungsprofil, Noten/Zeugnis, Niveau,
  Kompetenzen, Stundenplan + Wochen-Planung, Supplierstunden, Todos, Termine,
  Ferien, Jahresplanung, Sitzplan, **alle KV-Reads**).
- **WRITE (108):** `write-channels.test.cjs` – DB-Zustand-Snapshots nach dem Aufruf
  (Zeitstempel normalisiert), inkl. Sonderfälle `klassen:delete` (Kaskade),
  `stundenplan:verschieben` (Tausch), `niveau:set` (Historie), `klassen:duplizieren`,
  `jahresplanung:importVonFach`/`anwendenAufFaecher`, `schueler:importBatch`,
  `stundenzeiten:saveAll`, `noten:rechneAllesNeu`, `undo:*`.

## Ausgeschlossen (49, mit Grund)

Kanäle, die nicht mit dem Datenmodell interagieren, sondern mit Dialog,
Dateisystem, System oder Netzwerk – für die Datenintegrität des Umbaus nicht
relevant (Liste + Gründe in `coverage.test.cjs`):

- **Export (11):** alle `export:*` + `schueler:exportProfilPDF` – erzeugen Dateien.
- **Materialien (8):** `materialien:*` – Dateisystem/Explorer.
- **Backup (10):** `backup:*` – Dateisystem/Dialog.
- **Sperre (5):** `sperre:*` – Authentifizierung (separat abzusichern).
- **Dialog/Datei (7):** `db:saveAs/open`, `dialog:*`, `datei:speichereText`,
  `import:schuelerFromFile`, `jahresplanung:importVonDatei`.
- **System/Netzwerk (7):** `shell:open`, `app:clipboard/reset/version`,
  `update:installieren`, `wetter:getWoche/sucheOrt`.
- **Spezialfall (1):** `jahresabschluss:neuesSchuljahr` – umfangreicher
  Schuljahreswechsel; verdient einen eigenen, gezielten Test (Phase 1).

## Laufzeit

Alle Charakterisierungstests laufen unter **Electron-as-Node**
(`ELECTRON_RUN_AS_NODE=1`, better-sqlite3-ABI). In CI: Job `characterization`.

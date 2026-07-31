# Charakterisierungs-Abdeckung (Phase 0)

Stand-Übersicht, welche der **207 IPC-Kanäle** durch Charakterisierungstests
abgesichert sind. Ziel für Checkpoint 0: jeder Kanal ist entweder **abgedeckt**
oder **bewusst ausgeschlossen** (mit Grund). Kein stiller blinder Fleck.

Ausführen: `npm run test:core` · Neu einfrieren: `npm run test:core:update`

## Zusammenfassung

| Kategorie | Kanäle | abgedeckt | offen | ausgeschlossen |
|---|---:|---:|---:|---:|
| READ    | 54  | **50** | 0 | 4 |
| WRITE   | 143 | **16** | ~113 | 14 |
| EXPORT  | 10  | 0 | 0 | 10 |
| **Summe** | **207** | **66** | ~113 | 28 |

## READ – 50 abgedeckt

Siehe `read-channels.test.cjs`. Abgedeckt sind u. a. alle `getAll`/`get`-Kanäle der
Domänen Einstellungen, Schuljahre, Klassen, Fächer, Schüler:innen (inkl.
Leistungsprofil), Spalten, Einträge, Verlauf, Zeugnisnoten, Notizen, Gewichtung,
Niveau (+Historie), Kompetenzen, Stundenzeiten/-plan, Wochen-Planung (get/getWoche/
getHueWoche/checkMusizieren), Supplierstunden, Todos, Termine, Ferien, Jahresplanung,
Sitzplan sowie **alle KV-Reads** und `update:pruefen`.

### READ ausgeschlossen (4)

| Kanal | Grund |
|---|---|
| `wetter:getWoche` | Netzwerkabruf (open-meteo) – nicht deterministisch |
| `backup:getList` | liest Dateisystem-Backupverzeichnis |
| `backup:liste` | liest Dateisystem-Backupverzeichnis |
| `sperre:pruefe` | PIN-Prüfung; separat abzusichern |

## WRITE – 16 abgedeckt, ~113 offen

Abgedeckt (`write-channels.test.cjs`, DB-Zustand-Snapshots inkl. Sonderfälle):
`einstellungen:set`, `klassen:create`, `klassen:delete` (Kaskade), `faecher:create`,
`schueler:create`, `spalten:create`, `eintraege:set` (neu/update), `notizen:set`,
`niveau:set` (Historie), `termine:create`/`update`, `todos:create`/`toggleErledigt`,
`stundenplan:create`, `stundenplan:verschieben` (Tausch).

**Offen (~113):** die übrigen CRUD-/Status-Kanäle der Domänen faecher, schueler,
spalten, zeugnisnoten, kompetenzen, niveau, stundenzeiten/-plan, stundenPlanung,
supplierstunden, todos, termine, customFerien, jahresplanung, sitzplan, gewichtung,
schuljahre/klassen (rename/setFarbe/reorder/…) und der gesamte **KV-Schreibblock**;
dazu die Sonderfälle `jahresabschluss:neuesSchuljahr`, `noten:rechneAllesNeu`,
`undo:execute/redo/state`. → nächster Arbeitsschritt.

### WRITE ausgeschlossen (14 – Dialog/Dateisystem/System/Netzwerk)

`shell:open`, `app:clipboard`, `app:reset`, `db:saveAs`, `db:open`,
`dialog:openFile`, `dialog:saveFile`, `datei:speichereText`,
`import:schuelerFromFile`, `schueler:exportProfilPDF`, `backup:waehleOrdner`,
`materialien:*` (Dateisystem/Explorer), `wetter:sucheOrt` (Netzwerk),
`sperre:setPin/deaktivieren/setGesperrt` – interagieren mit Electron-Dialogen,
Dateisystem oder Netzwerk, nicht mit dem Datenmodell.

## EXPORT – 10 offen/ausgeschlossen

`export:*` erzeugen Dateien (PDF/ODS/ODT/DOCX/JSON) über Datei-Dialog + printToPDF.
Für die Datenintegrität des Umbaus zweitrangig; ggf. später ein „läuft ohne Fehler"-
Smoke. `export:toJson` (reine Serialisierung der DB) ist ein Kandidat für echte
Charakterisierung.

---

Diese Übersicht wird bei Checkpoint 0 in einen **fehlschlagenden** Test überführt
(jeder nicht gelistete neue Kanal bricht die Abdeckung), sobald WRITE vollständig ist.

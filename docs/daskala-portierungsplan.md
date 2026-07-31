# Daskala – Portierungsplan Phase A: plattformunabhängiger Kern

Auftrag für Claude Code. Repo: `github.com/tobGat/daskala`, Stand v1.0.55.

## Arbeitsprotokoll für Claude Code (bitte zuerst lesen)

Dieses File ist deine Arbeitsgrundlage. Arbeite die Phasen 0 → 1 → 2 → 3 der
Reihe nach ab. Halte dich an folgende Regeln, ausnahmslos:

1. **Kein Commit darf `npm run build` oder `npm run dev` brechen.** Die
   Desktop-App ist im Microsoft Store und produktiv im Einsatz mit echten
   Notendaten. Ein gebrochener Build ist der schwerste Fehler, den du machen
   kannst.
2. **Ein Schritt = ein Commit.** Nach jedem Commit die Testsuite laufen lassen.
   Sie muss grün sein, bevor der nächste Schritt beginnt.
3. **Kein Verhaltens-Refactoring nebenbei.** Diese Phase verschiebt Code, sie
   verbessert ihn nicht. Auffälligkeiten als `TODO(portierung)` markieren, nicht
   ändern.
4. **`renderer/` bleibt in Phase 1 vollständig unangetastet.** `window.api`
   (definiert in `preload.js`) bleibt bitweise identisch.
5. **Halte an jedem „Checkpoint" und an jedem STOP an** und lege den Stand
   Tobias zur Freigabe vor, bevor du weitermachst. Insbesondere: nach dem
   Pilot-Commit (`einstellungen`) in Phase 1 anhalten und warten.
6. Arbeite auf dem Branch `refactor/core-extraction`. Merge nach `main` nur an
   den markierten Checkpoints.
7. Wenn etwas vom Plan abweicht oder unklar ist: nicht raten, sondern fragen.

Beginne mit Phase 0, Schritt 0.1.

## Ziel dieses Plans

Daskala soll später zusätzlich auf Android laufen. Ob das über **Capacitor**
(Electron-Desktop bleibt unangetastet) oder über **Tauri 2** (ersetzt Electron
komplett) geschieht, wird **am Ende dieses Plans** entschieden, nicht davor.

Der Grund: Die Arbeit, die für beide Wege identisch ist, macht den Großteil des
Aufwands aus. Diese Arbeit wird zuerst erledigt. Danach ist der Zielrahmen ein
austauschbarer Adapter statt einer Grundsatzentscheidung.

**Am Ende dieses Plans läuft die App auf keiner neuen Plattform.** Sie läuft
weiterhin exakt wie heute auf dem Desktop – aber auf einer Codebasis, die den
Wechsel erlaubt.

## Nicht verhandelbare Randbedingungen

1. **Die Desktop-App ist im Microsoft Store veröffentlicht und im Produktiv-
   einsatz mit echten Schülerdaten.** Kein Commit auf `main`, der `npm run dev`
   oder `npm run build` bricht.
2. **Kein Verhaltens-Refactoring.** Diese Phase verschiebt Code, sie verbessert
   ihn nicht. Wenn dir eine Verbesserung auffällt: `TODO(portierung)`-Kommentar
   setzen und weitergehen. Vermischte Änderungen machen Fehler unauffindbar.
3. **Der Vertrag `window.api` bleibt bitweise identisch.** `preload.js` definiert
   rund 250 Methoden. `renderer/` (16.370 Zeilen) darf in dieser Phase **gar
   nicht** angefasst werden. Das ist die wichtigste Regel des Plans: Sie ist die
   Messlatte dafür, ob der Umbau korrekt war.
4. Arbeit läuft auf einem Branch `refactor/core-extraction`, Merge nach `main`
   nur an den markierten Checkpoints.

## Ausgangslage (verifiziert)

| Datei | Zeilen | Inhalt |
|---|---|---|
| `main.js` | 5.028 | Helfer (Z. 1–1571), `registerIPC()` (Z. 1572–5028) |
| `preload.js` | 357 | ~250 Methoden über ~40 Domänen |
| `renderer/` | 16.370 | React 18, Zustand, Tailwind |

- 209 `ipcMain.handle`-Registrierungen, Kanalschema `domaene:methode`
  bzw. `domaene:unterdomaene:methode`
- 430 `db.prepare(...)`-Aufrufe, **synchron** (better-sqlite3)
- 37 Tabellen, 3 `ALTER TABLE`-Migrationen
- Node-Abhängigkeiten im Main: `fs` (60×), `dialog` (23×), `BrowserWindow`
  + `printToPDF`, `https`, `crypto`, `jszip`, `xlsx`, `docx`
- Testabdeckung: **eine** Datei (`test/avatar-code.test.mjs`)

Der letzte Punkt ist das größte Risiko des gesamten Vorhabens.

---

# Phase 0 – Sicherheitsnetz

**Ohne diese Phase nicht weitermachen.** Ein 5.000-Zeilen-Umbau ohne Tests an
einer Software, die Notendaten hält, ist nicht verantwortbar.

## 0.1 Charakterisierungstests

Erzeuge `test/fixtures/seed.sql`: eine realistische Testdatenbank mit 2 Schul-
jahren, 3 Klassen, ~20 Schüler:innen, mehreren Fächern, Spalten, Einträgen,
Zeugnisnoten, Stundenplan, Sitzplan, KV-Daten.

Erzeuge `test/characterization/` mit einem Test pro IPC-Kanal, der Daten liest:

```js
// Muster
const result = await callHandler('klassen:getAll', 1)
assert.deepStrictEqual(result, SNAPSHOT.klassen_getAll_1)
```

Snapshots werden **jetzt** vom bestehenden Code erzeugt und eingefroren. Sie
definieren „korrekt" für den gesamten Rest des Plans.

Zielabdeckung: alle 209 Kanäle. Schreibende Kanäle werden gegen eine Kopie der
Fixture ausgeführt, danach wird der DB-Zustand als Snapshot verglichen.

Das ist viel Arbeit. Es ist die Arbeit, die den Rest sicher macht.

## 0.2 API-Oberflächen-Test

`test/api-surface.test.mjs`: liest `preload.js`, erzeugt daraus die vollständige
Liste der Pfade (`einstellungen.get`, `kv.jahresaufgaben.getAlle`, …), vergleicht
mit einer eingefrorenen Liste. Schlägt fehl, sobald eine Methode verschwindet,
hinzukommt oder umbenannt wird.

## 0.3 Smoke-Test

`npm run build` muss durchlaufen und ein startfähiges Paket erzeugen. Als
GitHub-Actions-Job bei jedem Push auf den Branch.

**Checkpoint 0:** Alle Tests grün auf unverändertem Code. Merge nach `main`.
Tests sind auch ohne Portierung ein Gewinn.

---

# Phase 1 – Kern herauslösen

Ziel: `main.js` schrumpft von 5.028 auf unter 200 Zeilen. Der gesamte Inhalt
liegt danach in Modulen ohne einen einzigen `require('electron')`.

## 1.1 Zielstruktur

```
core/
  db/
    schema.js            CREATE TABLE + Migrationen als Datenstruktur
    connection.js        Adapter-Interface (Phase 2 füllt es)
  domain/
    einstellungen.js     3 Handler
    schuljahre.js        2
    klassen.js          12
    faecher.js          11
    niveau.js            4
    schueler.js          9
    spalten.js           8
    eintraege.js         3
    zeugnisnoten.js      5
    notizen.js           2
    gewichtung.js        2 + rechneAllesNeu
    stundenzeiten.js     5
    stundenplan.js       7
    stundenplanung.js    8
    jahresplanung.js     9
    sitzplan.js          7
    kompetenzen.js       6 + schuelerKompetenzen 2
    todos.js             5
    termine.js           4
    supplierstunden.js   4
    jahresabschluss.js   1 (umfangreich)
    undo.js              3
    kv/
      jahresaufgaben.js
      wochenaufgaben.js
      dokumentation.js   Aktenvermerke, Elternkontakte, Fehlstunden
      trigger.js
      routine.js         zusammen 32 Handler
  services/
    notenberechnung.js   aus gewichtung/zeugnisnoten extrahiert
    pdf-html/            die HTML-Generatoren aus main.js Z. 1–1571
    export-ods.js        xlsx-basiert
    export-docx.js       docx-basiert
    schulferien.js       ggf. mit renderer/utils/schulferien.js zusammenführen
  ports/
    index.js             Interface-Definitionen, JSDoc
  index.js               setzt aus domain/* das api-Objekt zusammen
platform/
  electron/
    main.js              Fenster, App-Lifecycle
    ipc.js               registriert core/index.js als IPC-Kanäle
    ports/               Electron-Implementierungen der Ports
```

## 1.2 Ports definieren

Alles, was heute Electron oder Node direkt aufruft, wird zu einem Interface.
Jede Kernfunktion bekommt die Ports injiziert, statt sie zu importieren.

| Port | ersetzt heute | Methoden |
|---|---|---|
| `fs` | `require('fs')`, 60 Stellen | `read`, `write`, `exists`, `mkdir`, `list`, `remove`, `copy`, `stat` |
| `paths` | `app.getPath('userData')` | `userData()`, `temp()`, `documents()` |
| `dialog` | `dialog.*`, 23 Stellen | `openFile`, `openDirectory`, `saveFile`, `message` |
| `pdf` | `htmlZuPdf` / `printToPDF` | `fromHtml(html, opts) -> Uint8Array` |
| `http` | `require('https')`, Wetter | `getJson(url)` |
| `shell` | `shell.openExternal/openPath` | `openExternal`, `openPath` |
| `updater` | `electron-updater` | `check`, `onStatus` |
| `clipboard` | `clipboard.*` | `writeText` |

Signaturen ausschließlich mit primitiven Typen, Strings, Uint8Array. Kein
Electron-Typ darf durch ein Port-Interface hindurchreichen.

## 1.3 Vorgehen pro Domäne

Strikt eine Domäne pro Commit, in dieser Reihenfolge (klein und isoliert
zuerst, damit sich das Muster einspielt):

1. `einstellungen` – Pilot, 3 Handler, keine Ports
2. `schuljahre`, `notizen`, `gewichtung`, `todos`, `termine`
3. `klassen`, `faecher`, `schueler`, `niveau`
4. `spalten`, `eintraege`, `zeugnisnoten`, `kompetenzen`
5. `stundenzeiten`, `stundenplan`, `stundenplanung`, `supplierstunden`
6. `sitzplan`, `jahresplanung`, `undo`
7. `kv/*` – größter Block, in fünf Commits
8. Export/Backup/Material – am meisten Port-Kontakt, deshalb zuletzt
9. `jahresabschluss` – berührt fast alles, ganz zum Schluss

Pro Commit:
- Handler-Rumpf nach `core/domain/<name>.js` als benannte, exportierte Funktion
- `ipcMain.handle` in `main.js` ruft nur noch diese Funktion auf
- Charakterisierungstests laufen lassen – müssen grün bleiben
- App manuell starten, betroffene Ansicht öffnen

**Der Pilot-Commit (`einstellungen`) wird nicht automatisiert.** Erst wenn das
Muster steht und ich es freigegeben habe, gehen die übrigen Domänen im Takt.

## 1.4 IPC-Registrierung generieren

Wenn alle Domänen extrahiert sind: Das Kanalschema `domaene:methode` bildet die
Modulstruktur exakt ab. `platform/electron/ipc.js` kann die 209 Registrierungen
daher aus `core/index.js` **erzeugen** statt sie aufzuzählen. Der zentrale
Fehler-Wrapper aus `main.js` Z. 1576 bleibt erhalten.

Danach fällt Boilerplate weg und `main.js` ist auf Fenstererzeugung und
Lifecycle reduziert.

**Checkpoint 1:** `main.js` < 200 Zeilen, `core/` enthält keinen einzigen
`require('electron')` (per Test prüfen), alle Charakterisierungstests grün,
API-Oberfläche unverändert, Store-Build läuft. Merge nach `main`, Release
v1.1.0 als reines Refactoring-Release.

---

# Phase 2 – Datenzugriff asynchron und austauschbar

Das ist der Punkt, an dem die Portierung technisch möglich wird.
`better-sqlite3` ist synchron, jedes mobile SQLite ist es nicht.

## 2.1 Adapter-Interface

`core/db/connection.js`:

```js
// Alle Methoden async, auch im Electron-Adapter.
export const DbPort = {
  select(sql, params) {},   // -> Promise<Array<Object>>
  selectOne(sql, params) {},// -> Promise<Object|null>
  execute(sql, params) {},  // -> Promise<{ changes, lastInsertRowid }>
  transaction(fn) {},       // fn erhält dieselbe Schnittstelle
  close() {},
}
```

Bewusst **kein** `prepare()`-Objekt im Interface: Statement-Caching ist ein
Implementierungsdetail des Desktop-Adapters und existiert mobil so nicht.

`platform/electron/db-better-sqlite3.js` implementiert es über die bestehende
Verbindung inklusive `journal_mode = WAL` und `foreign_keys = ON`. Sofort
auflösende Promises, gleiche Performance wie heute.

## 2.2 Async-Migration der 430 Aufrufstellen

Mechanisch, aber flächendeckend. Regeln:

- `db.prepare(X).get(p)` → `await db.selectOne(X, [p])`
- `db.prepare(X).all(p)` → `await db.select(X, [p])`
- `db.prepare(X).run(p)` → `await db.execute(X, [p])`
- `.lastInsertRowid` und `.changes` bleiben im Rückgabeobjekt
- `db.transaction(fn)()` → `await db.transaction(async tx => …)`
- Jede aufrufende Funktion wird `async`, Aufrufer entsprechend `await`

Codemod schreiben, nicht von Hand ändern. Danach `grep -rn "\.prepare(" core/`
– muss leer sein. Ein Lint-Regel-Test verhindert Rückfälle.

**Fallstricke, auf die zu achten ist:**

- `db.transaction()` aus better-sqlite3 verschachtelt sich anders als ein
  manuelles `BEGIN`/`COMMIT`. Betroffen sind unter anderem `klassen:delete`
  (kaskadierendes Löschen), `stundenplan:verschieben` (Tausch zweier Stunden)
  und `jahresabschluss`. Diese drei einzeln durchgehen und gezielt testen.
- Schleifen, die pro Iteration eine Query absetzen, werden durch `await`
  spürbar langsamer. Betroffene Stellen suchen und auf Batch-Queries umstellen –
  aber **erst nach** einer Messung, nicht vorsorglich.

## 2.3 Schema als Daten

`core/db/schema.js` exportiert die 37 `CREATE TABLE`-Statements und die
Migrationen als Array `[{ version, description, sql }]`. Beide Zielrahmen
brauchen diese Form: Capacitor für `@capacitor-community/sqlite`, Tauri für
`tauri_plugin_sql::Migration`.

## 2.4 UUID-Weiche für spätere Zusammenführung (additiv, nicht destruktiv)

**Hintergrund, damit die Entscheidung nachvollziehbar ist:** Daskala ist
offline-first. Ein Tester hat gefragt, ob mehrere Lehrkräfte an einer Klasse
arbeiten können. Das ist kein Echtzeit-Multi-User-Feature (das wäre ein Server
und würde den Datenschutz-Vorteil zerstören), sondern der Wunsch, getrennt
gepflegte Bestände später zusammenführen zu können – z. B. jede Lehrkraft trägt
ihr Fach ein, danach werden die Daten vereint.

Damit ein solches Zusammenführen überhaupt je möglich ist, brauchen neue Zeilen
eine geräteübergreifend eindeutige Identität. Legen zwei Offline-Geräte je einen
Schüler „Nummer 24" an, sind die mit reinen Autoincrement-IDs beim Merge nicht
mehr auseinanderzuhalten. Eine UUID pro Zeile löst das.

**Kritische Randbedingung – die bestehenden Daten der Nutzer:innen dürfen sich
nicht ändern.** Das Schema hat 24 Tabellen mit `INTEGER PRIMARY KEY
AUTOINCREMENT`, rund 50 Fremdschlüssel und 38 `ON DELETE CASCADE`, alle an diese
Integer-IDs gebunden. Die Integer-PKs durch UUIDs zu **ersetzen** würde jeden
Fremdschlüssel und jede Kaskade in produktiven Datenbanken umschreiben – hohes
Risiko für echte Notendaten. **Das wird nicht gemacht.**

Stattdessen rein additiv:

- Neue Migration (nächste Versionsnummer): Spalte `uuid TEXT` zu den
  **Entitätstabellen** hinzufügen – primär `schueler`, `klassen`, `faecher`,
  `schuljahre`, `spalten`, `eintraege`, `zeugnisnoten`, `notizen`. Nicht zu
  reinen Zuordnungs-/Statustabellen; die hängen über ihre FKs an den Entitäten.
- In derselben Migration bestehende Zeilen **einmalig** mit generierten UUIDs
  auffüllen (`UPDATE … SET uuid = … WHERE uuid IS NULL`). Kollision ist
  ausgeschlossen, UUIDs sind per Konstruktion eindeutig.
- Danach `uuid` als `UNIQUE` markieren (in SQLite über einen Unique-Index, da
  `ALTER TABLE` kein `UNIQUE` direkt nachrüstet).
- In den `INSERT`-Handlern der betroffenen Domänen bei neuen Zeilen eine UUID
  erzeugen und mitschreiben. `crypto.randomUUID()` genügt und ist in jedem
  Zielrahmen verfügbar.

**Wichtig:** Der Integer-PK bleibt der interne Schlüssel und die
FK-Referenz – daran ändert sich nichts, alle bestehenden Beziehungen bleiben
gültig. Die UUID ist ausschließlich die zusätzliche, stabile Identität für ein
**späteres** Merge. In dieser Phase wird **keine** Merge- oder Multi-User-Logik
gebaut. Es wird nur die Spalte angelegt und befüllt, damit die Tür offen bleibt.
Die Charakterisierungstests aus Phase 0 müssen unverändert grün bleiben – die
UUID-Spalte darf kein bestehendes Leseergebnis verändern (in den Snapshots ggf.
das neue Feld berücksichtigen bzw. bewusst ausklammern).

**Checkpoint 2:** Alle Tests grün, App manuell durchgeklickt, kein spürbarer
Performance-Verlust bei Klassenwechsel und Notentabelle, bestehende
Testdatenbank nach Migration unverändert lauffähig. Merge, Release v1.2.0.

---

# Phase 3 – Entscheidungs-Spikes

Erst jetzt. Beide Spikes auf eigenen Branches, **nichts davon geht nach `main`**.

Jeweils Zeitbudget: ein Arbeitstag. Wird es überschritten, ist das selbst ein
Ergebnis.

## 3.1 Spike A – Capacitor 8

Branch `spike/capacitor`.

- Capacitor 8 (Ziel-SDK 36, Pflicht für neue Play-Store-Uploads ab 31.08.2026)
- `@capacitor-community/sqlite` als zweite `DbPort`-Implementierung
- Schema aus `core/db/schema.js` einspielen
- Ports minimal stubben, außer `fs` und `pdf`
- Ziel: Klassenliste und Notentabelle einer Klasse **auf einem echten
  Android-Gerät** anzeigen

## 3.2 Spike B – Tauri 2

Branch `spike/tauri`.

- Tauri 2.10.x, `tauri-plugin-sql` mit SQLite-Feature
- Wichtig: Das Plugin hat eine JS-API. Die 430 Statements bleiben JavaScript.
  Rust-Anteil ist `lib.rs` mit Plugin-Registrierung, die Migrationen aus
  `core/db/schema.js` und `capabilities/default.json`. Größenordnung 150 Zeilen.
- Dritte `DbPort`-Implementierung, identisches Interface
- Gleiches Ziel wie Spike A – **plus** zusätzlich: Desktop-Build unter Windows
  starten und Stundenplan sowie Notentabelle visuell mit dem Electron-Build
  vergleichen

Der zweite Punkt ist der eigentliche Zweck von Spike B. Tauri nutzt WebView2
statt gebündeltem Chromium; `Stundenplan.jsx` (1.630 Zeilen) und
`NotenTabelle.jsx` (867) sind dichte CSS-Grid-Layouts. Wenn dort etwas bricht,
entscheidet das die Frage.

## 3.3 Bericht

Kein Vorschlag, sondern eine Gegenüberstellung mit Belegen:

- Was lief, was nicht, wo genau ist es gescheitert
- Verbleibender Aufwand bis lauffähige Android-Version, je Weg
- Bei Tauri: gefundene WebView-Abweichungen, mit Screenshots
- Was am Desktop kaputtginge (bei Tauri: MSIX neu, Store-Neueinreichung,
  `electron-updater` ersetzen)

**Checkpoint 3:** Bericht liegt vor. Entscheidung treffe ich, nicht du.

---

# Was in diesem Plan bewusst nicht vorkommt

- Play-Console-Konto, Signing-Key, 12-Tester-Regel, Data-Safety-Formular
- Responsive Anpassung der Desktop-Ansichten
- CI-Pipeline für Android-Builds
- OTA-Updates

Das kommt in Phase B, nach der Entscheidung.

# Offener Punkt außerhalb der Technik

Vor Phase B ist datenschutzrechtlich zu klären, ob Notendaten, Fehlstunden,
Elternkontakte und Aktenvermerke auf privaten Mobilgeräten gehalten werden
dürfen. Das ist eine Frage an die Schulleitung bzw. Bildungsdirektion, keine an
den Code – aber sie kann Phase B ungültig machen, also gehört sie vor die
Investition, nicht danach.

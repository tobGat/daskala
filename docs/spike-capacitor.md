# Spike A – Capacitor (Android)

Ziel des Spikes (laut Portierungsplan): **Klassenliste + Notentabelle einer Klasse
auf einem echten Android-Gerät anzeigen** – auf derselben React-Renderer-Basis wie
der Desktop, ohne Electron anzufassen.

Branch: `spike/capacitor` · Zielgerät im Test: **Nothing Phone 3a** (Android 15).
**Nichts hiervon geht nach `master`.**

## Architektur des Spikes

Auf dem Desktop läuft: `renderer` → Electron-IPC (`window.api` aus `preload.js`) →
`main.js` → Kern-Domänen (`core/…`) → besser-sqlite3.

Auf Mobil gibt es **keinen** Main-Prozess. Stattdessen läuft der Kern **im WebView**:

- `renderer/main.jsx` erkennt fehlendes `window.api` und ruft `bootstrapMobile()`.
- `platform/capacitor/bootstrap.js` öffnet SQLite (`@capacitor-community/sqlite`),
  wendet das Schema aus der Phase-2.3-Baseline (`core/db/schema.js` → `MIGRATIONS`)
  an, seedt bei leerer DB einen Demo-Datensatz und hängt ein mobiles `window.api` ein.
- `platform/capacitor/db-sqlite.js` ist die zweite **DbPort**-Implementierung
  (gleicher Vertrag wie der Electron-Adapter).
- `platform/capacitor/api.js` bildet `window.api` auf die Kern-Domänen ab
  (Pfad Klassenliste + Notentabelle; nicht abgebildete Methoden sind protokollierende
  No-ops, damit die App nicht abstürzt).
- `platform/capacitor/kern-deps.js` liefert die `kernDeps` (Notenberechnung aus dem
  Kern; Datei-/Material-Ports sind im Spike neutralisiert).

Node-Builtins des Kerns (`path`, `crypto`) werden für den WebView-Build über
Vite-Aliasse ersetzt (`vite.config.js`): `path` → `path-browserify`,
`crypto` → `platform/capacitor/shims/crypto.js` (nur `randomUUID`).

## Einmalige Voraussetzungen

- **Android Studio** inkl. Android SDK (Platform-Tools, ein Platform-SDK) und ein JDK 17.
- Auf dem **Nothing Phone 3a**: Entwickleroptionen aktivieren → **USB-Debugging** an.
- Per USB verbinden und die Debugging-Anfrage am Telefon bestätigen.
- Prüfen, dass das Gerät erkannt wird: `adb devices` (muss das Gerät „device" listen).

## Build & Start auf dem Gerät

```bash
# 1. Web-Assets bauen (erzeugt dist/)
npx vite build

# 2. Web-Assets + Plugins ins Android-Projekt kopieren
npx cap sync android

# 3a. Direkt auf dem angeschlossenen Gerät bauen/installieren/starten
npx cap run android
#   → im Auswahldialog das Nothing Phone 3a wählen

# 3b. ODER in Android Studio öffnen und dort auf „Run" (grüner Pfeil)
npx cap open android
```

Beim ersten Lauf lädt Gradle Abhängigkeiten (Internet nötig). Danach sollte die App
starten und **Klasse „1A" mit dem Fach „Deutsch"** zeigen – 5 Schüler:innen, zwei
Notenspalten (SA1, T1) und die berechnete Semesternote (Demo-Daten aus
`platform/capacitor/demo-seed.js`).

## Was der Spike prüft / zeigt

- Läuft der plattformunabhängige Kern (async DbPort + Domänen) unverändert im WebView?
- Rendert die dichte `NotenTabelle` (CSS-Grid) sauber auf dem Gerät?
- Funktioniert `@capacitor-community/sqlite` als zweite DbPort-Implementierung
  (inkl. Transaktionen/SAVEPOINTs bei der Zeugnisnoten-Berechnung)?

## Debugging (falls etwas nicht geht)

- **Weißer Bildschirm / Fehler:** Am PC `chrome://inspect` öffnen (Gerät via USB),
  den WebView „inspect" – die Konsole zeigt Fehler (fehlende `window.api`-Methode,
  CSP, SQLite-Bridge). `[mobile-api:stub]`-Warnungen zeigen nicht abgebildete Kanäle.
- **CSP:** `index.html` hat eine strenge CSP. Sollte der Capacitor-Bridge/WebView
  dadurch blockiert werden, für den Mobil-Build testweise die CSP lockern.
- **SQLite nicht gefunden:** `npx cap sync android` erneut ausführen; prüfen, dass
  `@capacitor-community/sqlite` unter „Found N Capacitor plugins" auftaucht.
- DB neu seeden: App-Daten löschen (Android → Einstellungen → Apps → Daskala →
  Speicher leeren) oder App deinstallieren; beim nächsten Start greift der Demo-Seed erneut.

## Grenzen des Spikes (bewusst offen)

- Nur der Pfad Klassenliste/Notentabelle ist auf `window.api` abgebildet. Andere
  Bereiche (Stundenplan, KV, Export/PDF, Materialien, Backup) sind No-ops.
- PDF-Export (`printToPDF`) hat mobil noch keine Umsetzung – für den Spike irrelevant.
- Kein Sync/Import echter Daten – bewusst nur Demo-Daten auf dem Gerät.
- Der Desktop-Build (Electron) bleibt unverändert; der Capacitor-Code liegt in einem
  eigenen, nur mobil geladenen Chunk.

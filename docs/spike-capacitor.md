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

## Einmalige Voraussetzungen (auf diesem Rechner verifiziert)

- **Android Studio** inkl. Android SDK. Konkret nötig (per SDK-Manager, falls nicht vorhanden):
  **Platform android-36** und **Build-Tools 36** (AGP 8.13/compileSdk 36). AGP lädt fehlende
  Pakete automatisch nach, wenn die Lizenzen akzeptiert sind.
- **JDK 21** (Pflicht!). Fallstricke, die hier auftraten:
  - JDK **25/26** (z. B. Android-Studio-JBR 25) → Gradle 8.14.3 bricht mit *"Unsupported
    class file major version 69"* ab (Groovy zu alt für JDK 25).
  - JDK **17** → Capacitor-8-Android-Module verlangen *source release 21* → Fehler
    *"invalid source release: 21"*.
  - → **JDK 21** ist der Sweet Spot. Portable Variante (ohne Admin) z. B. Temurin 21 entpacken
    und `JAVA_HOME` daraufsetzen.
- Umgebung für den Build (Beispielpfade dieses Rechners):
  ```bash
  export JAVA_HOME="$LOCALAPPDATA/Programs/daskala-jdk21/jdk-21.0.12+8"
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
  ```
- Auf dem **Nothing Phone 3a**: Entwickleroptionen → **USB-Debugging** an; per USB verbinden;
  am Telefon **„USB-Debugging zulassen"** bestätigen (Telefon dabei entsperrt).
- Prüfen: `adb devices` muss das Gerät als **`device`** (nicht `unauthorized`) listen.

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

## Ergebnis des ersten Gerätelaufs (Nothing Phone 3a, Android 15)

- Build (JDK 21 + SDK 36) ✅, Installation ✅, Start ✅ – kein nativer Absturz.
- **Datenzugriff funktioniert vollständig:** logcat zeigt den Capacitor-SQLite-Bridge, wie er
  die echten Kern-Queries ausführt und Daten liefert (Klassen, Fächer, Schüler:innen samt Noten,
  Zeugnisnoten-Transaktionen). Schema aus `MIGRATIONS` + Demo-Seed greifen; keine `no such table`-Fehler.
- **Ein Render-Fehler war zu fixen:** Das Dashboard-Widget `Stundenplan` (`aktuelleStunde`) rief
  `.find` auf `null` (nicht abgebildete `stundenzeiten.getAll`). Fix: der mobile-api-Fallback liefert
  jetzt `[]` statt `null` (array-sicher). Danach rendert die App ohne Fehler; nur erwartete
  `[mobile-api:stub]`-Warnungen für nicht abgebildete Bereiche (Stundenplan, Backup, Update, Undo).
- Offen: rein visuelle Bestätigung der Notentabelle auf dem entsperrten Gerät (Screenshot war durch
  die Geräte-Sperre blockiert; App lief dahinter fehlerfrei).

## Grenzen des Spikes (bewusst offen)

- Nur der Pfad Klassenliste/Notentabelle ist auf `window.api` abgebildet. Andere
  Bereiche (Stundenplan, KV, Export/PDF, Materialien, Backup) sind No-ops.
- PDF-Export (`printToPDF`) hat mobil noch keine Umsetzung – für den Spike irrelevant.
- Kein Sync/Import echter Daten – bewusst nur Demo-Daten auf dem Gerät.
- Der Desktop-Build (Electron) bleibt unverändert; der Capacitor-Code liegt in einem
  eigenen, nur mobil geladenen Chunk.

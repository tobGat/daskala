# Phase 1.4 – IPC-Generierung + Lifecycle → `platform/electron/` (Ziel: `main.js < 200`)

Stand nach der Kern-Extraktion (auf `master` gemergt): `main.js` = 1230 Zeilen,
`core/` = 36 electron-freie Module, 168 Charakterisierungstests grün.
Dieser Schritt ist **reines Umziehen von Plattform-Glue** – kein Portierungs-Gewinn,
nur die Plan-Marke `main.js < 200`. Höheres Risiko (ändert Boot + Handler-Registrierung).

## Was noch in `main.js` liegt (Kategorien)

1. **`registerIPC()`** (~604 Z., aktuell Z. 513–1117): 209 `ipcMain.handle`-Delegationen
   + DI-Setup (`matDeps`/`jpDeps`/`exDeps`/`wetterDeps`/`kernDeps`, lokale Material-Bindungen).
2. **Lifecycle** (~350 Z.): `createWindow`, `setupMenu`, `setupAutoUpdate`, `neustartNachDatenwechsel`,
   `doSaveAs`, `doOpen`, Backup-Start (`createBackup`, `autoBackupWennAktiv`, `backupVorUpdate`),
   `app.whenReady`/Lifecycle-Hooks.
3. **Boot/Helfer** (~150 Z.): `initPaths`, `initDB` (dünn), `bkGet/bkSet`, Backup-Wrapper,
   `logError`, `oeffneExternSicher`, `hashPin`, `dateiTeil`, `exportDatum`, `initKompetenzVorlagen`,
   Note-calc-Wrapper, `bauePdfHtml`.

## Zwei geteilte, veränderliche Zustände (der eigentliche Knackpunkt)

- **`db`** wird an 3 Stellen neu zugewiesen (`db = new Database(...)`): `initDB`,
  `datenbank:importieren`-Reopen (Z. ~299), `backup:wiederherstellen`-Reopen (Z. ~764).
  Nach `registerIPC`-Umzug dürfen die Handler **nicht** ein Snapshot-`db` festhalten.
  → Lösung: ein Zustands-Halter `platform/electron/db-state.js` mit `getDb()/setDb()`,
  und in `ipc.js` ein **Proxy** `const db = new Proxy({}, { get:(_,p)=>{const r=getDb(); const v=r[p]; return typeof v==='function'?v.bind(r):v} })`.
  Die Reopen-Stellen rufen `setDb(new Database(...))`. Handler-Rümpfe bleiben unverändert.
- **`appGesperrt`** wird in Sperre-Handlern gesetzt (Z. 864/870/874) und in `createWindow`
  (Tastenkürzel, Z. 1152) gelesen. → gemeinsamer Halter (z. B. `platform/electron/app-state.js`)
  mit `get/set`, in beiden Dateien genutzt.

## Vorgehen (je ein Commit, Suite nach jedem grün)

1. **Zustands-Halter anlegen** (`db-state.js`, `app-state.js`), `main.js` darauf umstellen –
   noch ohne Umzug. Suite grün. (Sichert die kniffligen Teile ab, bevor Code wandert.)
2. **`registerIPC` → `platform/electron/ipc.js`**: Body per bash extrahieren (wie schema.js),
   in `function registerIPC(ctx) { const {…} = ctx; <body> }` wickeln. `ctx` enthält alle
   ~90 modulweiten Namen (siehe `grep`-Liste im Chatverlauf). db via Proxy, `setDb` für Reopen.
   `main.js` ruft `registerIPC(buildCtx())`. **Der Harness ruft `registerIPC` → fehlender
   ctx-Eintrag = lauter Testfehler.** Iterativ gegen `npm run test:core` schließen.
3. **Lifecycle → `platform/electron/main.js`**: `createWindow`/Menü/AutoUpdate/Reopen/Backup-Start
   dorthin; Entry-Point umstellen (`package.json` "main" bzw. `launch-electron.js`).
   Der Charakterisierungs-Harness lädt weiterhin die Datei, die `registerIPC` auslöst.
4. **Rest-Helfer** in passende `core/`- bzw. `platform/`-Module; `main.js`/Entry auf < 200 bringen.

## Verifikation je Schritt
- `node --check`, `npm run lint`, `npm run test:core` (168/168), plus **manueller** Test der
  Reopen-Pfade (Backup wiederherstellen, DB importieren/öffnen) und der App-Sperre — die
  deckt die Suite nicht ab.
- Zum Schluss: `npx vite build` grün, App startet, Store-Build (`npm run build`) läuft.

## Merke
Der Portierungs-Nutzen ist mit der Kern-Extraktion bereits realisiert. Dieser Schritt ist
optionales Aufräumen; wenn `main.js` als klar abgegrenzte Plattform-Schicht (statt < 200)
akzeptiert wird, ist Phase 1 auch ohne 1.4 inhaltlich abgeschlossen.

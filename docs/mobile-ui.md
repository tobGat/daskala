# Mobile UI (Capacitor) – Fundament & iteratives Vorgehen

Ziel: die geteilte React-Oberfläche fürs Handy anpassen, **ohne die Desktop-App
(Electron) zu verändern**. Alle mobilen Anpassungen sind eingezäunt und greifen nur
auf dem Gerät.

## Die zwei Werkzeuge

**1. CSS unter `.cap`** – für Styling/Layout-Feinschliff.
Der Capacitor-Bootstrap setzt am Gerät `<html class="cap">`. Schreibe mobile Regeln
also als `.cap …` (siehe Block „MOBIL (Capacitor)" in `renderer/index.css`). Desktop
hat die Klasse nie → unberührt.

```css
.cap .meine-leiste { padding-bottom: env(safe-area-inset-bottom); }
```

**2. `useIsMobile()`** – für strukturelle Unterschiede (andere Komponente/Layout).
```jsx
import { useIsMobile } from '../hooks/useIsMobile'   // Pfad je nach Ordner anpassen

function Kopfzeile() {
  const mobil = useIsMobile()          // am Gerät true, auf dem Desktop immer false
  return mobil ? <MobileKopf /> : <DesktopKopf />
}
```
`istMobil()` gibt es auch als reine Funktion (ohne Hook) für Nicht-Komponenten-Code.

### Safe-Area-Helfer (Notch / Gestenleiste)
Vorhandene Utility-Klassen (nur mobil aktiv): `safe-top`, `safe-bottom`, `safe-x`.
Als CSS-Variablen ebenfalls verfügbar: `var(--sat|--sar|--sab|--sal)`.

## Iterations-Loop am Gerät (empfohlen: Live-Reload)

Damit UI-Änderungen **ohne** APK-Neubau sofort am Telefon erscheinen:

```bash
# Umgebung (einmal pro Shell)
export JAVA_HOME="$LOCALAPPDATA/Programs/daskala-jdk21/jdk-21.0.12+8"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"

# Live-Reload: Gerät lädt den Vite-Dev-Server über WLAN, Hot-Reload bei jeder Änderung
npx cap run android -l --external
```
PC und Nothing Phone 3a müssen im selben WLAN sein. Danach: Datei speichern → die App
am Telefon aktualisiert sich. SQLite läuft dabei nativ am Gerät (die Daten sind echt).

Alternativ ohne Live-Reload (fester Build):
```bash
npx vite build && npx cap copy android
cd android && ./gradlew assembleDebug
"$ANDROID_HOME/platform-tools/adb.exe" install -r app/build/outputs/apk/debug/app-debug.apk
```

## Konventionen / Leitplanken

- **Nie** Desktop-Styles „hart" ändern, um Mobil zu fixen. Immer additiv unter `.cap`
  bzw. hinter `useIsMobile()`.
- Strukturelle Umbauten (z. B. Bottom-Navigation statt Seitenleiste, große Tap-Ziele,
  Modals als Vollbild-Sheets) über `useIsMobile()` als eigener Zweig.
- Dichte Tabellen (Notentabelle, Stundenplan) bleiben horizontal scrollbar mit fixierter
  erster Spalte (bereits vorhanden); mobil eher Spaltenbreiten/Abstände justieren.
- Änderungen laufen auf `spike/capacitor` (nicht `master`), bis die mobile UI reif ist.

## Bereits umgesetzt

- **Bottom-Navigation** [renderer/components/MobileBottomNav.jsx](../renderer/components/MobileBottomNav.jsx):
  Dashboard · Noten · Mehr (Sheet mit Sitzplan/KV/Jahresplan/Planung/Einstellungen/
  Export/Vorlagen, gleich gegatet wie die Desktop-Kopfleiste). In `App.jsx` nur bei
  `useIsMobile()` gerendert; `KlassenTabs`/`FachTabs` unverändert.
- **Modals als Bottom-Sheet** + **Safe-Area** oben (`.cap .app-shell`) und unten
  (`.safe-bottom` an der Nav) – siehe `.cap`-Block in `renderer/index.css`.

## Naheliegende nächste Schritte (Vorschläge)

1. **Touch-Ziele**: Zellen/Buttons der Notentabelle + der Kopf-Tabs mobil höher
   (≥ 44px) – unter `.cap`. Klassenschnitt-Chips ggf. mobil ausblenden.
2. **Touch-Ersatz** für Rechtsklick/Doppelklick/Drag in `KlassenTabs`/`FachTabs`
   (Kontextmenüs, Umbenennen, Reorder) – z. B. Long-Press oder „⋯"-Button.
3. **Erststart/Einrichtung** mobil testen (aktuell per Demo-Seed übersprungen, siehe
   platform/capacitor/demo-seed.js).

## Bekannte (harmlose) Meldung
Capacitor loggt beim Start „Error injecting safe area CSS: … reading 'style'" aus der
nativen Bridge. Unkritisch – die Safe-Areas werden ohnehin per CSS `env(safe-area-inset-*)`
gehandhabt (nicht über die Capacitor-Injektion).

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

- **Logo-Header** statt Kopfleisten: mobil ersetzt [MobileHeader.jsx](../renderer/components/MobileHeader.jsx)
  (Logo + „Daskala") die Desktop-`KlassenTabs`/`FachTabs`. In `App.jsx` per
  `{mobil ? <MobileHeader/> : <KlassenTabs/>}` (Desktop unverändert).
- **Bottom-Navigation** [MobileBottomNav.jsx](../renderer/components/MobileBottomNav.jsx):
  `Stundenplan · Noten · Agenda · [Planung] · Mehr` (abstrakte Linien-Icons; aktiver Tab deutlich
  hervorgehoben durch koralle Pille hinter dem Icon + fette koralle Beschriftung); darüber eine
  **Kontextzeile für Klassen-/Fachwechsel** (im Stundenplan und in der Agenda ausgeblendet).
  **„Mehr" nur noch App-Ebene:** Einstellungen · Exportieren · Vorlagen-Modus. Klassenbezogene
  Funktionen liegen NICHT unter „Mehr":
  - **Agenda** = ToDos/Termine (früher „Planer", nur umbenannt; `currentView='planer'`).
  - **Planung** (nur bei `planung_aktiv`) = eigener Tab [MobilePlanung.jsx](../renderer/components/MobilePlanung.jsx)
    mit Segment-Umschalter Jahresplan/Klassenplanung (bettet `JahresplanungView`/`KlassenplanungView` ein).
    Standard-Segment beim Öffnen ist **Klassenplanung**. Die **Jahresplanung** hat mobil **keinen Kalender**:
    Abschnitten wird im Modal ein **Zeitraum (Beginn–Ende)** zugewiesen (`type=date`), die Liste ist danach
    sortiert (undatierte ans Ende); Inhalt/Lernziele/Kompetenzen liegen im Modal untereinander (statt zweispaltig).
  - **Sitzplan** und **Klassenvorstand (KV)** werden mobil vorerst gar nicht angezeigt (Views bleiben
    für den Desktop; keine mobile Route).
  **Klasse/Fach anlegen:** je ein „➕"-Eintrag unten in den Klasse-/Fach-Auswahl-Sheets; das erste Fach
  einer Klasse zusätzlich über „Neues Fach anlegen" im Noten-Leerzustand („Kein Fach"). Alle öffnen die
  bestehenden `KlasseHinzufuegen`/`FachHinzufuegen`-Modals (`openModal(...)`) – kein eigener Modal-Code.
- **Planer-Bereich (ToDos oben / Termine unten)** [MobilePlaner.jsx](../renderer/components/MobilePlaner.jsx):
  ein eigener Bottom-Nav-Tab „Planer" zeigt als zweigeteilte Ansicht oben die ToDos, unten die Termine
  (beide `TodoBoard`/`TerminePanel` im Normal-Modus mit eigenem Kopf + „+"). Die früheren Header-Symbole
  (✏️/📅) und die Vollbild-Modals gibt es nicht mehr. Store: `zeigePlaner(typ, id)` wechselt in den Bereich,
  `planerFokus` markiert/scrollt zum Eintrag (z. B. aus einem Stundenplan-Badge), `planerFokusLoeschen`
  räumt ihn nach dem Flash weg. Die mobile Kopfzeile [MobileHeader.jsx](../renderer/components/MobileHeader.jsx)
  trägt nur noch Logo + „Daskala".
- **Dashboard mobil** [UebersichtView.jsx](../renderer/components/UebersichtView.jsx):
  zeigt NUR den Stundenplan (Tagesansicht); keine Begrüßung, kein Akkordeon. ToDos/Termine
  laufen über die Header-Symbole.
- **Klassenwechsel** in der Bottom-Nav wird im Dashboard ausgeblendet (der Stundenplan zeigt
  alle Klassen); in fach-abhängigen Ansichten weiterhin Klasse+Fach-Dropdown.
- **Stundenplan mobil** [Stundenplan.jsx](../renderer/components/Stundenplan.jsx): zeigt nur
  den aktuellen Tag; Navigation per Pfeilen (‹/›, tageweise, über Wochengrenzen), Tippen auf
  den Tag springt zu „heute". Desktop bleibt die Wochenansicht (Umschaltung über `tage`-Array).
- Die Stundenplan-Datenkanäle (stundenzeiten/stundenplan/stundenPlanung/supplierstunden) sind
  im mobilen `window.api` nun angebunden; Demo-Seed legt Beispiel-Stunden an.
- **Kontextmenü mobil** [Stundenplan.jsx](../renderer/components/Stundenplan.jsx): der Long-Tap
  auf eine Stunde öffnet mobil ein **Bottom-Sheet** mit großen Tap-Zielen statt des Desktop-Menüs
  an der Mausposition. Das Entfall-Untermenü (ersatzlos / durch Supplierung) ist dabei **ausgeklappt**
  statt per Hover (Hover gibt es am Touch nicht); zusätzlich „Abbrechen" und ein Griff oben. Long-Tap
  auf leere Zellen zeigt „Supplierstunde eintragen" bzw. „Stunde belegen". Zellen mobil `select-none`
  + `-webkit-touch-callout:none`, damit der Long-Press keine Textauswahl auslöst.
- **Stundenplan bearbeiten mobil** [Stundenplan.jsx](../renderer/components/Stundenplan.jsx): der
  Bearbeitungsmodus wird über das **Long-Tap-Kontextmenü** ein-/ausgeschaltet („Stundenplan bearbeiten"
  / „Bearbeiten beenden"), nicht über ein Toolbar-Icon (das lag zu nah an der Tages-Navigation). Im
  Modus erscheint oben ein Hinweis-Band mit „🕐 Zeiten" und „✓ Fertig"; leere Zellen zeigen „+", ein Tap
  öffnet „Stunde belegen", ein Tap auf eine belegte Stunde „Stunde bearbeiten". Im Kontextmenü ist im
  Modus zusätzlich „Stundenzeiten bearbeiten" erreichbar. (Drag-&-Drop zum Verschieben bleibt
  Desktop-only – am Touch stattdessen über Belegen/Ändern.)
- **Notenansicht mobil** [NotenTabelle.jsx](../renderer/components/NotenTabelle.jsx): die
  `NotenToolbar` hat einen eigenen Mobil-Zweig – der Fach-Identifikator (Farbquadrat/Fachname/
  Schüler:innen-Zahl) entfällt (Fach steht in der Bottom-Nav-Kontextzeile), und Semester (1/2,
  inkl. „S1 einklappen") sowie Sortierung (Vorname/Nachname/Manuell + Reihenfolge) wandern in ein
  Bottom-Sheet-Menü „Ansicht" (kleiner Regler-Button links). Schüler:innen/Export/Ø-Klasse bleiben
  in der Leiste. Desktop-Toolbar unverändert. Das **Spalten-Kontextmenü** (Long-Tap auf einen
  Spaltenkopf) erscheint mobil ebenfalls als **Bottom-Sheet** mit großen Tap-Zielen (statt des
  positionierten Desktop-Menüs). Die **Namensspalte** ist mobil nur so breit wie ihr Inhalt
  (Inline `width:1` + `white-space:nowrap`, Name auf max. 128px begrenzt, Hover-Chevron entfällt) –
  so bleibt mehr Platz für die Noten-Spalten. Das „+"-Ghost-Spaltenfeld entfällt mobil; neue Spalten
  legt ein **Speed-Dial-FAB** unten rechts an: Tap zeigt die Kategorien (Mitarbeit/Hausübung/Test/
  Schularbeit/Individuell), die Auswahl öffnet das „Spalte hinzufügen"-Modal vorbelegt
  (`openModal('spalteHinzufuegen', { kategorie })`). Bei Vorauswahl entfällt im Modal die
  Kategorie-Auswahl; die Überschrift zeigt stattdessen die Kategorie (z. B. „MA Mitarbeit hinzufügen") –
  das Modal wird dadurch kompakter. Ohne Vorauswahl (Desktop-„+") bleibt die Kategorie-Auswahl. Die **Schüler-Detailansicht** (Tap **oder Long-Tap**
  auf einen Namen – Long-Tap feuert am Touch ein `contextmenu`, das ebenfalls das Profil öffnet;
  Namenszelle `select-none`) öffnet mobil ein **Vollbild-Sheet in einer Spalte**: Fächer als horizontale
  Chips oben, darunter das Fach-Detail (Diagramm/Mitarbeit/Aufzeichnungen). Dafür sind im mobilen
  `window.api` `schueler.getLeistungsProfil`, `notizen` (get/set) und `verlauf.get` angebunden (vorher
  Stub → `getLeistungsProfil` crashte). Nebenbei: `{ist_kv && …}`-Render-Bug behoben (integer 0 wurde
  als „0" gerendert).
- **Noten-Vollbild im Querformat** [useIsMobile.js](../renderer/hooks/useIsMobile.js) (`useIsLandscape`):
  dreht man das Gerät auf der Notenansicht ins Querformat, werden Kopfzeile, Bottom-Navigation,
  Toolbar, Rahmen/Padding und der FAB ausgeblendet – nur die Tabelle bleibt (maximale Fläche für die
  Noten-Spalten). In `App.jsx` blendet `notenVollbild = mobil && landscape && currentView==='notentabelle'`
  Header/Bottom-Nav aus; in `NotenTabelle.jsx` entfallen Toolbar/FAB/Card. Zurück ins Hochformat →
  alles wieder da, Ansicht bleibt erhalten (Activity `configChanges` inkl. `orientation`).
  Die Bottom-Sheet-Kontextmenüs (Stundenplan- & Spalten-Menü) sind `overflow-y-auto max-h-[85vh]`
  (im Querformat sonst zu hoch/nicht scrollbar); im Noten-Querformat sind die Menüzeilen zusätzlich
  kompakter (`!py-2 !min-h-0`), damit alles inkl. „Abbrechen" erreichbar bleibt.
- **Noten-Export mobil** [export-mobile.js](../platform/capacitor/export-mobile.js): der „Export"-Button
  war mobil ein Stub (Desktop-Export nutzt Node-FS + Datei-Dialog). Jetzt wird die ODS-Datei im WebView
  mit `xlsx` erzeugt (Zeilenaufbau wie Desktop, `notenberechnung.rosterFuerFach`/`znInternZuAnzeige`),
  via `@capacitor/filesystem` in den Cache geschrieben und über `@capacitor/share` geteilt (System-
  Teilen-Ansicht). Angebunden als `window.api.export.fachOds` in `platform/capacitor/api.js`.
- **Schüler:innen-Import mobil** (CSV/Excel): der Desktop-Import nutzt Node-Dialog + FS-Port – mobil
  gestubbt. Neu: in `SchuelerVerwaltenModal` öffnet mobil ein WebView-`<input type="file">` den
  Android-Picker; die Datei wird im Renderer geparst ([schuelerImport.js](../renderer/utils/schuelerImport.js),
  xlsx dynamisch, Zeilenlogik wie `core/services/import.js`) und über das nun gemappte
  `window.api.schueler.importBatch` gespeichert. Nebenbei einen Header-Erkennungs-Bug behoben (CSV:
  „vorname" matchte fälschlich als Nachname-Spalte wegen `includes('name')`) – Fix in mobiler Util
  **und** `core/services/import.js` (wirkt auch am Desktop korrekt).
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

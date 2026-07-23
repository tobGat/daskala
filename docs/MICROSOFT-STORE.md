# Daskala im Microsoft Store veröffentlichen

Diese Anleitung beschreibt, wie du Daskala als **MSIX/AppX-Paket** baust und im
Microsoft Store (Partner Center) veröffentlichst. Die Projektkonfiguration ist
dafür bereits vorbereitet.

> Voraussetzung: Du bist als Entwickler im **Partner Center** registriert und hast
> den App-Namen **Daskala** reserviert.

---

## 1. Einmalig: Identitätswerte aus dem Partner Center eintragen

Der Store verlangt, dass das Paket exakt deine reservierte App-Identität trägt.
Diese drei Werte findest du im Partner Center und trägst sie **einmalig** in
`package.json` unter `build.appx` ein.

**So findest du die Werte:** Partner Center → deine App **Daskala** →
**Produktverwaltung → Produktidentität**. Dort stehen drei Zeilen:

| Partner-Center-Feld                         | package.json (`build.appx`) | Beispiel |
|---------------------------------------------|-----------------------------|----------|
| Package/Identity/**Name**                   | `identityName`              | `12345TobiasGatterbauer.Daskala` |
| Package/Identity/**Publisher**              | `publisher`                 | `CN=A1B2C3D4-....` |
| Package/Properties/**PublisherDisplayName** | `publisherDisplayName`      | `Tobias Gatterbauer` |

Ersetze in `package.json` die Platzhalter:

```jsonc
"appx": {
  "identityName": "PUBLISHERID.Daskala",                 // ← Package/Identity/Name
  "publisher": "CN=00000000-0000-0000-0000-000000000000", // ← Package/Identity/Publisher
  "publisherDisplayName": "Tobias Gatterbauer",          // ← PublisherDisplayName
  ...
}
```

Diese Werte sind **keine Geheimnisse** – sie stecken sichtbar in jedem
veröffentlichten Paket. Sie dürfen also committet werden.

> **Wichtig:** `identityName` und `publisher` müssen *zeichengenau* mit dem Partner
> Center übereinstimmen, sonst lehnt der Store das Paket ab.

---

## 2. Paket bauen

Der Store-Build läuft **nur unter Windows** (er nutzt `makeappx.exe`, das
electron-builder beim ersten Lauf automatisch herunterlädt – dafür ist einmalig
eine Internetverbindung nötig).

```powershell
npm install        # falls noch nicht geschehen
npm run build:store
```

Das erledigt:
1. `npm run appx:assets` – erzeugt die Kachel-Grafiken aus `daskalalogo.png` nach `build/appx/`
2. `vite build` – baut das Renderer-Frontend
3. `electron-builder --win appx` – schnürt das **unsignierte** `.appx`-Paket

Ergebnis:
```
dist-electron/Daskala <version>.appx
```

> Das Paket ist **absichtlich nicht signiert** – der Microsoft Store signiert es
> beim Einreichen selbst mit deinem Verlagszertifikat. (electron-builder meldet im
> Log „AppX is not signed / Windows Store only build" – das ist korrekt so.)

---

## 3. Version

Die Paketversion wird **automatisch aus dem neuesten Git-Tag** abgeleitet (z. B.
Tag `v1.0.68` → Paketversion `1.0.68.0`) – genau wie bei den normalen GitHub-Releases.
Du musst `package.json` also **nicht** von Hand anpassen; baue das Store-Paket einfach
nach dem üblichen „merge → tag → release"-Ablauf.

Der Store verlangt für **jede** Einreichung eine höhere Version als die zuletzt dort
veröffentlichte. Da jeder Release einen neuen Tag bekommt, ist das automatisch erfüllt.
(Gibt es lokal gar keinen Tag, greift die `version` aus `package.json`.)

---

## 4. Im Partner Center einreichen

1. Partner Center → **Daskala** → **Neue Einreichung** (bzw. „Übermittlung erstellen").
2. **Pakete:** die Datei `dist-electron/Daskala <version>.appx` per Drag & Drop hochladen.
3. **Eigenschaften / Kategorie:** *Bildung* (Education).
4. **Altersfreigabe:** Fragebogen ausfüllen (Daskala verarbeitet nur lokale Daten →
   in der Regel Freigabe ab niedriger Altersstufe).
5. **Store-Eintrag** (Sprache **Deutsch** – eine Fassung genügt für alle
   deutschsprachigen Regionen; siehe [STORE-LISTING.md](STORE-LISTING.md)):
   - Kurzbeschreibung, Beschreibung, Produktfeatures, Screenshots (mind. 1), Store-Logo.
   - Optional: Urheberrecht/Markeninformation und zusätzliche Lizenzbedingungen (GPL) –
     Text-Bausteine ebenfalls in [STORE-LISTING.md](STORE-LISTING.md).
6. **Datenschutzrichtlinie (URL):** `https://github.com/tobGat/daskala/blob/master/PRIVACY.md`
7. **`runFullTrust` (eingeschränkte Funktion):** Beim Hochladen erscheint die Warnung
   *„The following restricted capabilities require approval before you can use them in
   your app: runFullTrust."* Das ist **normal** – für eine als MSIX paketierte
   Desktop-App (Electron) ist `runFullTrust` (`Windows.FullTrustApplication`) technisch
   zwingend und lässt sich nicht entfernen. Es ist **kein** Ablehnungsgrund und **kein**
   separates Vorab-Formular nötig. Begründung im Feld **„Anmerkungen für die
   Zertifizierung"** eintragen:
   > „Daskala ist eine klassische Windows-Desktop-Anwendung (Electron), als MSIX
   > paketiert. Die Funktion ‚runFullTrust' (Windows.FullTrustApplication) ist für
   > solche Desktop-Apps technisch erforderlich, damit die Anwendung ausgeführt werden
   > kann. Sie wird benötigt, um Noten- und Planungsdaten lokal in einer Datei (SQLite)
   > zu speichern, lokale Sicherungen anzulegen und Exporte (PDF/ODS/ODT) über den
   > Windows-Datei-Dialog abzulegen. Es werden keine Daten an Server oder Dritte
   > übertragen."
8. **Preis & Verfügbarkeit:** kostenlos, Märkte wählen (z. B. Österreich/weltweit).
9. **Absenden.** Die Zertifizierung dauert i. d. R. wenige Stunden bis 1–2 Tage;
   `runFullTrust` wird für Desktop-Apps im Zuge der regulären Prüfung genehmigt.

---

## 5. Was ist bereits vorbereitet?

- **`build.appx`-Konfiguration** in `package.json` (Identität, Sprachen, Kacheln, Splash).
- **Kachel-/Logo-Assets**: `build/appx/*.png` (aus `daskalalogo.png`), reproduzierbar
  über `npm run appx:assets` ([scripts/gen-appx-assets.js](../scripts/gen-appx-assets.js)).
- **Auto-Update deaktiviert im Store-Paket**: `electron-updater` läuft nicht, wenn die
  App als MSIX erkannt wird (`app.windowsStore`) – der Store übernimmt Updates. Die
  Update-Schaltfläche in den Einstellungen meldet dies entsprechend.
- **Voller Desktop-Zugriff** (`runFullTrust`) ist über das Standard-Manifest gesetzt →
  SQLite-Datenbank, Datei-Dialoge und Exporte funktionieren wie in der normalen App.

---

## 6. Automatische Veröffentlichung (GitHub + Store)

Nach der einmaligen Einrichtung (unten) veröffentlicht **ein einziger Git-Tag**
sowohl den GitHub-Release als auch das Store-Update. Die Pipeline steckt in
[.github/workflows/release.yml](../.github/workflows/release.yml).

**Dein Ablauf pro Release:**

```powershell
# Änderungen mergen, dann:
git tag v1.0.70
git push origin v1.0.70
```

Der Tag-Push löst automatisch aus:

1. **build** – baut Windows- (.exe) und Linux-Pakete, legt einen Release-Entwurf an.
2. **publish-github** – schaltet den Entwurf auf „Latest". Der GitHub-Release ist
   damit live; die installierte `.exe`-Version aktualisiert sich per electron-updater.
3. **store** – baut das MSIX-Paket und übermittelt es per Microsoft Store Developer CLI
   automatisch an den Store. Die Version stammt aus dem Tag; danach läuft die normale
   Store-Zertifizierung (Stunden bis 1–2 Tage), dann wird das Update ausgerollt.

> Store-Updates via GitHub Actions sind derzeit **nur für kostenlose Produkte**
> möglich – für Daskala (kostenlos) passt das.

### Einmalige Einrichtung der Store-Automatisierung

1. **Microsoft Entra ID (Azure AD) mit Partner Center verbinden:**
   Partner Center → *Kontoeinstellungen → Benutzerverwaltung*. Falls noch kein
   Verzeichnis verknüpft ist, ein bestehendes Microsoft-Entra-ID zuordnen oder ein
   neues anlegen.
2. **App in Microsoft Entra ID registrieren:** https://entra.microsoft.com/ →
   *Identität → Anwendungen → App-Registrierungen → Neue Registrierung*.
3. **Diese App in Partner Center hinterlegen:** *Kontoeinstellungen →
   Benutzerverwaltung → Microsoft-Entra-Anwendungen* → die App hinzufügen und ihr die
   Rolle **Manager** geben.
4. **Werte sammeln:**
   - **Tenant ID** – Entra → Identität → Übersicht
   - **Client ID** – die „Anwendungs-(Client-)ID" der App-Registrierung
   - **Client Secret** – App-Registrierung → *Zertifikate & Geheimnisse* → neues
     Geheimnis (Wert **sofort** kopieren, wird nur einmal angezeigt)
   - **Seller ID** – Partner Center → *Kontoeinstellungen → Rechtliche Infos / IDs*
   - **Store Product ID** – die Partner-Center-Produkt-ID von der Übersichtsseite der App
5. **GitHub-Secrets anlegen:** Repo → *Settings → Secrets and variables → Actions →
   New repository secret*:
   - `AZURE_AD_TENANT_ID`
   - `AZURE_AD_APPLICATION_CLIENT_ID`
   - `AZURE_AD_APPLICATION_SECRET`
   - `SELLER_ID`
   - `STORE_PRODUCT_ID`
6. **Automatisierung scharfschalten:** im selben Menü unter *Variables* eine
   Repository-Variable **`STORE_AUTOMATION`** mit Wert **`true`** anlegen. Erst dann
   läuft der `store`-Job. (Vorher wird bei jedem Tag nur der GitHub-Release erzeugt.)

Voraussetzung: Die App muss (wie bereits geschehen) **einmal manuell** im Store
veröffentlicht worden sein.

### Manuelle Store-Einreichung (Fallback)

Unabhängig von der Automatisierung geht es weiterhin von Hand:

```powershell
npm run build:store   # → dist-electron/Daskala <version>.appx
# im Partner Center als neue Einreichung hochladen
```

### Unverändert gültig

- **Version immer höher** als die zuletzt veröffentlichte (per Git-Tag automatisch erfüllt).
- **Identität nie ändern** (`identityName` / `publisher` / `publisherDisplayName`).
- **Signieren entfällt** – der Store signiert jede Einreichung selbst.
- `runFullTrust` muss i. d. R. nur bei der **ersten** Einreichung begründet werden.

---

## 7. Lokales Testen (optional)

Ein **unsigniertes** `.appx` lässt sich nicht per Doppelklick installieren. Zum
lokalen Test entweder:

- **einfacher Weg:** die normale `Daskala-Setup-<version>.exe` (NSIS) aus `npm run build` verwenden, oder
- ein selbstsigniertes Zertifikat erstellen, dessen Antragsteller *exakt* dem
  `publisher`-Wert entspricht, damit signieren (`signtool`) und das Zertifikat als
  vertrauenswürdig importieren. Für die reine Store-Einreichung ist das **nicht** nötig.

---

## Kurzreferenz

```powershell
# Nach einmaliger Einrichtung (Abschnitt 6): ein Tag veröffentlicht GitHub + Store.
git tag v1.0.70
git push origin v1.0.70

# Manuell/Fallback: Store-Paket lokal bauen und im Partner Center hochladen
npm run build:store   # → dist-electron/Daskala <version>.appx
```

# Daskala

Digitales Notenbuch für österreichische Mittelschulen – eine offline-fähige
Desktop-App (Electron + React) zur Noten-, Klassen- und Jahresplanung.

## Lizenz

Daskala ist **freie Software** und steht unter der
**GNU General Public License, Version 3 oder später (GPL-3.0-or-later)**.

Das bedeutet: Du darfst die App **kostenlos nutzen, weitergeben und verändern**.
Wenn du eine veränderte Version (einen „Fork") **weitergibst**, muss diese
**ebenfalls unter der GPL-3.0 stehen und ihr Quellcode offengelegt werden**
(Copyleft). Den vollständigen Lizenztext findest du in der Datei
[`LICENSE`](LICENSE).

## Verwendete Software von Dritten

Die App verwendet zahlreiche Open-Source-Bibliotheken (React, better-sqlite3,
SheetJS/xlsx, docx, DiceBear u. a.) unter permissiven Lizenzen (MIT, ISC, BSD,
Apache-2.0, CC0). Deren Copyright- und Lizenzhinweise sind vollständig in
[`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt) wiedergegeben und werden
mit dem Installationspaket ausgeliefert.

Die Electron-Laufzeit (inkl. Chromium, Node.js, ffmpeg) wird beim Bauen durch
electron-builder mitgeliefert; ihre Lizenztexte liegen im Ressourcenordner der
installierten Anwendung.

Für die Profilbilder wird der DiceBear-Stil **„lorelei"** verwendet – Grafik
unter **CC0 1.0** (Public Domain), Code unter MIT (© Florian Körner),
Design © Lisa Wischofsky.

## Entwicklung

```bash
npm install      # Abhängigkeiten installieren (baut better-sqlite3 nativ)
npm run dev      # Vite-Devserver + Electron starten
npm run build    # Installationspaket (Windows/NSIS) erstellen
```

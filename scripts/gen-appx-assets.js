// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Erzeugt die Kachel-/Logo-Grafiken für das Microsoft-Store-Paket (MSIX/AppX)
// aus `daskalalogo.png`. electron-builder liest die Dateien aus `build/appx/`;
// fehlt eine davon, verwendet es ein generisches Platzhalter-Logo – daher werden
// hier alle vom Manifest referenzierten Assets erzeugt.
//
// Aufruf:  node scripts/gen-appx-assets.js
// (Voraussetzung: devDependency `jimp`.)

const Jimp = require('jimp')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'daskalalogo.png')
const OUT = path.join(ROOT, 'build', 'appx')

// name -> [breite, höhe]. Quadratische Logos füllen die Fläche, breite Formate
// (Wide-Kachel, Splash) zentrieren das Logo auf transparentem Grund.
const ASSETS = {
  'StoreLogo.png':        [50, 50],
  'Square44x44Logo.png':  [44, 44],
  'SmallTile.png':        [71, 71],   // Square71x71 (kleine Kachel)
  'Square150x150Logo.png':[150, 150],
  'LargeTile.png':        [310, 310], // Square310x310
  'Wide310x150Logo.png':  [310, 150],
  'SplashScreen.png':     [620, 300],
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Quelle nicht gefunden: ${SRC}`)
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })

  for (const [name, [w, h]] of Object.entries(ASSETS)) {
    const canvas = new Jimp(w, h, 0x00000000) // transparent
    const logo = await Jimp.read(SRC)
    // In die Fläche einpassen (Seitenverhältnis bleibt erhalten, keine Verzerrung)
    logo.scaleToFit(w, h)
    const x = Math.round((w - logo.getWidth()) / 2)
    const y = Math.round((h - logo.getHeight()) / 2)
    canvas.composite(logo, x, y)
    await canvas.writeAsync(path.join(OUT, name))
    console.log(`✓ ${name} (${w}×${h})`)
  }
  console.log(`\nFertig – ${Object.keys(ASSETS).length} Dateien in build/appx/`)
}

main().catch(err => { console.error(err); process.exit(1) })

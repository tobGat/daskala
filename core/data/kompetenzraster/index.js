// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Statischer Katalog der Kompetenzraster (Referenzdaten). Electron-frei; wird sowohl im
// Desktop-Build (Node `require`) als auch im Mobile-Build (Vite/Rollup-JSON) gebündelt –
// kein Laufzeit-`fs`. Erweiterbar um weitere Fächer/Schulstufen.
module.exports = {
  deutsch: {
    1: require('./deutsch/deutsch_1.json'),
    2: require('./deutsch/deutsch_2.json'),
    3: require('./deutsch/deutsch_3.json'),
    4: require('./deutsch/deutsch_4.json'),
    5: require('./deutsch/deutsch_5.json'),
    6: require('./deutsch/deutsch_6.json'),
    7: require('./deutsch/deutsch_7.json'),
    8: require('./deutsch/deutsch_8.json'),
  },
}

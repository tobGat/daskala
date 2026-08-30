// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Statischer Katalog der Kompetenzraster (Referenzdaten). Electron-frei; wird sowohl im
// Desktop-Build (Node `require`) als auch im Mobile-Build (Vite/Rollup-JSON) gebündelt –
// kein Laufzeit-`fs`. Erweiterbar um weitere Fächer/Schulstufen.
//
// „fremdsprache" ist ein zusammengeführter Katalog: Schulstufe 1–4 aus dem Raster „Lebende
// Fremdsprache" (Primarstufe, sprachunabhängig), Schulstufe 5–8 aus „Englisch" (Sek I). So nutzt
// z. B. ein VS-Sprachfach (Stufe 1–4) das LF-Raster und ein Sek-Sprachfach (Stufe 5–8) das Englisch-Raster.
//
// „volksgruppensprache" (Kroatisch/Slowenisch/Ungarisch): eigener Katalog laut BMBWF-Raster
// (BGBl. II Nr. 1/2023). Aktuell liegen die Raster für Schulstufe 3, 4, 7 und 8 vor (sprachunabhängig,
// EINE Skala mit drei Kompetenzniveaus – KEINE Standard/AHS-Unterscheidung wie bei Deutsch/Englisch).
//
// „mathematik": BMBWF-Raster Schulstufe 1–8 (BGBl. II Nr. 1/2023). EINSTUFIG – je Kompetenzbeschreibung
// erreicht oder (noch) nicht (keine niveaustufen → Default „erreicht"; keine Standard/AHS-Unterscheidung).
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
  fremdsprache: {
    1: require('./lebende_fremdsprache/lebende_fremdsprache_1.json'),
    2: require('./lebende_fremdsprache/lebende_fremdsprache_2.json'),
    3: require('./lebende_fremdsprache/lebende_fremdsprache_3.json'),
    4: require('./lebende_fremdsprache/lebende_fremdsprache_4.json'),
    5: require('./englisch/englisch_5.json'),
    6: require('./englisch/englisch_6.json'),
    7: require('./englisch/englisch_7.json'),
    8: require('./englisch/englisch_8.json'),
  },
  volksgruppensprache: {
    3: require('./volksgruppensprache/volksgruppensprache_3.json'),
    4: require('./volksgruppensprache/volksgruppensprache_4.json'),
    7: require('./volksgruppensprache/volksgruppensprache_7.json'),
    8: require('./volksgruppensprache/volksgruppensprache_8.json'),
  },
  mathematik: {
    1: require('./mathematik/mathematik_1.json'),
    2: require('./mathematik/mathematik_2.json'),
    3: require('./mathematik/mathematik_3.json'),
    4: require('./mathematik/mathematik_4.json'),
    5: require('./mathematik/mathematik_5.json'),
    6: require('./mathematik/mathematik_6.json'),
    7: require('./mathematik/mathematik_7.json'),
    8: require('./mathematik/mathematik_8.json'),
  },
}

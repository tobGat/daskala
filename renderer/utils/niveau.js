// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
// Helpers für AHS/ST-Differenzierung
// Interne Skala 1-7: AHS = intern 1..5, ST = intern 3..7 (Überlappung 3..5).

export function niveauOffset(niveau) {
  return niveau === 'ST' ? 2 : 0
}

// Niveau zur Zeit eines Datums aus der Historie ermitteln.
// historie: Array von { niveau, gueltig_ab } absteigend nach gueltig_ab sortiert.
// fallback: 'AHS' wenn keine Historie verfügbar.
export function niveauZurZeit(historie, datum, fallback = 'AHS') {
  if (!historie || historie.length === 0) return fallback
  if (!datum) return historie[0].niveau
  for (const h of historie) {
    if (h.gueltig_ab <= datum) return h.niveau
  }
  // Datum vor erstem Eintrag → ältester bekannter Niveau-Eintrag
  return historie[historie.length - 1].niveau
}

// Aktuell gültiges Niveau aus der Historie (jüngster Eintrag mit gueltig_ab <= heute)
export function aktuellesNiveau(historie, fallback = 'AHS') {
  const heute = new Date().toISOString().slice(0, 10)
  return niveauZurZeit(historie, heute, fallback)
}

// Eingabe-Note (1-5 auf aktuellem Niveau) → interner Wert (1-7) für die DB-Speicherung.
// (Wird aktuell NICHT zum Speichern verwendet — Eintraege bleiben als Lehrer-Eingabe.
// Diese Helper dient nur als Referenz für Berechnung/Anzeige.)
export function noteEingabeZuIntern(notenEingabe, niveau) {
  return notenEingabe + niveauOffset(niveau)
}

// Interner Wert (1-7) → angezeigte Note (1-5) auf gegebenem Niveau, mit Deckelung.
export function notenInternZuAnzeige(intern, niveau) {
  const angezeigt = intern - niveauOffset(niveau)
  if (angezeigt < 1) return 1
  if (angezeigt > 5) return 5
  return angezeigt
}

// Tailwind-Klassen für die Zellen-Hintergrundfarbe je nach Niveau.
// Grünlich = AHS, Gelblich = ST. Nur subtil, soll Note nicht überdecken.
export function niveauBgKlasse(niveau) {
  if (niveau === 'AHS') return 'niveau-bg-ahs'
  if (niveau === 'ST') return 'niveau-bg-st'
  return ''
}

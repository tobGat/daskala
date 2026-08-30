// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Reiner Lese-Zugriff auf die Kompetenzraster (statische Referenzdaten aus core/data).
// Kein DB-Zugriff. Aktuell nur Deutsch (Schulstufe 1–8); erweiterbar über KATALOG + matchFachKey.
// Die Funktionen sind async, damit sie sich wie die übrigen Domain-/IPC-Aufrufe verhalten.
const KATALOG = require('../data/kompetenzraster')

// Default-Niveaustufe für Raster ohne eigene Angabe (Schulstufe 1–2 haben im PDF nur EIN Niveau):
// eine einzige "erreicht"-Stufe – keine erfundenen Mehrstufen-Bezeichnungen.
const DEFAULT_NIVEAUSTUFEN = [
  { niveau: 1, bezeichnung: 'erreicht' },
]

// Gängige lebende Fremdsprachen (Fachname-Erkennung). „latein" ist bewusst NICHT dabei (keine lebende Sprache).
const FREMDSPRACHEN = [
  'englisch', 'französisch', 'franzoesisch', 'italienisch', 'spanisch', 'russisch',
  'kroatisch', 'bosnisch', 'serbisch', 'slowenisch', 'tschechisch', 'slowakisch',
  'ungarisch', 'polnisch', 'türkisch', 'tuerkisch', 'fremdsprache',
]

// Fachname → Katalog-Schlüssel (unscharf, damit z. B. „Deutsch 1a" passt). Erweiterbar.
function matchFachKey(fachName) {
  const n = String(fachName ?? '').toLowerCase()
  if (n.includes('deutsch')) return 'deutsch'
  if (FREMDSPRACHEN.some(s => n.includes(s))) return 'fremdsprache'
  return null
}

// Manuelle Zuordnung pro Fach hat Vorrang: 'keines' → kein Raster; 'deutsch'/'fremdsprache' → dieser Katalog;
// sonst (null/undefined/'auto') → Namenserkennung.
function resolveKey(fachName, override) {
  if (override === 'keines') return null
  if (override === 'deutsch' || override === 'fremdsprache') return override
  return matchFachKey(fachName)
}

async function hatRaster(fachName, override) {
  return resolveKey(fachName, override) !== null
}

async function listSchulstufen(fachName, override) {
  const key = resolveKey(fachName, override)
  if (!key || !KATALOG[key]) return []
  return Object.keys(KATALOG[key])
    .map(Number)
    .sort((a, b) => a - b)
}

// Ein Item auf eine einheitliche Form bringen: { text, niveau1, niveau2, niveau3, niveau1_standard }.
// Stufe 1–2: Item ist ein String → text. Stufe 3–8: Objekt mit niveauX (teils null), Stufe 6–8 zusätzlich niveau1_standard.
function normItem(item) {
  if (typeof item === 'string') {
    return { text: item, niveau1: null, niveau2: null, niveau3: null, niveau1_standard: null, text_standard: null }
  }
  return {
    text: item.text ?? null,
    niveau1: item.niveau1 ?? null,
    niveau2: item.niveau2 ?? null,
    niveau3: item.niveau3 ?? null,
    niveau1_standard: item.niveau1_standard ?? null,
    text_standard: item.text_standard ?? null,
  }
}

async function getRaster(fachName, schulstufe, override) {
  const key = resolveKey(fachName, override)
  const stufe = Number(schulstufe)
  const raw = key && KATALOG[key] ? KATALOG[key][stufe] : null
  if (!raw) return null
  return {
    fach: raw.fach,
    schulstufe: raw.schulstufe,
    niveaustufen: Array.isArray(raw.niveaustufen) && raw.niveaustufen.length ? raw.niveaustufen : DEFAULT_NIVEAUSTUFEN,
    bereiche: (raw.kompetenzbereiche ?? []).map(b => ({
      name: b.name,
      basis: b.basis ?? null,
      kategorien: (b.kategorien ?? []).map(k => ({
        name: k.name,
        items: (k.items ?? []).map(normItem),
      })),
    })),
  }
}

module.exports = { matchFachKey, hatRaster, listSchulstufen, getRaster }

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React from 'react'

// Änderungsprotokoll – neueste Version oben.
// WICHTIG: `version` muss der veröffentlichten App-Version entsprechen. Beim
// nächsten Release oben einen neuen Eintrag ergänzen.
export const CHANGELOG = [
  {
    version: '1.0.62',
    datum: 'Juli 2026',
    punkte: [
      'Schüler:innen-Listen lassen sich jetzt pro Klasse sortieren: nach Vorname, nach Nachname oder manuell. Bei „Manuell" bringst du die Reihenfolge per Drag-&-Drop selbst in Ordnung. Die Sortierung wählst du oben in der Notentabelle.',
      'Neu in den Einstellungen: Anzeige der App-Version und ein Button „Auf Updates prüfen".',
    ],
  },
  {
    version: '1.0.61',
    datum: 'Juli 2026',
    punkte: [
      'Fehler behoben: Ein Fach mit bereits erfassten Noten oder Notenspalten lässt sich jetzt zuverlässig löschen – die zugehörigen Notendaten werden dabei sauber mitentfernt.',
      'Mehr Stabilität und Sicherheit im Hintergrund: robustere Datenbank-Aktualisierung und aussagekräftigere Fehlerprotokolle bei Problemen.',
      'App-Sperre: klarer Hinweis in den Einstellungen, dass der PIN ein Sichtschutz und keine Verschlüsselung ist.',
    ],
  },
  {
    version: '1.0.59',
    datum: 'Juli 2026',
    punkte: [
      'Wettervorschau im Stundenplan – mit genauer Ortssuche, optionaler Anzeige nach Tageszeiten (Vormittag/Mittag/Abend) und einem kleinen Symbol samt Temperatur direkt in jeder Stundenzelle.',
      'Datensicherung deutlich verbessert: automatische Sicherung in einen Ordner (sparsam – nur bei Änderungen, Anzahl wählbar), Erinnerung ans Sichern und automatische Sicherung vor jedem Update.',
      'Sicherungen lassen sich jetzt direkt in der App wiederherstellen (mit Datum und Art zur Auswahl).',
      'App-Sperre mit PIN (Strg + L) – blendet die Inhalte bei Abwesenheit aus.',
      'Beim Anlegen von Schüler:innen können gleich die Fächer gewählt werden; mit Enter speichern und flüssig den nächsten Namen eintippen.',
      'Nach Updates werden die Neuerungen in diesem Fenster angezeigt.',
      'Einstellungen übersichtlicher in einklappbare Bereiche gegliedert.',
      'Daskala gibt es jetzt auch für Linux (AppImage, deb, rpm).',
      'Dashboard aufgeräumt.',
    ],
  },
]

// Versionsvergleich „a > b" → >0, gleich → 0, „a < b" → <0.
export function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export default function ChangelogModal({ versionen, onClose }) {
  const eintraege = versionen && versionen.length ? versionen : CHANGELOG.slice(0, 1)
  return (
    <div className="modal-overlay" style={{ zIndex: 140 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex items-center gap-2">
            <span>🎉</span> Was ist neu
          </h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose}>✕</button>
        </div>
        <p className="text-xs text-ink-400 dark:text-ink-500 mb-5">Danke fürs Aktualisieren! Das hat sich geändert:</p>

        <div className="space-y-6">
          {eintraege.map(v => (
            <section key={v.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-sm font-semibold text-coral-600 dark:text-coral-400">Version {v.version}</span>
                {v.datum && <span className="text-[11px] text-ink-400">{v.datum}</span>}
              </div>
              <ul className="space-y-1.5">
                {v.punkte.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700 dark:text-paper-200">
                    <span className="text-coral-500 flex-shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-6">
          <button className="btn-primary w-full" onClick={onClose}>Verstanden</button>
        </div>
      </div>
    </div>
  )
}

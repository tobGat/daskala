// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kleine, gesteuerte Liste von Materialien (Dateipfade oder Links) für die Stundenplanung.
// value = string[]; onChange(neuesArray). Persistenz erfolgt beim Aufrufer (zeilensepariert in der
// bestehenden `link`-Spalte – rückwärtskompatibel zu einem einzelnen Link/Pfad).
import { useState } from 'react'

// Anzeigename: letzter Pfad-/URL-Abschnitt (voller Wert im Tooltip).
function kurzName(s) {
  const t = String(s ?? '').trim().replace(/[\\/]+$/, '')
  const teil = t.split(/[\\/]/).pop() || t
  return teil.length > 48 ? teil.slice(0, 47) + '…' : teil
}

export default function MaterialListe({ items = [], onChange }) {
  const [neu, setNeu] = useState('')

  const hinzufuegen = (wert) => {
    const w = String(wert ?? '').trim()
    if (!w) return
    onChange([...items, w])
    setNeu('')
  }
  const entfernen = (i) => onChange(items.filter((_, idx) => idx !== i))
  const oeffnen = (w) => window.api.shell?.open(w)
  const dateiWaehlen = async () => {
    const p = await window.api.dialog.openFile([])
    if (p) hinzufuegen(p)
  }

  return (
    <div>
      {items.length > 0 && (
        <ul className="space-y-1 mb-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm rounded-lg border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900/40 px-2 py-1">
              <span className="text-ink-400 flex-shrink-0" aria-hidden>{/^https?:/i.test(it) ? '🔗' : '📄'}</span>
              <span className="flex-1 truncate text-ink-700 dark:text-paper-200" title={it}>{kurzName(it)}</span>
              <button type="button" className="text-ink-500 hover:text-coral-600 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center" onClick={() => oeffnen(it)} title="Öffnen">↗</button>
              <button type="button" className="text-ink-400 hover:text-red-500 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center" onClick={() => entfernen(i)} title="Entfernen">✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder="https://… oder C:\… einfügen"
          value={neu}
          onChange={e => setNeu(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hinzufuegen(neu) } }}
        />
        <button type="button" className="btn-secondary text-xs px-2 py-1 flex-shrink-0" onClick={dateiWaehlen} title="Datei auswählen">📂</button>
        <button type="button" className="btn-secondary text-xs px-2 py-1 flex-shrink-0" onClick={() => hinzufuegen(neu)} disabled={!neu.trim()} title="Hinzufügen">＋</button>
      </div>
    </div>
  )
}

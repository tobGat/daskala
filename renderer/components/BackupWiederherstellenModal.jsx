// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

function fmtDatum(iso) {
  try {
    return new Date(iso).toLocaleString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}
function fmtGroesse(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

const ART_FARBE = {
  'automatisch':          'bg-mint-100 text-mint-700 dark:bg-mint-900/40 dark:text-mint-300',
  'manuell':              'bg-lavender-100 text-lavender-700 dark:bg-lavender-900/40 dark:text-lavender-300',
  'vor Update':           'bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300',
  'vor Zurücksetzen':     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'vor Wiederherstellung':'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

export default function BackupWiederherstellenModal({ onClose }) {
  const pushToast = useStore(s => s.pushToast)
  const [liste, setListe] = useState(null) // null = lädt
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.backup.liste().then(setListe).catch(() => setListe([]))
  }, [])

  const wiederherstellen = async (b) => {
    const ok = window.confirm(
      `Diese Sicherung wiederherstellen?\n\n${fmtDatum(b.datumIso)} · ${b.art}\n\n`
      + 'Deine aktuellen Daten werden vorher automatisch gesichert, dann durch die Sicherung ersetzt. '
      + 'Die App startet danach neu.'
    )
    if (!ok) return
    setBusy(true)
    const res = await window.api.backup.wiederherstellen(b.pfad)
    if (!res?.ok) {
      setBusy(false)
      pushToast(res?.fehler || 'Wiederherstellung fehlgeschlagen.', 'error')
    }
    // Bei Erfolg startet die App neu – hier passiert dann nichts mehr.
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 130 }} onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-box max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Sicherung wiederherstellen</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <p className="text-xs text-ink-400 dark:text-ink-500 mb-4">
          Wähle eine Sicherung, um sie zurückzuspielen. Deine aktuellen Daten werden vorher automatisch gesichert.
        </p>

        {liste === null ? (
          <p className="text-sm text-ink-400 text-center py-6">Sicherungen werden geladen…</p>
        ) : liste.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Noch keine Sicherungen vorhanden.</p>
        ) : (
          <div className="space-y-1.5">
            {liste.map((b, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-paper-200 dark:border-ink-700"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-800 dark:text-paper-100">{fmtDatum(b.datumIso)}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ART_FARBE[b.art] || 'bg-paper-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'}`}>
                      {b.art}
                    </span>
                    <span className="text-[10px] text-ink-400">
                      {b.quelle === 'ordner' ? 'Sicherungsordner' : 'intern'} · {fmtGroesse(b.groesse)}
                    </span>
                  </div>
                </div>
                <button
                  className="btn-secondary flex-shrink-0"
                  onClick={() => wiederherstellen(b)}
                  disabled={busy}
                >
                  Wiederherstellen
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <button className="btn-secondary w-full" onClick={onClose} disabled={busy}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState } from 'react'
import useStore from '../store/useStore'

const BESTAETIGUNGSWORT = 'ZURÜCKSETZEN'

// Mehrfach abgesichertes Zurücksetzen der gesamten App:
//   1. eigener Dialog (nicht direkt im Einstellungen-Fenster)
//   2. empfohlene Sicherung
//   3. Checkbox „mir ist bewusst…"
//   4. Bestätigungswort eintippen
//   5. Button erst dann aktiv
//   6. abschließender System-Bestätigungsdialog
export default function AppZuruecksetzenModal({ onClose }) {
  const pushToast = useStore(s => s.pushToast)
  const [verstanden, setVerstanden] = useState(false)
  const [wort, setWort] = useState('')
  const [gesichert, setGesichert] = useState(false)
  const [busy, setBusy] = useState(false)

  const wortOk = wort.trim().toUpperCase() === BESTAETIGUNGSWORT
  const bereit = verstanden && wortOk && !busy

  const handleSicherung = async () => {
    setBusy(true)
    try {
      const p = await window.api.backup.jetzt()
      if (p) { setGesichert(true); pushToast('Sicherung erstellt.', 'success') }
      else pushToast('Sicherung abgebrochen.', 'info')
    } finally { setBusy(false) }
  }

  const handleReset = async () => {
    if (!bereit) return
    // Letzte Hürde: System-Bestätigung
    if (!window.confirm('Wirklich ALLE Daten löschen und die App zurücksetzen?\nDies kann nicht rückgängig gemacht werden.')) return
    setBusy(true)
    await window.api.app.reset()
    // Die App startet danach neu – ab hier passiert normalerweise nichts mehr.
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 130 }} onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-box max-w-lg">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">⚠️</span>
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">App zurücksetzen</h2>
        </div>

        <p className="text-sm text-ink-600 dark:text-ink-300 mb-3">
          Dabei werden <strong>alle</strong> Daten unwiderruflich gelöscht: Schuljahre, Klassen,
          Schüler:innen, Noten, Planungen, Vorlagen und sämtliche Einstellungen. Die App startet
          danach wie bei der Erstinstallation.
        </p>
        <p className="text-xs text-ink-400 dark:text-ink-500 mb-4">
          Nicht betroffen: bereits erstellte Sicherungen und deine Materialordner auf der Festplatte.
          Vor dem Zurücksetzen wird zusätzlich automatisch eine Sicherheitskopie im internen
          Backup-Ordner abgelegt.
        </p>

        {/* Hürde: Sicherung */}
        <div className="rounded-xl border border-paper-200 dark:border-ink-700 p-3 mb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-700 dark:text-paper-200">
              {gesichert ? '✓ Sicherung erstellt' : 'Empfohlen: zuerst eine Sicherung erstellen'}
            </span>
            <button className="btn-secondary flex-shrink-0" onClick={handleSicherung} disabled={busy}>
              {gesichert ? 'Erneut sichern' : 'Sicherung erstellen'}
            </button>
          </div>
        </div>

        {/* Hürde: Checkbox */}
        <label className="flex items-start gap-2 cursor-pointer select-none mb-4">
          <input type="checkbox" checked={verstanden} onChange={e => setVerstanden(e.target.checked)} className="mt-0.5" />
          <span className="text-sm text-ink-700 dark:text-paper-200">
            Mir ist bewusst, dass alle Daten unwiderruflich gelöscht werden.
          </span>
        </label>

        {/* Hürde: Bestätigungswort */}
        <label className="block text-xs text-ink-500 mb-1">
          Tippe zur Bestätigung <strong>{BESTAETIGUNGSWORT}</strong>:
        </label>
        <input
          className="input mb-5"
          value={wort}
          onChange={e => setWort(e.target.value)}
          placeholder={BESTAETIGUNGSWORT}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            onClick={handleReset}
            disabled={!bereit}
          >
            Unwiderruflich zurücksetzen
          </button>
        </div>
      </div>
    </div>
  )
}

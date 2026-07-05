// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import { monatsName, SCHULJAHR_MONATE } from '../../utils/datum'

const KATEGORIEN = [
  { id: 'organisation', label: 'Organisation', emoji: '🗂️' },
  { id: 'doku',         label: 'Dokumentation', emoji: '📋' },
  { id: 'elternarbeit', label: 'Elternarbeit',  emoji: '👨‍👩‍👧' },
  { id: 'konferenz',    label: 'Konferenz',     emoji: '🤝' },
]

// modus: 'jahr' | 'woche'
// vorlage: existierender Datensatz (zum Editieren) ODER null/undefined (Neu)
// initialMonat: bei modus='jahr' und Neu — Vorbelegung des Monats
// parent: bei Sub-Aufgabe — die Parent-Aufgabe (zeigt Hinweis, übernimmt Monat/Kategorie)
export default function KvAufgabenModal({ modus, vorlage = null, initialMonat = 9, parent = null, onClose, onSaved }) {
  const istEdit = !!vorlage
  const istJahr = modus === 'jahr'
  const istSub  = !!parent || !!vorlage?.parent_id

  const [titel,        setTitel]        = useState(vorlage?.titel ?? '')
  const [beschreibung, setBeschreibung] = useState(vorlage?.beschreibung ?? '')
  const [rechtsbezug,  setRechtsbezug]  = useState(vorlage?.rechtsbezug ?? '')
  const [monat,        setMonat]        = useState(vorlage?.monat ?? parent?.monat ?? initialMonat)
  const [kategorie,    setKategorie]    = useState(vorlage?.kategorie ?? parent?.kategorie ?? 'organisation')
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSpeichern = async () => {
    if (!titel.trim()) return
    setSaving(true)
    try {
      const data = istJahr
        ? { monat, titel: titel.trim(), beschreibung: beschreibung.trim() || null, rechtsbezug: rechtsbezug.trim() || null, kategorie, parentId: parent?.id ?? null }
        : { titel: titel.trim(), rechtsbezug: rechtsbezug.trim() || null }
      const api = istJahr ? window.api.kv.jahresaufgaben : window.api.kv.wochenaufgaben
      if (istEdit) await api.updateTemplate(vorlage.id, data)
      else         await api.createTemplate(data)
      onSaved?.()
      onClose()
    } finally { setSaving(false) }
  }

  const handleLoeschen = async () => {
    const bestaetigt = confirm(
      `Vorlage „${vorlage.titel}" wirklich löschen?\n\n` +
      `Alle dazugehörigen Erledigungs-Einträge (Häkchen + Notizen) gehen ebenfalls verloren.`
    )
    if (!bestaetigt) return
    setDeleting(true)
    try {
      const api = istJahr ? window.api.kv.jahresaufgaben : window.api.kv.wochenaufgaben
      await api.deleteTemplate(vorlage.id)
      onSaved?.()
      onClose()
    } finally { setDeleting(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink-900 dark:text-white">
            {istEdit
              ? (istJahr ? (vorlage?.parent_id ? 'Sub-Aufgabe bearbeiten' : 'Jahresaufgabe bearbeiten') : 'Wochenaufgabe bearbeiten')
              : (parent ? 'Neue Sub-Aufgabe' : (istJahr ? 'Neue Jahresaufgabe' : 'Neue Wochenaufgabe'))}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-paper-200 dark:hover:bg-ink-800"
          >✕</button>
        </div>

        <div className="space-y-3">
          {parent && (
            <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl px-3 py-2 text-xs">
              <p className="text-ink-500">Sub-Aufgabe zu:</p>
              <p className="font-semibold text-ink-800 dark:text-paper-200 truncate">{parent.titel}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Titel *</label>
            <input
              className="input"
              value={titel}
              onChange={e => setTitel(e.target.value)}
              placeholder={istSub ? 'z.B. Termin festlegen' : (istJahr ? 'z.B. Elternsprechtag organisieren' : 'z.B. Klassenbuch kontrollieren')}
              autoFocus
            />
          </div>

          {istJahr && !istSub && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Monat</label>
                <select className="input" value={monat} onChange={e => setMonat(parseInt(e.target.value))}>
                  {SCHULJAHR_MONATE.map(m => (
                    <option key={m} value={m}>{m}. {monatsName(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Kategorie</label>
                <select className="input" value={kategorie} onChange={e => setKategorie(e.target.value)}>
                  {KATEGORIEN.map(k => (
                    <option key={k.id} value={k.id}>{k.emoji} {k.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {istJahr && (
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                Beschreibung <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <textarea
                className="input resize-none"
                rows={2}
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder="Kurze Erläuterung oder Hinweis"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
              Rechtsbezug <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <input
              className="input"
              value={rechtsbezug}
              onChange={e => setRechtsbezug(e.target.value)}
              placeholder="z.B. § 19 Abs. 4 SchUG"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          {istEdit && (
            <button
              className="btn-danger text-xs"
              onClick={handleLoeschen}
              disabled={saving || deleting}
              title="Vorlage und alle Erledigungs-Einträge löschen"
            >
              {deleting ? 'Lösche…' : 'Löschen'}
            </button>
          )}
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving || deleting}>
            Abbrechen
          </button>
          <button
            className="btn-primary flex-1"
            disabled={saving || deleting || !titel.trim()}
            onClick={handleSpeichern}
          >
            {saving ? 'Speichern…' : (istEdit ? 'Speichern' : 'Hinzufügen')}
          </button>
        </div>
      </div>
    </div>
  )
}

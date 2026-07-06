// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

const EMPFAENGER = 't.gatterbauer@proton.me'
const KATEGORIEN = ['Lob', 'Verbesserungsvorschlag', 'Fehler / Problem', 'Frage', 'Sonstiges']
const BEWERTUNGEN = [['😞', 1], ['😐', 2], ['🙂', 3], ['😀', 4], ['🤩', 5]]

export default function FeedbackModal({ onClose }) {
  const pushToast = useStore(s => s.pushToast)
  const [bewertung, setBewertung] = useState(0)
  const [kategorie, setKategorie] = useState('Verbesserungsvorschlag')
  const [nachricht, setNachricht] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [version, setVersion] = useState('')

  useEffect(() => { window.api.app.version().then(setVersion).catch(() => {}) }, [])

  const gueltig = nachricht.trim().length > 0

  const baueText = () => {
    const z = []
    if (bewertung) z.push(`Bewertung: ${bewertung}/5`)
    z.push(`Kategorie: ${kategorie}`, '', nachricht.trim(), '', '—')
    if (name.trim() || email.trim()) z.push(`Von: ${name.trim()}${email.trim() ? ` <${email.trim()}>` : ''}`)
    z.push(`App-Version: ${version || '?'}`, `System: ${navigator.platform}`)
    return z.join('\n')
  }

  const perMail = () => {
    if (!gueltig) return
    const betreff = `Daskala-Feedback: ${kategorie}`
    const url = `mailto:${EMPFAENGER}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(baueText())}`
    window.api.shell.open(url)
    pushToast('Mailprogramm wird geöffnet …', 'info')
  }

  const kopieren = async () => {
    if (!gueltig) return
    const text = `An: ${EMPFAENGER}\nBetreff: Daskala-Feedback: ${kategorie}\n\n${baueText()}`
    const ok = await window.api.app.clipboard(text)
    pushToast(ok ? 'Feedback in die Zwischenablage kopiert.' : 'Kopieren fehlgeschlagen.', ok ? 'success' : 'error')
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex items-center gap-2"><span>💬</span> Feedback</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose}>✕</button>
        </div>
        <p className="text-xs text-ink-400 dark:text-ink-500 mb-5">
          Deine Meinung hilft, Daskala zu verbessern. Alles freiwillig – Name und E-Mail nur, wenn du eine Antwort möchtest.
        </p>

        {/* Bewertung */}
        <div className="mb-4">
          <label className="block text-xs text-ink-500 mb-1.5">Wie gefällt dir Daskala?</label>
          <div className="flex gap-2">
            {BEWERTUNGEN.map(([emoji, wert]) => (
              <button
                key={wert}
                type="button"
                onClick={() => setBewertung(wert === bewertung ? 0 : wert)}
                className={`text-2xl w-11 h-11 rounded-xl border-2 transition-all
                  ${bewertung === wert
                    ? 'border-coral-400 bg-coral-50 dark:bg-coral-900/30 scale-105'
                    : 'border-paper-200 dark:border-ink-700 opacity-60 hover:opacity-100'}`}
                title={`${wert}/5`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Kategorie */}
        <div className="mb-4">
          <label className="block text-xs text-ink-500 mb-1">Art des Feedbacks</label>
          <select className="input" value={kategorie} onChange={e => setKategorie(e.target.value)}>
            {KATEGORIEN.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        {/* Nachricht */}
        <div className="mb-4">
          <label className="block text-xs text-ink-500 mb-1">Deine Nachricht</label>
          <textarea
            className="input min-h-[120px] resize-y"
            value={nachricht}
            onChange={e => setNachricht(e.target.value)}
            placeholder="Was gefällt dir, was fehlt, was ist unklar …"
            autoFocus
          />
        </div>

        {/* Optional: Kontakt */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="block text-xs text-ink-500 mb-1">Name (optional)</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">E-Mail (optional)</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          </div>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={kopieren} disabled={!gueltig}>Text kopieren</button>
          <button className="btn-primary flex-1" onClick={perMail} disabled={!gueltig}>Per E-Mail senden</button>
        </div>
        <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-3 text-center">
          Öffnet dein Mailprogramm mit vorausgefülltem Text an <span className="font-medium">{EMPFAENGER}</span>.
          Kein Mailprogramm? Nutze „Text kopieren" und sende ihn manuell.
        </p>
      </div>
    </div>
  )
}

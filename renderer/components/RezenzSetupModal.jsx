// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Verpflichtendes Einmal-Modal zur Festlegung des Rezenz-Faktors (§ 20 LBVO:
// „zuletzt erreichter Leistungsstand"). Erscheint beim Erststart und einmalig
// nach dem einführenden Update (gated in App.jsx auf `rezenz_faktor == null`).
// Nicht schließbar – der einzige Ausgang ist „Übernehmen".
import React, { useState } from 'react'
import useStore from '../store/useStore'

// Beispielrechnung mit drei SA-Noten (alt → neu), lineare Rang-Gewichte 1 … faktor.
function beispielSchnitt(noten, faktor) {
  const m = noten.length
  if (!(faktor > 1) || m < 2) return noten.reduce((a, b) => a + b, 0) / m
  let summe = 0, gew = 0
  noten.forEach((n, i) => {
    const g = 1 + (faktor - 1) * (i / (m - 1))
    summe += n * g
    gew += g
  })
  return summe / gew
}

export default function RezenzSetupModal() {
  const [faktor, setFaktor] = useState(2)
  const [speichert, setSpeichert] = useState(false)

  const beispielNoten = [4, 3, 2] // alt → neu
  const schnitt = beispielSchnitt(beispielNoten, faktor)

  const uebernehmen = async () => {
    if (speichert) return
    setSpeichert(true)
    const wert = String(faktor)
    await window.api.einstellungen.set('rezenz_faktor', wert)
    await window.api.zeugnisnoten.rechneAllesNeu()
    // Store spiegeln → Render-Bedingung `rezenz_faktor == null` greift nicht mehr → Modal schließt.
    useStore.setState({ einstellungen: { ...useStore.getState().einstellungen, rezenz_faktor: wert } })
    const { aktivesFach, ladeFachDaten } = useStore.getState()
    if (aktivesFach) await ladeFachDaten(aktivesFach.id)
    setSpeichert(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/40 dark:bg-ink-950/60 p-4">
      <div className="bg-white dark:bg-ink-900 rounded-3xl shadow-pop w-[30rem] max-w-[92vw] max-h-[90vh] overflow-y-auto border border-paper-200 dark:border-ink-700 animate-pop-in p-6">
        <div className="text-4xl mb-3 text-center">⚖️</div>
        <h2 className="text-xl font-semibold text-ink-900 dark:text-white mb-1 text-center">Gewichtung neuerer Leistungen</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-5 text-center leading-relaxed">
          Nach § 20 LBVO zählt der <strong>zuletzt erreichte Leistungsstand</strong> stärker als frühere
          Leistungen. Lege fest, wie viel stärker die neueste Note innerhalb einer Kategorie (SA, Test,
          Individuell) zählt. Diese Einstellung kannst du später jederzeit ändern.
        </p>

        <div className="rounded-2xl bg-paper-50 dark:bg-ink-800/60 border border-paper-200 dark:border-ink-700 p-4 mb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-ink-700 dark:text-paper-200">Faktor</span>
            <span className="text-lg font-bold tabular-nums text-coral-600 dark:text-coral-300">
              {faktor.toFixed(1).replace('.', ',')}×
            </span>
          </div>
          <input
            type="range"
            min="1" max="3" step="0.1"
            value={faktor}
            onChange={e => setFaktor(parseFloat(e.target.value))}
            className="w-full accent-coral-500"
          />
          <div className="flex justify-between text-[10px] text-ink-400 mt-1">
            <span>1,0 – gleich gewichtet</span>
            <span>3,0 – stark</span>
          </div>

          <div className="mt-4 border-t border-paper-200 dark:border-ink-700 pt-3">
            <p className="text-[11px] text-ink-500 dark:text-ink-400 mb-1">
              Beispiel – drei Schularbeiten (alt → neu): <span className="tabular-nums font-medium">4, 3, 2</span>
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400">
              Schnitt: <span className="font-bold tabular-nums text-ink-700 dark:text-paper-200">{schnitt.toFixed(2).replace('.', ',')}</span>
              {faktor <= 1
                ? ' (reiner Durchschnitt)'
                : ' – die neueste Note zieht das Ergebnis nach unten.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary w-full"
          onClick={uebernehmen}
          disabled={speichert}
        >
          {speichert ? 'Wird übernommen …' : 'Übernehmen'}
        </button>
        <p className="text-[10px] text-ink-400 text-center mt-3">
          Faktor 1,0 bedeutet: alle Leistungen zählen gleich (wie bisher).
        </p>
      </div>
    </div>
  )
}

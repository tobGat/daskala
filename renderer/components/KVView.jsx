import React, { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import Jahresplaner from './kv/Jahresplaner'
import Wochenroutine from './kv/Wochenroutine'
import TriggerListe from './kv/TriggerListe'

const SUB_TABS = [
  { id: 'jahr',    label: 'Jahresplaner', emoji: '📅' },
  { id: 'woche',   label: 'Wochenroutine', emoji: '🗓️' },
  { id: 'trigger', label: 'Trigger',       emoji: '⚠️' },
]

function KVKlasseChip({ klasse, aktiv, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-150 active:scale-[0.97]
        ${aktiv
          ? 'bg-white dark:bg-ink-800 border-coral-300 dark:border-coral-700 shadow-soft text-ink-900 dark:text-paper-100'
          : 'bg-paper-50 dark:bg-ink-900/40 border-paper-200 dark:border-ink-800 text-ink-600 dark:text-ink-400 hover:border-coral-200 dark:hover:border-coral-800'}`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: klasse.farbe || '#fb6936' }} />
      <span className="text-xs font-semibold">{klasse.name}</span>
    </button>
  )
}

export default function KVView() {
  const { klassen, aktiveKVKlasse, setAktiveKVKlasse, aktuellesSchuljahr } = useStore()

  const kvKlassen = useMemo(() => klassen.filter(k => k.ist_kv), [klassen])
  const [subTab, setSubTab] = useState('jahr')
  const [offeneRueckrufe, setOffeneRueckrufe] = useState(0)

  // Initiale Klassenauswahl + offene Rückrufe prüfen
  useEffect(() => {
    if (!aktiveKVKlasse && kvKlassen.length > 0) {
      setAktiveKVKlasse(kvKlassen[0])
    } else if (aktiveKVKlasse && !kvKlassen.some(k => k.id === aktiveKVKlasse.id)) {
      setAktiveKVKlasse(kvKlassen[0] ?? null)
    }
    // Beim Öffnen einmal alte offene Rückrufe → Trigger erzeugen
    window.api.kv.pruefeOffeneRueckrufe().then(setOffeneRueckrufe).catch(() => {})
  }, [kvKlassen.length])

  if (kvKlassen.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-paper-50 dark:bg-ink-950">
        <div className="text-center animate-fade-up max-w-md">
          <div className="text-5xl mb-3">📜</div>
          <p className="text-base text-ink-700 dark:text-paper-200 font-semibold mb-1">Keine KV-Klasse markiert</p>
          <p className="text-sm text-ink-500 mb-2">
            Markiere eine Klasse als KV-Klasse: Rechtsklick auf einen Klassen-Tab → „Als KV-Klasse markieren".
          </p>
        </div>
      </div>
    )
  }

  const aktiv = aktiveKVKlasse ?? kvKlassen[0]

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-paper-50 dark:bg-ink-950">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-paper-200 dark:border-ink-800 bg-white dark:bg-ink-900">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Begrüßung */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-2xl leading-none" aria-hidden>📜</span>
            <div className="leading-tight">
              <div className="text-base font-bold text-ink-800 dark:text-paper-100 font-display">Klassenvorstand</div>
              <div className="text-[11px] text-ink-500 dark:text-ink-400">
                {aktuellesSchuljahr?.bezeichnung ?? '—'}
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-paper-200 dark:bg-ink-800 flex-shrink-0" />

          {/* Sub-Tab-Switcher */}
          <div className="flex items-center gap-0.5 bg-paper-100 dark:bg-ink-800 rounded-xl p-0.5 flex-shrink-0">
            {SUB_TABS.map(t => (
              <button
                key={t.id}
                className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all whitespace-nowrap flex items-center gap-1.5
                  ${subTab === t.id
                    ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
                    : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-paper-200'}`}
                onClick={() => setSubTab(t.id)}
              >
                <span aria-hidden>{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Klassen-Auswahl (falls > 1 KV-Klasse) */}
          {kvKlassen.length > 1 && (
            <>
              <div className="w-px h-8 bg-paper-200 dark:bg-ink-800 flex-shrink-0" />
              <div className="flex items-center gap-1.5 flex-wrap">
                {kvKlassen.map(k => (
                  <KVKlasseChip
                    key={k.id}
                    klasse={k}
                    aktiv={aktiv?.id === k.id}
                    onClick={() => setAktiveKVKlasse(k)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Klassenname rechts wenn nur eine */}
          {kvKlassen.length === 1 && aktiv && (
            <div className="ml-auto flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: aktiv.farbe || '#fb6936' }} />
              <span className="font-semibold text-ink-700 dark:text-paper-200">{aktiv.name}</span>
            </div>
          )}

          {offeneRueckrufe > 0 && (
            <div className="ml-auto text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg">
              {offeneRueckrufe} offene Rückrufe → Trigger erzeugt
            </div>
          )}
        </div>
      </div>

      {/* Sub-View */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {aktiv && subTab === 'jahr'    && <Jahresplaner   klasse={aktiv} schuljahr={aktuellesSchuljahr} />}
        {aktiv && subTab === 'woche'   && <Wochenroutine  klasse={aktiv} schuljahr={aktuellesSchuljahr} />}
        {aktiv && subTab === 'trigger' && <TriggerListe   klasse={aktiv} />}
      </div>
    </div>
  )
}

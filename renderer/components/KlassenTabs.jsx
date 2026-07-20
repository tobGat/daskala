// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef } from 'react'
import useStore from '../store/useStore'

const FARB_PALETTE = [
  '#a5b4fc', '#6366f1', '#3730a3',
  '#c4b5fd', '#8b5cf6', '#5b21b6',
  '#d8b4fe', '#a855f7', '#6b21a8',
  '#f9a8d4', '#ec4899', '#9d174d',
  '#fca5a5', '#ef4444', '#991b1b',
  '#fdba74', '#f97316', '#c2410c',
  '#fde68a', '#eab308', '#854d0e',
  '#86efac', '#22c55e', '#15803d',
  '#5eead4', '#14b8a6', '#0f766e',
  '#67e8f9', '#06b6d4', '#0e7490',
  '#93c5fd', '#3b82f6', '#1d4ed8',
  '#cbd5e1', '#64748b', '#334155',
]

const ALLE_KLASSEN_VIEWS = [
  { id: 'notentabelle',    label: 'Noten',       planungOnly: false },
  // Kompetenzen vorübergehend ausgeblendet, bis die Funktion vollständig eingebettet ist:
  // { id: 'kompetenzen',     label: 'Kompetenzen', planungOnly: false },
  { id: 'klassenplanung',  label: 'Planung',     planungOnly: true  },
  { id: 'sitzplan',        label: 'Sitzplan',    planungOnly: false },
  { id: 'jahresplanung',   label: 'Jahresplan',  planungOnly: true  },
]

export default function KlassenTabs() {
  const {
    klassen, aktiveKlasse, setAktiveKlasse,
    openModal, ladeAktiveKlassenliste, setKlassenReihenfolge,
    vorlagenModus, setVorlagenModus,
    currentView, setCurrentView,
    einstellungen, pushToast,
  } = useStore()
  const planungAktiv = einstellungen?.planung_aktiv === '1'
  const KLASSEN_VIEWS = ALLE_KLASSEN_VIEWS.filter(v => !v.planungOnly || planungAktiv)

  const [renameId, setRenameId] = useState(null)
  const [renameWert, setRenameWert] = useState('')
  const renameInputRef = useRef(null)
  const [farbMenuKlasse, setFarbMenuKlasse] = useState(null)
  const [klasseDropdown, setKlasseDropdown] = useState(null) // { klasse, x, y }
  const [klasseContextMenu, setKlasseContextMenu] = useState(null) // { klasse, x, y }
  const [teamsLinkModal, setTeamsLinkModal] = useState(null) // { id, wert }
  const [loeschModal, setLoeschModal] = useState(null) // { klasse, stats }
  const [dupModal, setDupModal] = useState(null) // { klasse, name, mitPlanung, mitSchueler }
  const [dupLaeuft, setDupLaeuft] = useState(false)
  const [dragKlasseId, setDragKlasseId] = useState(null)
  const [dragOverKlasseId, setDragOverKlasseId] = useState(null)

  // ── Klassen-Tabs per Drag-and-Drop sortieren ──────────────────────────────
  const handleTabDragStart = (e, id) => {
    setDragKlasseId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }
  const handleTabDragOver = (e, id) => {
    if (dragKlasseId == null || id === dragKlasseId) return
    e.preventDefault() // ohne preventDefault feuert onDrop nicht
    e.dataTransfer.dropEffect = 'move'
    if (id !== dragOverKlasseId) setDragOverKlasseId(id)
  }
  const handleTabDragEnd = () => { setDragKlasseId(null); setDragOverKlasseId(null) }
  const handleTabDrop = (e, zielId) => {
    e.preventDefault()
    const quelleId = dragKlasseId
    setDragKlasseId(null)
    setDragOverKlasseId(null)
    if (quelleId == null || quelleId === zielId) return
    const von = klassen.findIndex(k => k.id === quelleId)
    const bis = klassen.findIndex(k => k.id === zielId)
    if (von < 0 || bis < 0) return
    const neu = [...klassen]
    const [gezogen] = neu.splice(von, 1)
    neu.splice(bis, 0, gezogen)
    setKlassenReihenfolge(neu)
  }

  const handleDuplizieren = async () => {
    if (!dupModal) return
    setDupLaeuft(true)
    try {
      const neueId = await window.api.klassen.duplizieren({
        klasseId: dupModal.klasse.id,
        neuerName: dupModal.name.trim() || (dupModal.klasse.name + ' (Kopie)'),
        mitPlanung: dupModal.mitPlanung,
        mitSchueler: dupModal.mitSchueler,
      })
      setDupModal(null)
      if (!neueId) { pushToast('Klasse konnte nicht dupliziert werden.', 'error'); return }
      pushToast('Klasse dupliziert.', 'success')
      await ladeAktiveKlassenliste()
      const neu = useStore.getState().klassen.find(k => k.id === neueId)
      if (neu) await setAktiveKlasse(neu)
    } finally {
      setDupLaeuft(false)
    }
  }

  const renameStarten = (klasse) => {
    setRenameId(klasse.id)
    setRenameWert(klasse.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const renameSpeichern = async () => {
    if (!renameWert.trim()) { setRenameId(null); return }
    const res = await window.api.klassen.rename(renameId, renameWert.trim())
    if (res?.ordnerWarnung) pushToast(res.ordnerWarnung, 'error')
    await ladeAktiveKlassenliste()
    setRenameId(null)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-paper-100 dark:bg-ink-900 border-b border-paper-200 dark:border-ink-800">

      {/* Vorlagen-Modus Anzeige */}
      {vorlagenModus && (
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300 flex-shrink-0 flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden>📐</span> Vorlagen-Modus
        </span>
      )}

      {/* Dashboard-Button (Stundenplan + Übersicht) */}
      {!vorlagenModus && (
        <button
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap transition-all
            ${currentView === 'stundenplan'
              ? 'bg-white dark:bg-ink-800 text-coral-600 dark:text-coral-300 shadow-soft'
              : 'text-ink-600 dark:text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 hover:bg-paper-200 dark:hover:bg-ink-800'}`}
          onClick={() => setCurrentView('stundenplan')}
          title="Dashboard mit Stundenplan, Aufgaben und Terminen"
        >
          <span aria-hidden>🗓️</span>
          Dashboard
        </button>
      )}

      {/* KV-Button (nur sichtbar wenn mindestens eine KV-Klasse existiert) */}
      {!vorlagenModus && klassen.some(k => k.ist_kv) && (
        <button
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap transition-all
            ${currentView === 'kv'
              ? 'bg-white dark:bg-ink-800 text-coral-600 dark:text-coral-300 shadow-soft'
              : 'text-ink-600 dark:text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 hover:bg-paper-200 dark:hover:bg-ink-800'}`}
          onClick={() => setCurrentView('kv')}
          title="Klassenvorstand: Jahresplaner, Wochenroutine, Trigger (Beta)"
        >
          <span aria-hidden>📜</span>
          KV
          <span className="text-[8px] font-bold uppercase tracking-wide leading-none px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Beta</span>
        </button>
      )}

      {/* Trennlinie */}
      <div className="w-px h-5 bg-paper-300 dark:bg-ink-700 flex-shrink-0" />

      {/* Klassen-Tabs */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {klassen.map(k => (
          <div key={k.id} className="relative flex-shrink-0">
            {renameId === k.id ? (
              <input
                ref={renameInputRef}
                className="px-3 py-1 text-sm border border-coral-400 rounded-full outline-none bg-white dark:bg-ink-800 text-ink-900 dark:text-white w-24 focus:ring-2 focus:ring-coral-500/30"
                value={renameWert}
                onChange={e => setRenameWert(e.target.value)}
                onBlur={renameSpeichern}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameSpeichern()
                  if (e.key === 'Escape') setRenameId(null)
                }}
              />
            ) : (
              <button
                draggable
                onDragStart={e => handleTabDragStart(e, k.id)}
                onDragOver={e => handleTabDragOver(e, k.id)}
                onDragLeave={() => setDragOverKlasseId(prev => (prev === k.id ? null : prev))}
                onDrop={e => handleTabDrop(e, k.id)}
                onDragEnd={handleTabDragEnd}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold rounded-2xl whitespace-nowrap transition-all duration-150 active:cursor-grabbing
                  ${aktiveKlasse?.id === k.id && currentView !== 'stundenplan'
                    ? 'bg-white dark:bg-ink-800 text-ink-900 dark:text-paper-100 shadow-soft'
                    : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200 hover:bg-paper-200/70 dark:hover:bg-ink-800/70'}
                  ${dragOverKlasseId === k.id && dragKlasseId !== k.id ? 'ring-2 ring-coral-400/70' : ''}
                  ${dragKlasseId === k.id ? 'opacity-40' : ''}`}
                onClick={e => {
                  if (vorlagenModus) {
                    setAktiveKlasse(k)
                    setKlasseDropdown(null)
                    setCurrentView('jahresplanung')
                  } else if (currentView === 'stundenplan' || currentView === 'kv') {
                    setAktiveKlasse(k)
                    setKlasseDropdown(null)
                    setCurrentView('notentabelle')
                  } else if (aktiveKlasse?.id !== k.id) {
                    setAktiveKlasse(k)
                    setKlasseDropdown(null)
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setKlasseDropdown(prev =>
                      prev?.klasse.id === k.id ? null : { klasse: k, x: rect.left, y: rect.bottom + 4 }
                    )
                  }
                }}
                onContextMenu={e => { e.preventDefault(); setKlasseDropdown(null); setKlasseContextMenu({ klasse: k, x: e.clientX, y: e.clientY }) }}
                title="Klick: Ansicht wählen · Rechtsklick: Optionen"
              >
                {k.farbe && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: k.farbe }} />
                )}
                {k.name}
                {aktiveKlasse?.id === k.id && currentView !== 'stundenplan' && KLASSEN_VIEWS.find(v => v.id === currentView) && (
                  <span className="text-ink-500 font-normal text-xs">
                    · {KLASSEN_VIEWS.find(v => v.id === currentView).label}
                  </span>
                )}
                <span className="text-ink-500 text-[10px]">▾</span>
              </button>
            )}
          </div>
        ))}

        <button
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-ink-500 dark:text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 hover:bg-coral-50 dark:hover:bg-coral-900/30 rounded-2xl transition-all"
          onClick={() => openModal('klasseHinzufuegen')}
          title={vorlagenModus ? 'Neue Vorlagenklasse' : 'Neue Klasse'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {vorlagenModus ? 'Vorlagenklasse' : 'Klasse'}
        </button>
      </div>

      {/* Schuljahr + Aktionen rechts */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Vorlagen-Modus umschalten – nur wenn das Planungsmodul aktiv ist (Vorlagen sind
            Fach-Jahresplanungen). Im aktiven Vorlagenmodus bleibt der Button sichtbar, damit man ihn beenden kann. */}
        {(planungAktiv || vorlagenModus) && (
          <button
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap transition-all
              ${vorlagenModus
                ? 'bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300'
                : 'text-ink-600 dark:text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 hover:bg-paper-200 dark:hover:bg-ink-800'}`}
            onClick={() => setVorlagenModus(!vorlagenModus)}
            title={vorlagenModus ? 'Zurück zu den echten Klassen' : 'Vorlagenklassen mit fertigen Jahresplanungen verwalten'}
          >
            <span aria-hidden>{vorlagenModus ? '✕' : '📐'}</span>
            {vorlagenModus ? 'Vorlagenmodus beenden' : 'Vorlagen'}
          </button>
        )}

        {!vorlagenModus && (<>
        <button
          className="text-ink-500 dark:text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-paper-200 dark:hover:bg-ink-800 transition-all"
          onClick={() => openModal('einstellungen')}
          title="Einstellungen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          className="text-ink-500 dark:text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-paper-200 dark:hover:bg-ink-800 transition-all"
          onClick={() => openModal('exportieren')}
          title="Exportieren"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
          </svg>
        </button>
        </>)}
      </div>

      {/* Ansichts-Dropdown für Klasse */}
      {klasseDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setKlasseDropdown(null)} />
          <div className="fixed z-50 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700 shadow-xl py-1 min-w-[140px]"
            style={{ left: klasseDropdown.x, top: klasseDropdown.y }}>
            {KLASSEN_VIEWS.map(v => (
              <button
                key={v.id}
                className={`w-full text-left px-4 py-2 text-sm transition-colors
                  ${currentView === v.id
                    ? 'text-ink-900 dark:text-white font-semibold bg-paper-100 dark:bg-ink-700'
                    : 'text-ink-700 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink-900 dark:hover:text-white'}`}
                onClick={() => { setCurrentView(v.id); setKlasseDropdown(null) }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Kontextmenü für Klasse */}
      {klasseContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setKlasseContextMenu(null)} />
          <div className="context-menu" style={{ left: klasseContextMenu.x, top: klasseContextMenu.y, position: 'fixed' }}>
            <div className="context-menu-item" onClick={() => { renameStarten(klasseContextMenu.klasse); setKlasseContextMenu(null) }}>
              Umbenennen
            </div>
            <div className="context-menu-item" onClick={() => { setFarbMenuKlasse(klasseContextMenu.klasse); setKlasseContextMenu(null) }}>
              Farbe ändern
            </div>
            <div className="context-menu-item" onClick={() => { setTeamsLinkModal({ id: klasseContextMenu.klasse.id, wert: klasseContextMenu.klasse.teams_link ?? '' }); setKlasseContextMenu(null) }}>
              Teams-Link {klasseContextMenu.klasse.teams_link ? 'bearbeiten' : 'hinzufügen'}
            </div>
            {!vorlagenModus && (
              <div className="context-menu-item" onClick={() => { const k = klasseContextMenu.klasse; setKlasseContextMenu(null); setDupModal({ klasse: k, name: k.name + ' (Kopie)', mitPlanung: true, mitSchueler: true }) }}>
                <span aria-hidden>⧉</span> Klasse duplizieren…
              </div>
            )}
            {!vorlagenModus && (
              <div
                className="context-menu-item"
                onClick={async () => {
                  const klasse = klasseContextMenu.klasse
                  setKlasseContextMenu(null)
                  await window.api.klassen.setIstKv(klasse.id, !klasse.ist_kv)
                  await ladeAktiveKlassenliste()
                }}
              >
                <span aria-hidden>{klasseContextMenu.klasse.ist_kv ? '📜' : '◯'}</span>
                {klasseContextMenu.klasse.ist_kv ? 'KV-Markierung entfernen' : 'Als KV-Klasse markieren'}
              </div>
            )}
            <div className="context-menu-separator" />
            <div
              className="context-menu-item text-red-600 dark:text-red-400 hover:!bg-red-50 dark:hover:!bg-red-900/30"
              onClick={async () => {
                const klasse = klasseContextMenu.klasse
                setKlasseContextMenu(null)
                const stats = await window.api.klassen.getDeleteStats(klasse.id)
                setLoeschModal({ klasse, stats })
              }}
            >
              Klasse löschen…
            </div>
          </div>
        </>
      )}

      {/* Lösch-Bestätigungs-Modal */}
      {loeschModal && (
        <KlasseLoeschenModal
          klasse={loeschModal.klasse}
          stats={loeschModal.stats}
          onConfirm={async () => {
            await window.api.klassen.delete(loeschModal.klasse.id)
            await ladeAktiveKlassenliste()
            setLoeschModal(null)
          }}
          onClose={() => setLoeschModal(null)}
        />
      )}

      {/* Klasse-duplizieren-Modal */}
      {dupModal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setDupModal(null)}>
          <div className="modal-box max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink-900 dark:text-white">Klasse duplizieren</h3>
              <button onClick={() => setDupModal(null)} className="text-ink-400 hover:text-ink-600 text-sm">✕</button>
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-4">
              Dupliziert „{dupModal.klasse.name}" inkl. aller Fächer. Noten werden nicht übernommen.
            </p>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Klassenname</label>
            <input
              value={dupModal.name}
              onChange={e => setDupModal(m => ({ ...m, name: e.target.value }))}
              className="w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-3 py-2 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400 mb-4"
              autoFocus
            />
            <div className="flex flex-col gap-2 mb-5">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={dupModal.mitSchueler} onChange={e => setDupModal(m => ({ ...m, mitSchueler: e.target.checked }))} className="mt-0.5" />
                <span className="text-sm text-ink-700 dark:text-paper-200">Schüler:innen übernehmen</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={dupModal.mitPlanung} onChange={e => setDupModal(m => ({ ...m, mitPlanung: e.target.checked }))} className="mt-0.5" />
                <span className="text-sm text-ink-700 dark:text-paper-200">
                  Jahresplanung samt Materialien übernehmen
                  <span className="block text-[11px] text-ink-400">Abschnitte, Dokumente und Links werden mitkopiert.</span>
                </span>
              </label>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setDupModal(null)}>Abbrechen</button>
              <button className="btn-primary flex-1" onClick={handleDuplizieren} disabled={dupLaeuft || !dupModal.name.trim()}>
                {dupLaeuft ? 'Dupliziere…' : 'Duplizieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teams-Link Modal */}
      {teamsLinkModal && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTeamsLinkModal(null)} />
          <div className="fixed z-50 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700 shadow-xl p-4 w-96"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
            <p className="text-sm font-medium text-ink-700 dark:text-ink-200 mb-3">Teams-Kanal-Link</p>
            <input
              className="input w-full mb-3 text-sm"
              placeholder="https://teams.microsoft.com/l/channel/…"
              value={teamsLinkModal.wert}
              onChange={e => setTeamsLinkModal(prev => ({ ...prev, wert: e.target.value }))}
              autoFocus
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  await window.api.klassen.setTeamsLink(teamsLinkModal.id, teamsLinkModal.wert.trim() || null)
                  await ladeAktiveKlassenliste()
                  setTeamsLinkModal(null)
                }
                if (e.key === 'Escape') setTeamsLinkModal(null)
              }}
            />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-sm" onClick={() => setTeamsLinkModal(null)}>Abbrechen</button>
              {teamsLinkModal.wert && (
                <button className="btn-danger text-sm" onClick={async () => {
                  await window.api.klassen.setTeamsLink(teamsLinkModal.id, null)
                  await ladeAktiveKlassenliste()
                  setTeamsLinkModal(null)
                }}>Entfernen</button>
              )}
              <button className="btn-primary flex-1 text-sm" onClick={async () => {
                await window.api.klassen.setTeamsLink(teamsLinkModal.id, teamsLinkModal.wert.trim() || null)
                await ladeAktiveKlassenliste()
                setTeamsLinkModal(null)
              }}>Speichern</button>
            </div>
          </div>
        </>
      )}

      {/* Farb-Picker für Klasse */}
      {farbMenuKlasse && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFarbMenuKlasse(null)} />
          <div className="fixed z-50 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700 shadow-xl p-3"
            style={{ left: 80, top: 44 }}>
            <p className="text-xs font-medium text-ink-500 dark:text-ink-400 mb-2">Farbe für „{farbMenuKlasse.name}"</p>
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
              {FARB_PALETTE.map(farbe => (
                <button
                  key={farbe}
                  className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${farbMenuKlasse.farbe === farbe ? 'ring-2 ring-offset-1 ring-ink-400' : ''}`}
                  style={{ backgroundColor: farbe }}
                  onClick={async () => {
                    await window.api.klassen.setFarbe(farbMenuKlasse.id, farbe)
                    await ladeAktiveKlassenliste()
                    setFarbMenuKlasse(null)
                  }}
                />
              ))}
              <button
                className="w-5 h-5 rounded-full border-2 border-dashed border-paper-300 dark:border-ink-600 flex items-center justify-center text-ink-400 text-[9px] hover:border-ink-400 transition-colors"
                onClick={async () => {
                  await window.api.klassen.setFarbe(farbMenuKlasse.id, null)
                  await ladeAktiveKlassenliste()
                  setFarbMenuKlasse(null)
                }}
                title="Keine Farbe"
              >✕</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Klasse löschen Modal ─────────────────────────────────────────────────────
function KlasseLoeschenModal({ klasse, stats, onConfirm, onClose }) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const erwartet = klasse.name.trim()
  const istBestaetigt = confirmText.trim() === erwartet

  const handleConfirm = async () => {
    if (!istBestaetigt) return
    setLoading(true)
    try { await onConfirm() } finally { setLoading(false) }
  }

  const hatDaten = stats && (stats.fachCount > 0 || stats.schuelerCount > 0 || stats.noteCount > 0 || stats.todoCount > 0)

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-xl flex-shrink-0">
            ⚠️
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink-900 dark:text-white leading-tight">Klasse löschen</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
          </div>
        </div>

        <p className="text-sm text-ink-700 dark:text-paper-200 mb-3">
          Die Klasse <span className="font-bold text-ink-900 dark:text-white">„{klasse.name}"</span> wird endgültig gelöscht.
        </p>

        {hatDaten && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl p-3 mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 mb-2">Mit gelöscht werden</p>
            <ul className="space-y-1 text-sm text-ink-700 dark:text-paper-200">
              {stats.schuelerCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>🙋</span> {stats.schuelerCount} Schüler:in{stats.schuelerCount === 1 ? '' : 'nen'}</li>
              )}
              {stats.fachCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>📚</span> {stats.fachCount} Fach{stats.fachCount === 1 ? '' : 'er'}</li>
              )}
              {stats.noteCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>✍️</span> {stats.noteCount} eingetragene Note{stats.noteCount === 1 ? '' : 'n'}</li>
              )}
              {stats.todoCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>✏️</span> {stats.todoCount} ToDo{stats.todoCount === 1 ? '' : 's'}</li>
              )}
              {stats.terminCount > 0 && (
                <li className="flex items-center gap-2 text-ink-500 text-xs"><span aria-hidden>📅</span> {stats.terminCount} Termin{stats.terminCount === 1 ? '' : 'e'} verlieren die Klassen-Zuordnung</li>
              )}
              {stats.kvAktenvermerkeCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>📋</span> {stats.kvAktenvermerkeCount} Aktenvermerk{stats.kvAktenvermerkeCount === 1 ? '' : 'e'}</li>
              )}
              {stats.kvElternkontakteCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>📞</span> {stats.kvElternkontakteCount} Elternkontakt{stats.kvElternkontakteCount === 1 ? '' : 'e'}</li>
              )}
              {stats.kvFehlstundenCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>📆</span> {stats.kvFehlstundenCount} Fehlstunden-Eintr{stats.kvFehlstundenCount === 1 ? 'ag' : 'äge'}</li>
              )}
              {stats.kvTriggerCount > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden>⚠️</span> {stats.kvTriggerCount} KV-Trigger</li>
              )}
            </ul>
          </div>
        )}

        <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
          Tippe <span className="font-mono font-bold text-ink-800 dark:text-paper-100">{erwartet}</span> zum Bestätigen
        </label>
        <input
          className="input mb-4"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={erwartet}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && istBestaetigt) handleConfirm() }}
        />

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            Abbrechen
          </button>
          <button
            className="btn-danger flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleConfirm}
            disabled={!istBestaetigt || loading}
          >
            {loading ? 'Lösche…' : 'Endgültig löschen'}
          </button>
        </div>
      </div>
    </div>
  )
}

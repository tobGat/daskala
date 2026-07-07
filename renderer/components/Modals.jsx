// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import { berechneSchulferien } from '../utils/schulferien'
import SchuelerAvatar from './SchuelerAvatar'
import AvatarEditorModal from './AvatarEditorModal'

const FARB_PALETTE = [
  // Indigo
  '#a5b4fc', '#6366f1', '#3730a3',
  // Violet
  '#c4b5fd', '#8b5cf6', '#5b21b6',
  // Purple
  '#d8b4fe', '#a855f7', '#6b21a8',
  // Pink
  '#f9a8d4', '#ec4899', '#9d174d',
  // Red
  '#fca5a5', '#ef4444', '#991b1b',
  // Orange
  '#fdba74', '#f97316', '#c2410c',
  // Yellow
  '#fde68a', '#eab308', '#854d0e',
  // Green
  '#86efac', '#22c55e', '#15803d',
  // Teal
  '#5eead4', '#14b8a6', '#0f766e',
  // Cyan
  '#67e8f9', '#06b6d4', '#0e7490',
  // Blue
  '#93c5fd', '#3b82f6', '#1d4ed8',
  // Slate
  '#cbd5e1', '#64748b', '#334155',
]

function FarbPicker({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Farbe</label>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
        {FARB_PALETTE.map(farbe => (
          <button
            key={farbe}
            type="button"
            className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${value === farbe ? 'ring-2 ring-offset-1 ring-ink-400 dark:ring-ink-500 scale-110' : ''}`}
            style={{ backgroundColor: farbe }}
            onClick={() => onChange(farbe)}
          />
        ))}
        <button
          type="button"
          className={`w-5 h-5 rounded-full border-2 border-dashed border-paper-300 dark:border-ink-600 flex items-center justify-center text-ink-400 text-[9px] transition-colors hover:border-ink-400 ${!value ? 'ring-2 ring-offset-1 ring-ink-400 dark:ring-ink-500' : ''}`}
          onClick={() => onChange(null)}
          title="Keine Farbe"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Klasse hinzufügen ────────────────────────────────────────────────────────
export function KlasseHinzufuegenModal() {
  const { closeModal, aktuellesSchuljahr, vorlagenModus, ladeAktiveKlassenliste } = useStore()
  const [name, setName] = useState('')
  const [farbe, setFarbe] = useState(FARB_PALETTE[0])
  const [teamsLink, setTeamsLink] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSpeichern = async () => {
    if (!name.trim() || !aktuellesSchuljahr) return
    setLoading(true)
    await window.api.klassen.create({
      schuljahrId: aktuellesSchuljahr.id,
      name: name.trim(),
      farbe,
      teamsLink: vorlagenModus ? null : (teamsLink.trim() || null),
      istVorlage: vorlagenModus ? 1 : 0,
    })
    await ladeAktiveKlassenliste()
    closeModal()
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-5">{vorlagenModus ? 'Neue Vorlagenklasse' : 'Neue Klasse'}</h2>
        <input
          className="input mb-5"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={vorlagenModus ? 'Name der Vorlage, z.B. „1. Klasse"' : 'Klassenname, z.B. 2b'}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSpeichern() }}
        />
        <div className="mb-5">
          <FarbPicker value={farbe} onChange={setFarbe} />
        </div>
        {!vorlagenModus && (
        <input
          className="input mb-5"
          value={teamsLink}
          onChange={e => setTeamsLink(e.target.value)}
          placeholder="Teams-Kanal-Link (optional)"
        />
        )}
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={closeModal}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading || !name.trim()}>
            {loading ? 'Speichern…' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fach hinzufügen ──────────────────────────────────────────────────────────
// Gemeinsame Alle/Auswahl-Schülerauswahl (Fach anlegen & Fach-Zuordnung bearbeiten)
function SchuelerAuswahl({ schueler, alle, setAlle, ausgewaehlt, setAusgewaehlt }) {
  const toggle = (id) => setAusgewaehlt(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Schüler:innen</label>
      <div className="flex gap-2 mb-2">
        {[[true, 'Alle Schüler:innen'], [false, 'Auswahl']].map(([val, label]) => (
          <button key={String(val)} type="button" onClick={() => setAlle(val)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              alle === val
                ? 'border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900 dark:text-coral-300 dark:border-coral-600'
                : 'border-paper-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {!alle && (
        <>
          <div className="flex justify-between items-center text-xs text-ink-400 mb-1 px-1">
            <span>{ausgewaehlt.size} von {schueler.length} ausgewählt</span>
            <span className="flex gap-2">
              <button type="button" className="hover:text-coral-600" onClick={() => setAusgewaehlt(new Set(schueler.map(s => s.id)))}>Alle</button>
              <button type="button" className="hover:text-coral-600" onClick={() => setAusgewaehlt(new Set())}>Keine</button>
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-0.5 border border-paper-200 dark:border-ink-700 rounded-lg p-1">
            {schueler.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-3">Keine Schüler:innen in der Klasse</p>
            ) : schueler.map(s => {
              const on = ausgewaehlt.has(s.id)
              return (
                <button type="button" key={s.id} onClick={() => toggle(s.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${on ? 'bg-coral-50 dark:bg-coral-900/30' : 'hover:bg-paper-50 dark:hover:bg-ink-800'}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 ${on ? 'bg-coral-600 border-coral-600 text-white' : 'border-paper-300 dark:border-ink-600'}`}>{on ? '✓' : ''}</span>
                  <SchuelerAvatar schueler={s} size={24} />
                  <span className="text-sm text-ink-800 dark:text-paper-200 flex-1 truncate">{s.nachname} {s.vorname}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function FachHinzufuegenModal() {
  const { closeModal, aktiveKlasse, schueler, ladeAktiveKlassenliste } = useStore()
  const [name, setName] = useState('')
  const [farbe, setFarbe] = useState(null)
  const [benotungssystem, setBenotungssystem] = useState('standard')
  const [alleSchueler, setAlleSchueler] = useState(true)
  const [ausgewaehlt, setAusgewaehlt] = useState(() => new Set())
  const [loading, setLoading] = useState(false)

  const handleSpeichern = async () => {
    if (!name.trim() || !aktiveKlasse) return
    setLoading(true)
    await window.api.faecher.create({
      klasseId: aktiveKlasse.id, name: name.trim(), farbe, benotungssystem,
      alleSchueler: alleSchueler ? 1 : 0,
      schuelerIds: alleSchueler ? [] : [...ausgewaehlt],
    })
    await ladeAktiveKlassenliste()
    closeModal()
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-5">Neues Fach</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">Für Klasse {aktiveKlasse?.name}</p>
        <input
          className="input mb-5"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Fachname, z.B. Mathematik"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSpeichern() }}
        />
        <div className="mb-5">
          <FarbPicker value={farbe} onChange={setFarbe} />
        </div>
        <div className="mb-5">
          <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Benotungssystem</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                benotungssystem === 'standard'
                  ? 'border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900 dark:text-coral-300 dark:border-coral-600'
                  : 'border-paper-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800'
              }`}
              onClick={() => setBenotungssystem('standard')}
            >
              <div>Standard</div>
              <div className="text-xs opacity-70 mt-0.5">Noten 1–5</div>
            </button>
            <button
              type="button"
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                benotungssystem === 'differenziert'
                  ? 'border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900 dark:text-coral-300 dark:border-coral-600'
                  : 'border-paper-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800'
              }`}
              onClick={() => setBenotungssystem('differenziert')}
            >
              <div>AHS / ST</div>
              <div className="text-xs opacity-70 mt-0.5">Differenziert</div>
            </button>
          </div>
        </div>
        <SchuelerAuswahl
          schueler={schueler}
          alle={alleSchueler}
          setAlle={setAlleSchueler}
          ausgewaehlt={ausgewaehlt}
          setAusgewaehlt={setAusgewaehlt}
        />
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={closeModal}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading || !name.trim() || (!alleSchueler && ausgewaehlt.size === 0)}>
            {loading ? 'Speichern…' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fach-Zuordnung nachträglich bearbeiten (prop-getrieben, aus dem Fach-Kontextmenü) ──
export function FachSchuelerModal({ fach, onClose, onSaved }) {
  const { schueler } = useStore()
  const [alle, setAlle] = useState(fach.alle_schueler !== 0)
  const [ausgewaehlt, setAusgewaehlt] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.faecher.getSchuelerIds(fach.id).then(ids => {
      if (fach.alle_schueler === 0) { setAlle(false); setAusgewaehlt(new Set(ids)) }
      else setAlle(true)
      setLoading(false)
    }).catch(e => { console.error('getSchuelerIds:', e); setLoading(false) })
  }, [fach.id])

  const handleSpeichern = async () => {
    setSaving(true)
    try {
      await window.api.faecher.setSchueler(fach.id, { alle, schuelerIds: alle ? [] : [...ausgewaehlt] })
      await onSaved?.()
      onClose()
    } catch (e) {
      console.error('setSchueler:', e)
      useStore.getState().pushToast?.('Zuordnung speichern fehlgeschlagen.', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-1">Schüler:innen zuordnen</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">Fach „{fach.name}"</p>
        {loading ? (
          <p className="text-sm text-ink-400 py-6 text-center">Lade…</p>
        ) : (
          <SchuelerAuswahl schueler={schueler} alle={alle} setAlle={setAlle} ausgewaehlt={ausgewaehlt} setAusgewaehlt={setAusgewaehlt} />
        )}
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={saving || loading || (!alle && ausgewaehlt.size === 0)}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Schüler:innen verwalten ─────────────────────────────────────────────────
export function SchuelerVerwaltenModal() {
  const { closeModal, aktiveKlasse, schueler, ladeSchueler } = useStore()
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [importListe, setImportListe] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('liste') // 'liste' | 'hinzufuegen' | 'import'
  const [loeschenId, setLoeschenId] = useState(null)
  const [avatarSchueler, setAvatarSchueler] = useState(null)
  const [faecher, setFaecher] = useState([])
  const [ausgewaehlteFaecher, setAusgewaehlteFaecher] = useState(() => new Set())
  const vornameRef = useRef(null)
  const nachnameRef = useRef(null)

  // ── Manuelle Reihenfolge (Drag-and-Drop) ──────────────────────────────────
  const istManuell = aktiveKlasse?.sortierung === 'manuell'
  // Beim Öffnen über den „↕ Reihenfolge"-Button (openModal(..., { reorder:true }))
  // direkt im Bearbeitungsmodus starten – aber nur bei manueller Sortierung.
  const [reorderModus, setReorderModus] = useState(() => {
    const st = useStore.getState()
    return !!st.modalData?.reorder && st.aktiveKlasse?.sortierung === 'manuell'
  })
  const [reihenfolgeListe, setReihenfolgeListe] = useState(() =>
    useStore.getState().modalData?.reorder ? [...useStore.getState().schueler] : []
  )
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  // Robustheit: bricht der Drag ab (Esc, außerhalb), Zustand zurücksetzen.
  useEffect(() => {
    const clear = () => { setDragId(null); setDragOverId(null) }
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const startReorder = () => {
    setReihenfolgeListe([...schueler])
    setReorderModus(true)
    setTab('liste')
  }
  const handleReorderDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }
  const handleReorderDragOver = (e, id) => {
    e.preventDefault() // ohne preventDefault feuert onDrop nicht
    e.dataTransfer.dropEffect = 'move'
    if (id !== dragOverId) setDragOverId(id)
  }
  const handleReorderDrop = (e, zielId) => {
    e.preventDefault()
    const quelleId = dragId
    setDragOverId(null)
    setDragId(null)
    if (quelleId == null || quelleId === zielId) return
    setReihenfolgeListe(prev => {
      const von = prev.findIndex(s => s.id === quelleId)
      const bis = prev.findIndex(s => s.id === zielId)
      if (von < 0 || bis < 0) return prev
      const kopie = [...prev]
      const [gezogen] = kopie.splice(von, 1)
      kopie.splice(bis, 0, gezogen)
      return kopie
    })
  }
  const handleReihenfolgeSpeichern = async () => {
    await window.api.schueler.reorder(reihenfolgeListe.map((s, i) => ({ id: s.id, reihenfolge: i })))
    await ladeSchueler()
    setReorderModus(false)
  }

  // Fächer der Klasse laden; manuelle Fächer standardmäßig ausgewählt.
  useEffect(() => {
    if (!aktiveKlasse) return
    window.api.faecher.getAll(aktiveKlasse.id).then(fs => {
      setFaecher(fs)
      setAusgewaehlteFaecher(new Set(fs.filter(f => !f.alle_schueler).map(f => f.id)))
    })
  }, [aktiveKlasse?.id])

  const toggleFach = (id) => setAusgewaehlteFaecher(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleHinzufuegen = async () => {
    if (loading) return
    if (!vorname.trim() && !nachname.trim()) return
    setLoading(true)
    try {
      await window.api.schueler.create({
        klasseId: aktiveKlasse.id,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        fachIds: Array.from(ausgewaehlteFaecher),
      })
      await ladeSchueler()
      // Aktives Fach neu laden, damit die/der neue Schüler:in dort sofort erscheint.
      const { aktivesFach, ladeFachDaten } = useStore.getState()
      if (aktivesFach) await ladeFachDaten(aktivesFach.id)
      setVorname('')
      setNachname('')
      vornameRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleLoeschen = async (id) => {
    await window.api.schueler.delete(id)
    await ladeSchueler()
  }

  const handleToggle = async (s, feld) => {
    await window.api.schueler.update(s.id, {
      vorname: s.vorname,
      nachname: s.nachname,
      [feld]: s[feld] ? 0 : 1,
    })
    await ladeSchueler()
  }

  const handleDateiImport = async () => {
    const filePath = await window.api.dialog.openFile([
      { name: 'Tabellen', extensions: ['csv', 'xlsx', 'xls'] }
    ])
    if (!filePath) return
    const liste = await window.api.import.schuelerFromFile(filePath)
    setImportListe(liste)
  }

  const handleImportSpeichern = async () => {
    if (!importListe.length) return
    setLoading(true)
    await window.api.schueler.importBatch(aktiveKlasse.id, importListe, Array.from(ausgewaehlteFaecher))
    await ladeSchueler()
    const { aktivesFach, ladeFachDaten } = useStore.getState()
    if (aktivesFach) await ladeFachDaten(aktivesFach.id)
    setImportListe([])
    setTab('liste')
    setLoading(false)
  }

  // Fächer-Auswahl (in „Hinzufügen" und „Importieren" gleich verwendet).
  const faecherAuswahl = faecher.length > 0 && (
    <div>
      <label className="block text-xs text-ink-500 mb-1.5">Zu Fächern hinzufügen</label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {faecher.map(f => {
          const alle = !!f.alle_schueler
          const checked = alle || ausgewaehlteFaecher.has(f.id)
          return (
            <label
              key={f.id}
              className={`flex items-center gap-2 text-sm ${alle ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
              title={alle ? 'Enthält automatisch alle Schüler:innen der Klasse' : undefined}
            >
              <input type="checkbox" checked={checked} disabled={alle} onChange={() => toggleFach(f.id)} />
              <span className="text-ink-700 dark:text-paper-200 truncate">{f.name}</span>
              {alle && <span className="text-[10px] text-ink-400 flex-shrink-0">(alle)</span>}
            </label>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">
            Schüler:innen – {aktiveKlasse?.name}
          </h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-paper-100 dark:bg-ink-800 rounded-lg p-1">
          {[['liste', 'Liste'], ['hinzufuegen', 'Hinzufügen'], ['import', 'Importieren']].map(([val, label]) => (
            <button
              key={val}
              className={`flex-1 py-1.5 text-sm rounded font-medium transition-colors
                ${tab === val
                  ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-white shadow-sm'
                  : 'text-ink-500 dark:text-ink-400'}`}
              onClick={() => setTab(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Liste */}
        {tab === 'liste' && (
          <div>
            {schueler.length > 0 && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] text-ink-400 dark:text-ink-500">
                  {reorderModus ? 'Ziehen zum Sortieren' : `${schueler.length} Schüler:in${schueler.length === 1 ? '' : 'nen'}`}
                </span>
                {istManuell ? (
                  reorderModus ? (
                    <button
                      className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-300 hover:bg-coral-200 dark:hover:bg-coral-900/60 transition-colors"
                      onClick={handleReihenfolgeSpeichern}
                    >
                      ✓ Fertig
                    </button>
                  ) : (
                    <button
                      className="text-xs px-2.5 py-1 rounded-lg font-medium border border-paper-300 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors"
                      onClick={startReorder}
                    >
                      ↕ Reihenfolge bearbeiten
                    </button>
                  )
                ) : (
                  <span className="text-[11px] text-ink-400 dark:text-ink-500">Reihenfolge nur bei „Manuell"</span>
                )}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto space-y-1">
            {schueler.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-4">Noch keine Schüler:innen</p>
            ) : reorderModus ? (
              reihenfolgeListe.map(s => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={e => handleReorderDragStart(e, s.id)}
                  onDragOver={e => handleReorderDragOver(e, s.id)}
                  onDragLeave={() => setDragOverId(prev => (prev === s.id ? null : prev))}
                  onDrop={e => handleReorderDrop(e, s.id)}
                  className={`flex items-center gap-2 px-3 py-2 bg-paper-50 dark:bg-ink-800 rounded-lg cursor-grab active:cursor-grabbing
                    ${dragOverId === s.id ? 'ring-2 ring-coral-400 ring-inset' : ''} ${dragId === s.id ? 'opacity-50' : ''}`}
                >
                  <svg className="w-4 h-4 text-ink-300 dark:text-ink-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
                    <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
                    <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
                  </svg>
                  <SchuelerAvatar schueler={s} size={28} />
                  <span className="text-sm text-ink-900 dark:text-white flex-1">{s.nachname} {s.vorname}</span>
                </div>
              ))
            ) : schueler.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-paper-50 dark:bg-ink-800 rounded-lg">
                <SchuelerAvatar schueler={s} size={28} />
                <span className="text-sm text-ink-900 dark:text-white flex-1">
                  {s.nachname} {s.vorname}
                </span>
                <button
                  title="Avatar bearbeiten"
                  onClick={() => setAvatarSchueler(s)}
                  className="text-xs px-1.5 py-0.5 rounded border border-paper-200 text-ink-400 dark:border-ink-600 hover:border-coral-300 hover:text-coral-600 transition-colors"
                >🎨</button>
                {loeschenId === s.id && (
                  <>
                    <button
                      className="text-xs px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
                      onClick={() => handleLoeschen(s.id)}
                    >Entfernen</button>
                    <button
                      className="text-xs px-1.5 py-0.5 rounded text-ink-400 hover:text-ink-600 transition-colors"
                      onClick={() => setLoeschenId(null)}
                    >✕</button>
                  </>
                )}
                <button
                  title="Lernschwäche"
                  onClick={() => handleToggle(s, 'lernschwaeche')}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    s.lernschwaeche
                      ? 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400'
                      : 'border-paper-200 text-ink-400 dark:border-ink-600 hover:border-amber-300 hover:text-amber-600'
                  }`}
                >LS</button>
                <button
                  title="Legasthenie"
                  onClick={() => handleToggle(s, 'legasthenie')}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    s.legasthenie
                      ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400'
                      : 'border-paper-200 text-ink-400 dark:border-ink-600 hover:border-violet-300 hover:text-violet-600'
                  }`}
                >LEG</button>
                <button
                  title="Sonderpädagogischer Förderbedarf"
                  onClick={() => handleToggle(s, 'spf')}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    s.spf
                      ? 'bg-rose-100 border-rose-300 text-rose-700 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400'
                      : 'border-paper-200 text-ink-400 dark:border-ink-600 hover:border-rose-300 hover:text-rose-600'
                  }`}
                >SPF</button>
                {loeschenId !== s.id && (
                  <button
                    className="text-ink-600 dark:text-paper-300 dark:text-ink-600 hover:text-red-400 dark:hover:text-red-400 text-sm px-1 transition-colors"
                    onClick={() => setLoeschenId(s.id)}
                    title="Entfernen"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            </div>
          </div>
        )}

        {/* Manuell hinzufügen */}
        {tab === 'hinzufuegen' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">Vorname</label>
                <input
                  ref={vornameRef}
                  className="input"
                  value={vorname}
                  onChange={e => setVorname(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nachnameRef.current?.focus() } }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-ink-500 mb-1">Nachname</label>
                <input
                  ref={nachnameRef}
                  className="input"
                  value={nachname}
                  onChange={e => setNachname(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleHinzufuegen() } }}
                />
              </div>
            </div>

            {faecherAuswahl}

            <button
              className="btn-primary w-full"
              onClick={handleHinzufuegen}
              disabled={loading || (!vorname.trim() && !nachname.trim())}
            >
              Hinzufügen
            </button>
            <div className="text-xs text-ink-400 text-center">
              {schueler.length} Schüler:innen in der Klasse
            </div>
          </div>
        )}

        {/* Import */}
        {tab === 'import' && (
          <div className="space-y-3">
            {importListe.length === 0 ? (
              <div>
                <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">
                  CSV oder Excel-Datei mit Spalten „Vorname" und „Nachname"
                </p>
                <button className="btn-secondary w-full" onClick={handleDateiImport}>
                  Datei auswählen
                </button>
              </div>
            ) : (
              <div>
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium mb-1">
                    {importListe.length} Schüler:innen gefunden
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {importListe.map((s, i) => (
                      <p key={i} className="text-xs text-green-600 dark:text-green-500">
                        {s.nachname} {s.vorname}
                      </p>
                    ))}
                  </div>
                </div>
                {faecherAuswahl && <div className="mb-3">{faecherAuswahl}</div>}
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setImportListe([])}>Verwerfen</button>
                  <button
                    className="btn-primary flex-1"
                    onClick={handleImportSpeichern}
                    disabled={loading}
                  >
                    {loading ? 'Importieren…' : 'Importieren'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab !== 'liste' && (
          <div className="mt-4 pt-3 border-t border-paper-100 dark:border-ink-700">
            <button className="btn-secondary w-full" onClick={closeModal}>Schließen</button>
          </div>
        )}
      </div>

      {avatarSchueler && (
        <AvatarEditorModal
          schueler={avatarSchueler}
          onClose={() => setAvatarSchueler(null)}
          onSaved={ladeSchueler}
        />
      )}
    </div>
  )
}

// ─── Gewichtung anpassen (fach-spezifisch) ───────────────────────────────────
export function GewichtungModal() {
  const { closeModal, modalData: fach, gewichtungGlobal, einstellungen, ladeKlassen, aktuellesSchuljahr } = useStore()

  // Nur SA/Test/Individuell bilden die Note (wie global). MA & HÜ wirken als Einfluss.
  // Beim Laden auf 100 % normieren – exakt wie in den Einstellungen.
  const [gew, setGew] = useState(() => {
    const roh = {
      SA: fach?.gewichtung_sa ?? gewichtungGlobal['SA'] ?? 0.4,
      T: fach?.gewichtung_t ?? gewichtungGlobal['T'] ?? 0.3,
      CUSTOM: fach?.gewichtung_custom ?? gewichtungGlobal['CUSTOM'] ?? 0.1,
    }
    const summe = roh.SA + roh.T + roh.CUSTOM || 1
    const pct = {
      SA: Math.round(roh.SA / summe * 100),
      T: Math.round(roh.T / summe * 100),
      CUSTOM: Math.round(roh.CUSTOM / summe * 100),
    }
    const groesste = pct.SA >= pct.T && pct.SA >= pct.CUSTOM ? 'SA' : (pct.T >= pct.CUSTOM ? 'T' : 'CUSTOM')
    pct[groesste] += 100 - (pct.SA + pct.T + pct.CUSTOM)
    return pct
  })
  // Deckelung des MA- bzw. HÜ-Einflusses: Fach-Wert oder globaler Standard (0,5), unabhängig.
  const globalMaEinfluss = einstellungen?.['ma_max_einfluss'] ?? einstellungen?.['ma_hue_max_einfluss'] ?? '0.5'
  const globalHueEinfluss = einstellungen?.['hue_max_einfluss'] ?? einstellungen?.['ma_hue_max_einfluss'] ?? '0.5'
  const [maEinfluss, setMaEinfluss] = useState(fach?.ma_max_einfluss != null ? String(fach.ma_max_einfluss) : globalMaEinfluss)
  const [hueEinfluss, setHueEinfluss] = useState(fach?.hue_max_einfluss != null ? String(fach.hue_max_einfluss) : globalHueEinfluss)
  const [loading, setLoading] = useState(false)

  const gesamt = Object.values(gew).reduce((a, b) => a + b, 0)
  const katLabel = { SA: 'Schularbeiten', T: 'Tests', CUSTOM: 'Individuell' }

  const handleSpeichern = async () => {
    if (Math.abs(gesamt - 100) > 0.5) return
    if (!fach) return
    setLoading(true)
    await window.api.faecher.updateGewichtung(fach.id, {
      sa: gew.SA / 100,
      t: gew.T / 100,
      custom: gew.CUSTOM / 100,
      maEinfluss: parseFloat(maEinfluss),
      hueEinfluss: parseFloat(hueEinfluss),
    })
    await ladeKlassen(aktuellesSchuljahr.id)
    closeModal()
  }

  const handleZuruecksetzen = async () => {
    if (!fach) return
    setLoading(true)
    await window.api.faecher.resetGewichtung(fach.id)
    await ladeKlassen(aktuellesSchuljahr.id)
    closeModal()
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-1">Gewichtung anpassen</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-5">für {fach?.name}</p>

        <div className="space-y-3 mb-4">
          {Object.entries(katLabel).map(([kat, label]) => (
            <div key={kat} className="flex items-center gap-3">
              <span className="text-sm text-ink-600 dark:text-ink-400 w-28">{label}</span>
              <input
                type="range" min="0" max="100" step="5"
                className="flex-1"
                value={gew[kat]}
                onChange={e => setGew(prev => ({ ...prev, [kat]: parseFloat(e.target.value) }))}
              />
              <span className="text-sm font-medium w-12 text-right text-ink-900 dark:text-white">
                {gew[kat]}%
              </span>
            </div>
          ))}
        </div>

        <p className={`text-sm mb-1 ${Math.abs(gesamt - 100) > 0.5 ? 'text-red-500' : 'text-green-600'}`}>
          Gesamt: {gesamt.toFixed(0)}% {Math.abs(gesamt - 100) <= 0.5 ? '✓' : '(muss 100% sein)'}
        </p>

        {/* Einfluss von Mitarbeit & Hausübung (fach-spezifische Deckelung, MA/HÜ unabhängig) */}
        <div className="mt-4 pt-4 border-t border-paper-100 dark:border-ink-800">
          <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-1">Einfluss von Mitarbeit &amp; Hausübung</h3>
          <p className="text-[11px] text-ink-400 dark:text-ink-500 mb-3 leading-snug">
            MA (+/−) und HÜ (✓/✗) bilden keine Note, sondern verschieben sie leicht. Deckelung nur für dieses Fach – MA und HÜ unabhängig voneinander.
          </p>
          <div className="space-y-2.5">
            {[
              ['Mitarbeit', maEinfluss, setMaEinfluss],
              ['Hausübung', hueEinfluss, setHueEinfluss],
            ].map(([label, wert, setter]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-sm text-ink-600 dark:text-ink-400 w-28">{label}</span>
                <input
                  type="range" min="0" max="1.5" step="0.05"
                  className="flex-1"
                  value={wert}
                  onChange={e => setter(e.target.value)}
                />
                <span className="text-sm font-medium w-16 text-right tabular-nums text-ink-900 dark:text-white">
                  ± {Number(wert).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1.5">
            0 = kein Einfluss · 0,5 = Standard · höhere Werte wirken stärker
          </p>
        </div>

        <div className="flex gap-3 mt-5">
          <button className="btn-secondary" onClick={handleZuruecksetzen} disabled={loading}>
            Global verwenden
          </button>
          <button className="btn-secondary flex-1" onClick={closeModal}>Abbrechen</button>
          <button
            className="btn-primary flex-1"
            onClick={handleSpeichern}
            disabled={loading || Math.abs(gesamt - 100) > 0.5}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Schuljahreswechsel ───────────────────────────────────────────────────────
export function SchuljahrwechselModal() {
  const { closeModal, aktuellesSchuljahr, klassen, ladeSchuljahrDaten } = useStore()

  // [{ klasse, vorruecken, neuerName, faecher:[{fach, vorruecken}], schueler:[{schueler, aktion}] }]
  const [klassenDaten, setKlassenDaten] = useState([])
  const [neuesSchuljahr, setNeuesSchuljahr] = useState('')
  const [loading, setLoading] = useState(false)

  // Schuljahr-Bezeichnung automatisch inkrementieren
  useEffect(() => {
    if (aktuellesSchuljahr) {
      const bez = aktuellesSchuljahr.bezeichnung
      const match = bez.match(/(\d{4})\/(\d{2})/)
      if (match) {
        const startJahr = parseInt(match[1]) + 1
        const endJahr = startJahr + 1
        setNeuesSchuljahr(`${startJahr}/${String(endJahr).slice(2)}`)
      }
    }
  }, [aktuellesSchuljahr])

  // Klassen + Fächer + Schüler:innen laden
  useEffect(() => {
    const laden = async () => {
      const daten = []
      for (const klasse of klassen) {
        const [schuelerListe, faecherListe] = await Promise.all([
          window.api.schueler.getAll(klasse.id),
          window.api.faecher.getAll(klasse.id),
        ])
        // Automatisch neuen Klassennamen generieren (Zahl inkrementieren)
        const neuerName = klasse.name.replace(/(\d+)/, m => String(parseInt(m) + 1))
        daten.push({
          klasse,
          vorruecken: true,
          neuerName,
          faecher: faecherListe.map(f => ({ fach: f, vorruecken: true })),
          schueler: schuelerListe.map(s => ({ schueler: s, aktion: 'bleibt' })),
        })
      }
      setKlassenDaten(daten)
    }
    laden()
  }, [klassen])

  const patchKlasse = (kid, patch) =>
    setKlassenDaten(prev => prev.map(k => k.klasse.id === kid ? { ...k, ...patch } : k))

  const toggleFach = (kid, fid) =>
    setKlassenDaten(prev => prev.map(k => k.klasse.id === kid
      ? { ...k, faecher: k.faecher.map(f => f.fach.id === fid ? { ...f, vorruecken: !f.vorruecken } : f) }
      : k))

  const setAktion = (kid, sid, aktion) =>
    setKlassenDaten(prev => prev.map(k => k.klasse.id === kid
      ? { ...k, schueler: k.schueler.map(s => s.schueler.id === sid ? { ...s, aktion } : s) }
      : k))

  const handleDurchfuehren = async () => {
    if (!aktuellesSchuljahr || !neuesSchuljahr.trim()) return
    setLoading(true)
    try {
      const advancing = klassenDaten.filter(k => k.vorruecken)

      // Nur ausgewählte Klassen + deren angehakte Fächer werden vorgerückt
      const klassenPayload = advancing.map(k => ({
        alteKlasseId: k.klasse.id,
        neuerName: k.neuerName.trim() || k.klasse.name,
        fachIds: k.faecher.filter(f => f.vorruecken).map(f => f.fach.id),
      }))

      const zuordnungen = advancing.flatMap(k => k.schueler.map(s => ({
        schuelerId: s.schueler.id,
        alteKlasseId: k.klasse.id,
        aktion: s.aktion,
      })))

      const neueId = await window.api.jahresabschluss.neuesSchuljahr({
        altesSchuljahreId: aktuellesSchuljahr.id,
        neueBezeichnung: neuesSchuljahr.trim(),
        klassen: klassenPayload,
        schuelerZuordnungen: zuordnungen,
      })

      await ladeSchuljahrDaten(neueId)
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  const anzahlKlassen = klassenDaten.filter(k => k.vorruecken).length

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Neues Schuljahr beginnen</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        {/* Neues Schuljahr */}
        <div className="mb-4 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">Neues Schuljahr</label>
            <input
              className="input"
              value={neuesSchuljahr}
              onChange={e => setNeuesSchuljahr(e.target.value)}
              placeholder="z.B. 2025/26"
            />
          </div>
        </div>

        <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">
          Wähle, welche Klassen und Fächer vorgerückt werden. Nicht angehakte Klassen bzw. Fächer erscheinen im neuen Schuljahr nicht mehr.
        </p>

        {/* Klassen + Fächer + Schüler:innen */}
        <div className="max-h-96 overflow-y-auto space-y-3 mb-5">
          {klassenDaten.map(k => (
            <div key={k.klasse.id}
              className={`rounded-lg border p-3 transition-colors ${k.vorruecken
                ? 'border-paper-200 dark:border-ink-700'
                : 'border-paper-200 dark:border-ink-800 opacity-60 bg-paper-50 dark:bg-ink-900/40'}`}>

              {/* Klassen-Kopf mit Vorrücken-Checkbox */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patchKlasse(k.klasse.id, { vorruecken: !k.vorruecken })}
                  className={`w-5 h-5 rounded border flex items-center justify-center text-xs flex-shrink-0 transition-colors ${k.vorruecken
                    ? 'bg-coral-600 border-coral-600 text-white'
                    : 'border-paper-300 dark:border-ink-600 text-transparent'}`}
                  title={k.vorruecken ? 'Nicht vorrücken' : 'Vorrücken'}
                >✓</button>
                <span className="text-sm font-semibold text-ink-800 dark:text-paper-200">{k.klasse.name}</span>
                {k.vorruecken ? (
                  <>
                    <span className="text-ink-400">→</span>
                    <input
                      className="input py-1 text-sm w-24"
                      value={k.neuerName}
                      onChange={e => patchKlasse(k.klasse.id, { neuerName: e.target.value })}
                      placeholder="Neuer Name"
                    />
                  </>
                ) : (
                  <span className="text-xs text-ink-400 italic">wird nicht vorgerückt</span>
                )}
              </div>

              {k.vorruecken && (
                <>
                  {/* Fächer */}
                  {k.faecher.length > 0 && (
                    <div className="mt-2.5 pl-7">
                      <p className="text-[11px] font-medium text-ink-400 uppercase tracking-wide mb-1">Fächer</p>
                      <div className="flex flex-wrap gap-1.5">
                        {k.faecher.map(f => (
                          <button
                            key={f.fach.id}
                            type="button"
                            onClick={() => toggleFach(k.klasse.id, f.fach.id)}
                            className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1 transition-colors ${f.vorruecken
                              ? 'border-coral-400 bg-coral-50 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300 dark:border-coral-700'
                              : 'border-paper-200 dark:border-ink-700 text-ink-400 line-through'}`}
                          >
                            {f.vorruecken ? '✓' : '○'} {f.fach.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Schüler:innen */}
                  {k.schueler.length > 0 && (
                    <div className="mt-2.5 pl-7 space-y-0.5">
                      {k.schueler.map(s => (
                        <div key={s.schueler.id} className="flex items-center justify-between py-0.5">
                          <span className="text-sm text-ink-800 dark:text-paper-200">
                            {s.schueler.nachname} {s.schueler.vorname}
                          </span>
                          <select
                            className="text-xs border border-paper-200 dark:border-ink-700 rounded px-2 py-1 bg-white dark:bg-ink-800 focus:outline-none"
                            value={s.aktion}
                            onChange={e => setAktion(k.klasse.id, s.schueler.id, e.target.value)}
                          >
                            <option value="bleibt">bleibt (vorrücken)</option>
                            <option value="ausgeschieden">scheidet aus</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-5">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Alle Daten des aktuellen Schuljahrs werden archiviert und sind danach schreibgeschützt. Nicht vorgerückte Klassen und Fächer bleiben nur im Archiv erhalten.
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={closeModal}>Abbrechen</button>
          <button
            className="btn-primary flex-1"
            onClick={handleDurchfuehren}
            disabled={loading || !neuesSchuljahr.trim() || anzahlKlassen === 0}
          >
            {loading ? 'Vorrücken…' : `Schuljahr abschließen (${anzahlKlassen} Klasse${anzahlKlassen === 1 ? '' : 'n'})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Exportieren-Modal ────────────────────────────────────────────────────────
export function ExportierenModal() {
  const { closeModal } = useStore()
  const [laden, setLaden] = useState(false)

  const handleExcel = async () => {
    setLaden('excel')
    await window.api.export.allSchuelerExcel()
    setLaden(false)
  }

  const handlePdf = async () => {
    setLaden('pdf')
    await window.api.export.allSchuelerPdf()
    setLaden(false)
  }

  const handleJson = async () => {
    setLaden('json')
    await window.api.export.toJson()
    setLaden(false)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Daten exportieren</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        <div className="space-y-2 mb-5">
          <p className="text-xs text-ink-500 dark:text-ink-400 uppercase tracking-wide font-medium mb-3">Notenübersicht – alle Klassen & Fächer</p>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-paper-200 dark:border-ink-700 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors text-left"
            onClick={handlePdf}
            disabled={laden !== false}
          >
            <span className="text-lg">📄</span>
            <div>
              <div className="text-sm font-medium text-ink-800 dark:text-paper-200">
                {laden === 'pdf' ? 'Exportieren…' : 'Als PDF exportieren'}
              </div>
              <div className="text-xs text-ink-400">Übersichtstabellen pro Klasse und Fach (A4 quer)</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-paper-200 dark:border-ink-700 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors text-left"
            onClick={handleExcel}
            disabled={laden !== false}
          >
            <span className="text-lg">📊</span>
            <div>
              <div className="text-sm font-medium text-ink-800 dark:text-paper-200">
                {laden === 'excel' ? 'Exportieren…' : 'Als Excel exportieren'}
              </div>
              <div className="text-xs text-ink-400">Ein Tabellenblatt pro Klasse und Fach</div>
            </div>
          </button>
        </div>

        <div className="pt-3 border-t border-paper-100 dark:border-ink-800 space-y-2">
          <p className="text-xs text-ink-500 dark:text-ink-400 uppercase tracking-wide font-medium mb-3">Vollständiges Backup</p>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-paper-200 dark:border-ink-700 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors text-left"
            onClick={handleJson}
            disabled={laden !== false}
          >
            <span className="text-lg">💾</span>
            <div>
              <div className="text-sm font-medium text-ink-800 dark:text-paper-200">
                {laden === 'json' ? 'Exportieren…' : 'Als JSON exportieren'}
              </div>
              <div className="text-xs text-ink-400">Alle Daten für Import/Backup</div>
            </div>
          </button>
        </div>

        <div className="mt-5">
          <button className="btn-secondary w-full" onClick={closeModal}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ─── Ferien-Modal ────────────────────────────────────────────────────────────
export function FerienModal() {
  const { closeModal, aktuellesSchuljahr, einstellungen } = useStore()
  const [ferien, setFerien] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!aktuellesSchuljahr) return
    ;(async () => {
      const custom = await window.api.customFerien.getAll(aktuellesSchuljahr.id)
      if (custom.length > 0) {
        // Benutzerdefinierte Ferien vorhanden → diese anzeigen
        setFerien(custom.map(f => ({ name: f.name, von: f.von, bis: f.bis })))
      } else {
        // Keine benutzerdefinierten → berechnete als Vorlage laden
        const schuljahr = aktuellesSchuljahr?.bezeichnung ?? ''
        const bundesland = einstellungen?.bundesland ?? ''
        const berechnet = berechneSchulferien(schuljahr, bundesland)
        if (berechnet) {
          const alle = [
            ...berechnet.ferien.map(f => ({ name: f.name, von: f.von, bis: f.bis })),
            ...berechnet.feiertage.map(ft => ({ name: ft.name, von: ft.datum, bis: ft.datum })),
          ].sort((a, b) => a.von.localeCompare(b.von))
          setFerien(alle)
        }
      }
      setLoading(false)
    })()
  }, [aktuellesSchuljahr])

  const handleChange = (idx, field, value) => {
    setFerien(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f))
  }

  const handleRemove = (idx) => {
    setFerien(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAdd = () => {
    setFerien(prev => [...prev, { name: '', von: '', bis: '' }])
  }

  const handleReset = () => {
    if (!confirm('Ferien auf die automatisch berechneten Werte zurücksetzen?')) return
    const schuljahr = aktuellesSchuljahr?.bezeichnung ?? ''
    const bundesland = einstellungen?.bundesland ?? ''
    const berechnet = berechneSchulferien(schuljahr, bundesland)
    if (berechnet) {
      const alle = [
        ...berechnet.ferien.map(f => ({ name: f.name, von: f.von, bis: f.bis })),
        ...berechnet.feiertage.map(ft => ({ name: ft.name, von: ft.datum, bis: ft.datum })),
      ].sort((a, b) => a.von.localeCompare(b.von))
      setFerien(alle)
    }
  }

  const handleSpeichern = async () => {
    if (!aktuellesSchuljahr) return
    setSaving(true)
    const gueltig = ferien.filter(f => f.name && f.von && f.bis)
    await window.api.customFerien.save(aktuellesSchuljahr.id, gueltig)
    setSaving(false)
    closeModal()
  }

  const formatDatum = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Ferien & Feiertage</h2>
            <p className="text-xs text-ink-400 mt-0.5">Schuljahr {aktuellesSchuljahr?.bezeichnung}</p>
          </div>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        <p className="text-xs text-ink-500 dark:text-ink-400 mb-4">
          Die berechneten Ferien werden als Vorlage geladen. Einträge können bearbeitet, gelöscht oder ergänzt werden.
          Einzelne Feiertage haben gleiches Von- und Bis-Datum.
        </p>

        {loading ? (
          <p className="text-sm text-ink-400 py-8 text-center">Laden…</p>
        ) : (
          <>
            <div className="space-y-1.5 mb-4">
              {/* Header */}
              <div className="grid gap-2 text-xs font-medium text-ink-500 dark:text-ink-400 px-1" style={{ gridTemplateColumns: '1fr 7.5rem 7.5rem 2rem' }}>
                <span>Bezeichnung</span>
                <span>Von</span>
                <span>Bis</span>
                <span />
              </div>

              {ferien.map((f, idx) => (
                <div key={idx} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 7.5rem 7.5rem 2rem' }}>
                  <input
                    className="input text-sm py-1"
                    value={f.name}
                    onChange={e => handleChange(idx, 'name', e.target.value)}
                    placeholder="Name"
                  />
                  <input
                    type="date"
                    className="input text-sm py-1"
                    value={f.von}
                    onChange={e => handleChange(idx, 'von', e.target.value)}
                  />
                  <input
                    type="date"
                    className="input text-sm py-1"
                    value={f.bis}
                    onChange={e => handleChange(idx, 'bis', e.target.value)}
                  />
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded text-ink-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    onClick={() => handleRemove(idx)}
                    title="Entfernen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-5">
              <button className="text-xs text-coral-600 dark:text-coral-400 hover:underline" onClick={handleAdd}>
                + Eintrag hinzufügen
              </button>
              <span className="text-ink-600 dark:text-paper-300 dark:text-ink-600">|</span>
              <button className="text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-900 dark:hover:text-paper-300 hover:underline" onClick={handleReset}>
                Auf berechnete Ferien zurücksetzen
              </button>
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={closeModal}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={saving || loading}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Archiv-Modal ─────────────────────────────────────────────────────────────
export function ArchivModal() {
  const { closeModal, schuljahre } = useStore()
  const archivierteSj = schuljahre.filter(s => s.archiviert)

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal-box">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Archiv</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        {archivierteSj.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Noch keine archivierten Schuljahre</p>
        ) : (
          <div className="space-y-2">
            {archivierteSj.map(sj => (
              <div key={sj.id} className="flex items-center justify-between px-3 py-2 bg-paper-50 dark:bg-ink-800 rounded-lg">
                <span className="text-sm font-medium text-ink-700 dark:text-paper-300">{sj.bezeichnung}</span>
                <span className="text-xs text-ink-400 bg-paper-200 dark:bg-ink-700 px-2 py-0.5 rounded">Archiviert</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <button className="btn-secondary w-full" onClick={closeModal}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

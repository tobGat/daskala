// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef, useCallback, useMemo, memo } from 'react'
import useStore from '../store/useStore'
import Zelle from './Zelle'
import ZeugnisnoteZelle from './ZeugnisnoteZelle'
import SchuelerAvatar from './SchuelerAvatar'

// ─── Konstanten ───────────────────────────────────────────────────────────────
const KAT_FARBE = {
  MA:     'bg-mint-100 text-mint-700 dark:bg-mint-900/40 dark:text-mint-300',
  'HÜ':   'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  T:      'bg-lavender-100 text-lavender-700 dark:bg-lavender-900/40 dark:text-lavender-300',
  SA:     'bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300',
  CUSTOM: 'bg-paper-200 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
}

const KAT_DOT = {
  MA:     'bg-mint-500',
  'HÜ':   'bg-sky-500',
  T:      'bg-lavender-500',
  SA:     'bg-coral-500',
  CUSTOM: 'bg-ink-400',
}

const KATEGORIEN_LABEL = { MA: 'Mitarbeit', 'HÜ': 'Hausübung', T: 'Test', SA: 'Schularbeit', CUSTOM: 'Individuell' }

// ─── Spalten-Header ───────────────────────────────────────────────────────────
const SpalteHeader = memo(function SpalteHeader({ spalte, onContextMenu }) {
  const { toggleSpalteEingeklappt } = useStore()

  const datumAnzeige = spalte.datum
    ? new Date(spalte.datum).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
    : ''

  if (spalte.eingeklappt) {
    return (
      <th
        className="p-0 cursor-pointer hover:bg-paper-200 dark:hover:bg-ink-800 bg-paper-50 dark:bg-ink-900"
        style={{ width: 22, minWidth: 22 }}
        onClick={() => toggleSpalteEingeklappt(spalte.id)}
        onContextMenu={e => onContextMenu(e, spalte)}
        title={`${spalte.kuerzel} ${datumAnzeige} – Klick zum Ausklappen`}
      >
        <div className="h-14 flex items-center justify-center">
          <span className="text-ink-400 text-[10px] font-bold" style={{ writingMode: 'vertical-rl' }}>
            {spalte.kuerzel}
          </span>
        </div>
      </th>
    )
  }

  return (
    <th
      className="p-0 text-center cursor-pointer select-none group relative bg-white dark:bg-ink-900 transition-all"
      style={{ width: 38, minWidth: 38 }}
      onContextMenu={e => onContextMenu(e, spalte)}
      title={spalte.notiz ?? 'Rechtsklick für Optionen'}
    >
      <div className="h-14 flex flex-col items-center justify-center px-1 gap-1">
        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none tracking-tight transition-all group-hover:scale-110 ${KAT_FARBE[spalte.kategorie] ?? KAT_FARBE.CUSTOM}`}>
          {spalte.kuerzel}
        </span>
        {datumAnzeige && (
          <span className="text-[9px] font-medium text-ink-400 dark:text-ink-500 leading-none">{datumAnzeige}</span>
        )}
      </div>
      {spalte.notiz && (
        <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${KAT_DOT[spalte.kategorie] ?? KAT_DOT.CUSTOM}`} />
      )}
    </th>
  )
})

const EingeklappteZelle = memo(function EingeklappteZelle() {
  return <td style={{ width: 22, minWidth: 22 }} className="bg-paper-50/70 dark:bg-ink-900/50" />
})

// ─── SN/ZN-Headers ────────────────────────────────────────────────────────────
// SN = Semesternote (je Semester), ZN = Zeugnisnote (Jahresnote).
// Layout passt zur Zellen-Breite (46px). Klare visuelle Hierarchie ohne Quetschung.
function ZNHeader({ semester }) {
  return (
    <th
      className="bg-paper-100 dark:bg-ink-800/60 text-center border-l-2 border-paper-300 dark:border-ink-700"
      style={{ width: 46, minWidth: 46 }}
      title={`Semesternote ${semester}`}
    >
      <div className="h-14 flex flex-col items-center justify-center gap-0.5">
        <span className="font-bold text-[11px] text-ink-600 dark:text-ink-300 tracking-wider leading-none">SN</span>
        <span className="font-bold text-base text-ink-700 dark:text-paper-200 leading-none">{semester}</span>
      </div>
    </th>
  )
}

function ENHeader() {
  return (
    <th
      className="bg-gradient-to-b from-coral-100 to-coral-50 dark:from-coral-900/50 dark:to-coral-900/20 text-center border-l-2 border-coral-300 dark:border-coral-700/60"
      style={{
        width: 46,
        minWidth: 46,
        // sticky-top setzt schon die CSS-Regel; right:0 macht zusätzlich sticky-right
        right: 0,
        zIndex: 10,
        boxShadow: '-3px 0 8px -2px rgba(46, 42, 38, 0.08), 0 1px 0 0 rgb(230 227 223)',
      }}
      title="Zeugnisnote"
    >
      <div className="h-14 flex flex-col items-center justify-center gap-0.5">
        <span aria-hidden className="text-sm leading-none">⭐</span>
        <span className="font-bold text-[11px] text-coral-700 dark:text-coral-200 tracking-wider leading-none">ZN</span>
      </div>
    </th>
  )
}

// ─── Ghost-Spalte (+ Hinzufügen) ──────────────────────────────────────────────
function GhostSpalteHeader({ onClick }) {
  return (
    <th
      className="p-0 cursor-pointer group bg-white dark:bg-ink-900"
      style={{ width: 38, minWidth: 38 }}
      onClick={onClick}
      title="Neue Spalte hinzufügen"
    >
      <div className="h-14 flex items-center justify-center border-l-2 border-dashed border-paper-300 dark:border-ink-700 group-hover:border-coral-400 dark:group-hover:border-coral-500 transition-colors">
        <span className="w-6 h-6 rounded-full border-2 border-dashed border-paper-300 dark:border-ink-600 group-hover:border-coral-400 dark:group-hover:border-coral-500 flex items-center justify-center text-paper-400 dark:text-ink-600 group-hover:text-coral-500 group-hover:rotate-90 transition-all duration-200">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </span>
      </div>
    </th>
  )
}

function GhostZelle({ onClick }) {
  return (
    <td
      style={{ width: 38, minWidth: 38 }}
      className="p-0 cursor-pointer group/ghost"
      onClick={onClick}
    >
      <div className="w-full h-9 border-l-2 border-dashed border-paper-100 dark:border-ink-800/60 group-hover/ghost:border-coral-200 dark:group-hover/ghost:border-coral-800 group-hover/ghost:bg-coral-50/40 dark:group-hover/ghost:bg-coral-900/20 transition-colors" />
    </td>
  )
}

// ─── Spacer (füllt den restlichen horizontalen Platz, schrumpft auf 0 bei vielen Spalten) ──
function SpacerHeader() {
  return <th aria-hidden className="bg-white dark:bg-ink-900 p-0" />
}

function SpacerZelle() {
  return <td aria-hidden className="p-0" />
}

// ─── Schüler-Avatar + Namens-Zelle ────────────────────────────────────────────
function SchuelerNameZelle({ schueler, isDifferenziert, niveau, onClick, onNiveauKlick }) {
  return (
    <td
      className="sticky left-0 z-10 bg-white dark:bg-ink-950 px-2 py-0 cursor-pointer hover:bg-coral-50/60 dark:hover:bg-coral-900/30 border-r border-paper-100 dark:border-ink-800/60 transition-colors relative"
      style={{ minWidth: 184, width: 184, height: 36 }}
      onClick={onClick}
      title={`${schueler.vorname} ${schueler.nachname} — Detailansicht öffnen`}
    >
      <div className="flex items-center gap-2 h-full">
        {/* Avatar */}
        <SchuelerAvatar schueler={schueler} size={28} className="shadow-softer" />

        {/* Name */}
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-[13px] font-semibold text-ink-800 dark:text-paper-100 truncate">
            {schueler.nachname}
          </div>
          <div className="text-[11px] text-ink-500 dark:text-ink-500 truncate -mt-0.5">
            {schueler.vorname}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {schueler.lernschwaeche ? (
            <span title="Lernschwäche" className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">LS</span>
          ) : null}
          {schueler.legasthenie ? (
            <span title="Legasthenie" className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">LEG</span>
          ) : null}
          {schueler.spf ? (
            <span title="Sonderpädagogischer Förderbedarf" className="text-[8px] font-bold px-1 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">SPF</span>
          ) : null}
          {isDifferenziert && (
            <span
              title="Klick: Niveau-Wechsel mit Datum"
              className={`text-[8px] font-bold px-1 py-0.5 rounded cursor-pointer select-none transition-colors ${
                niveau === 'AHS'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/60'
              }`}
              onClick={onNiveauKlick}
            >
              {niveau}
            </span>
          )}
        </div>

        {/* Hover-Indikator */}
        <svg
          className="w-3 h-3 text-coral-400 opacity-0 group-hover/row:opacity-100 flex-shrink-0 -ml-1 transition-opacity"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </td>
  )
}

// ─── Toolbar mit Stats ────────────────────────────────────────────────────────
function StatChip({ label, value, accent, emoji }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${accent}`}>
      <span className="text-sm leading-none">{emoji}</span>
      <span className="text-sm font-bold tabular-nums leading-none">{value}</span>
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </div>
  )
}

function NotenToolbar({ aktivesFach, schueler, spalten, eintraege, zeugnisnoten, aktiveSemester, semester1Eingeklappt, setSemester1Eingeklappt, openSpalteModal }) {
  const aktiveKlasse = useStore(s => s.aktiveKlasse)
  const setSchuelerSortierung = useStore(s => s.setSchuelerSortierung)
  const openModal = useStore(s => s.openModal)
  const sortierung = aktiveKlasse?.sortierung || 'nachname'

  // Anzahl Spalten im aktiven Semester
  const spaltenSemester = useMemo(
    () => spalten.filter(s => s.semester === aktiveSemester && !s.eingeklappt).length,
    [spalten, aktiveSemester]
  )

  // Anzahl eingetragene Noten (in den nicht-eingeklappten Spalten des aktiven Semesters)
  const eintragsAnzahl = useMemo(() => {
    const ids = new Set(spalten.filter(s => s.semester === aktiveSemester && !s.eingeklappt).map(s => s.id))
    return Object.entries(eintraege).filter(([key, val]) => {
      const spalteId = parseInt(key.split('_')[0])
      return ids.has(spalteId) && val
    }).length
  }, [spalten, eintraege, aktiveSemester])

  // Klassen-ZN-Durchschnitt für das aktive Semester
  const klassenDurchschnitt = useMemo(() => {
    const noten = schueler
      .map(s => {
        const zn = zeugnisnoten[`${s.id}_${aktiveSemester}`]
        return zn?.note_manuell ?? zn?.note_berechnet ?? null
      })
      .filter(n => n != null)
    if (noten.length === 0) return null
    return (noten.reduce((a, b) => a + b, 0) / noten.length)
  }, [schueler, zeugnisnoten, aktiveSemester])

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-paper-200 dark:border-ink-800/60 flex-shrink-0 flex-wrap">

      {/* Fach-Identifikator */}
      <div className="flex items-center gap-2.5">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-soft flex-shrink-0"
          style={{ backgroundColor: aktivesFach?.farbe || '#fb6936' }}
        >
          {(aktivesFach?.name?.[0] ?? '?').toUpperCase()}
        </span>
        <div className="leading-tight">
          <div className="text-base font-bold text-ink-800 dark:text-paper-100 font-display">
            {aktivesFach?.name ?? '—'}
          </div>
          <div className="text-[11px] text-ink-500 dark:text-ink-400">
            {schueler.length} Schüler:in{schueler.length === 1 ? '' : 'nen'}
            {aktivesFach?.benotungssystem === 'differenziert' && ' · AHS/ST'}
          </div>
        </div>
      </div>

      <div className="w-px h-8 bg-paper-200 dark:bg-ink-800 flex-shrink-0" />

      {/* Semester-Toggle */}
      <div className="flex items-center gap-0.5 bg-paper-100 dark:bg-ink-800 rounded-xl p-0.5 flex-shrink-0">
        <button
          className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all whitespace-nowrap
            ${aktiveSemester === 1
              ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
              : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-paper-200'}`}
          onClick={() => useStore.setState({ aktiveSemester: 1 })}
        >
          Semester 1
        </button>
        <button
          className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all whitespace-nowrap
            ${aktiveSemester === 2
              ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
              : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-paper-200'}`}
          onClick={() => useStore.setState({ aktiveSemester: 2 })}
        >
          Semester 2
        </button>
      </div>

      {aktiveSemester === 2 && (
        <button
          className="px-2.5 py-1 text-[11px] font-medium rounded-xl border border-paper-300 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800 transition-all flex-shrink-0"
          onClick={() => setSemester1Eingeklappt(!semester1Eingeklappt)}
        >
          S1 {semester1Eingeklappt ? '▸' : '◂'}
        </button>
      )}

      <div className="w-px h-8 bg-paper-200 dark:bg-ink-800 flex-shrink-0" />

      {/* Sortierung der Schüler:innen-Liste */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[11px] text-ink-400 dark:text-ink-500 hidden md:inline">Sortierung</span>
        <div className="flex items-center gap-0.5 bg-paper-100 dark:bg-ink-800 rounded-xl p-0.5">
          {[['vorname', 'Vorname'], ['nachname', 'Nachname'], ['manuell', 'Manuell']].map(([wert, label]) => (
            <button
              key={wert}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all whitespace-nowrap
                ${sortierung === wert
                  ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
                  : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-paper-200'}`}
              onClick={() => setSchuelerSortierung(wert)}
            >
              {label}
            </button>
          ))}
        </div>
        {sortierung === 'manuell' && (
          <button
            className="px-2 py-1 text-[11px] font-medium rounded-xl border border-paper-300 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-800 transition-all whitespace-nowrap"
            onClick={() => openModal('schuelerVerwalten', { reorder: true })}
            title="Reihenfolge der Schüler:innen per Ziehen bearbeiten"
          >
            ↕ Reihenfolge
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
        <StatChip
          label="Spalten"
          value={spaltenSemester}
          emoji="📋"
          accent="bg-mint-50 text-mint-700 dark:bg-mint-900/30 dark:text-mint-300"
        />
        <StatChip
          label="Noten"
          value={eintragsAnzahl}
          emoji="✍️"
          accent="bg-lavender-50 text-lavender-700 dark:bg-lavender-900/30 dark:text-lavender-300"
        />
        {klassenDurchschnitt != null && (
          <StatChip
            label="Ø Klasse"
            value={klassenDurchschnitt.toFixed(2)}
            emoji="⭐"
            accent="bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
          />
        )}

        {/* Spalte hinzufügen Button */}
        <button
          className="ml-1 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-coral-500 text-white hover:bg-coral-600 active:scale-[0.98] transition-all shadow-soft"
          onClick={openSpalteModal}
          title="Neue Spalte hinzufügen"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Spalte
        </button>
      </div>
    </div>
  )
}

// ─── Haupt-Tabelle ────────────────────────────────────────────────────────────
export default function NotenTabelle() {
  const {
    schueler, spalten, aktivesFach, eintraege, zeugnisnoten,
    aktiveSemester, semester1Eingeklappt, setSemester1Eingeklappt,
    setDetailSchueler, openModal,
    ladeSpalten, refreshZeugnisnoten,
    niveaus, niveauHistorie, setNiveau, deleteNiveauHistorie,
    fachSchuelerIds,
  } = useStore()

  // Nur die dem aktiven Fach zugeordneten Schüler:innen (Gruppen-Roster)
  const sichtbareSchueler = useMemo(
    () => schueler.filter(s => fachSchuelerIds.has(s.id)),
    [schueler, fachSchuelerIds]
  )

  const [spaltenContextMenu, setSpaltenContextMenu] = useState(null)
  const [spalteBearbeitenModal, setSpalteBearbeitenModal] = useState(null)
  const [niveauPopup, setNiveauPopup] = useState(null)
  const tableRef = useRef(null)

  const spaltenS1 = spalten.filter(s => s.semester === 1)
  const spaltenS2 = spalten.filter(s => s.semester === 2)
  const spaltenZeigen = [...spaltenS1, ...(aktiveSemester === 2 ? spaltenS2 : [])]

  const handleSpalteContextMenu = useCallback((e, spalte) => {
    e.preventDefault()
    setSpaltenContextMenu({ x: e.clientX, y: e.clientY, spalte })
  }, [])

  const handleSpalteBearbeiten = (spalte) => {
    setSpaltenContextMenu(null)
    setSpalteBearbeitenModal(spalte)
  }

  const handleSpalteBearbeitenSpeichern = async ({ kuerzel, datum, notiz }) => {
    await window.api.spalten.update(spalteBearbeitenModal.id, { kuerzel, datum, notiz })
    await ladeSpalten()
    setSpalteBearbeitenModal(null)
  }

  const handleSpalteLoeschen = async (spalteId) => {
    if (!confirm('Spalte und alle Einträge löschen?')) return
    await window.api.spalten.delete(spalteId)
    await ladeSpalten()
    await refreshZeugnisnoten()
    setSpaltenContextMenu(null)
  }

  const handleKategorieEinklappen = async (kategorie, einklappen) => {
    const ids = spaltenZeigen.filter(s => s.kategorie === kategorie).map(s => s.id)
    await window.api.spalten.setEingeklappt(ids, einklappen)
    await ladeSpalten()
    setSpaltenContextMenu(null)
  }

  const handleSortieren = async (semester) => {
    if (!aktivesFach) return
    await window.api.spalten.sortByKategorie(aktivesFach.id, semester)
    await ladeSpalten()
    setSpaltenContextMenu(null)
  }

  const openSpalteModal = useCallback(() => openModal('spalteHinzufuegen'), [openModal])

  // ── Empty State: Kein Fach ──
  if (!aktivesFach) {
    return (
      <div className="flex-1 flex items-center justify-center bg-paper-50 dark:bg-ink-950">
        <div className="text-center animate-fade-up">
          <div className="text-5xl mb-3">📚</div>
          <p className="text-base mb-1 text-ink-700 dark:text-paper-200 font-semibold">Kein Fach ausgewählt</p>
          <p className="text-sm text-ink-500">Wähle oben ein Fach oder lege ein neues an.</p>
        </div>
      </div>
    )
  }

  // ── Empty State: Keine Schüler ──
  if (schueler.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-paper-50 dark:bg-ink-950">
        <div className="text-center animate-fade-up">
          <div className="text-5xl mb-3">🙋</div>
          <p className="text-base mb-1 text-ink-700 dark:text-paper-200 font-semibold">Noch keine Schüler:innen</p>
          <p className="text-sm text-ink-500 mb-5">Beginne mit dem Anlegen oder Import deiner Klasse.</p>
          <button className="btn-primary" onClick={() => openModal('schuelerVerwalten')}>
            Schüler:innen hinzufügen
          </button>
        </div>
      </div>
    )
  }

  // Klasse hat Schüler:innen, aber diesem (Gruppen-)Fach sind keine zugeordnet
  if (sichtbareSchueler.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-paper-50 dark:bg-ink-950">
        <div className="text-center animate-fade-up max-w-sm px-4">
          <div className="text-5xl mb-3">👥</div>
          <p className="text-base mb-1 text-ink-700 dark:text-paper-200 font-semibold">Keine Schüler:innen in diesem Fach</p>
          <p className="text-sm text-ink-500">Über das Fach-Menü (Rechtsklick auf den Fach-Tab) → „Schüler:innen zuordnen…" kannst du welche hinzufügen.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-paper-50 dark:bg-ink-950 p-3">
      <div className="flex-1 flex flex-col overflow-hidden daskala-card">

        <NotenToolbar
          aktivesFach={aktivesFach}
          schueler={sichtbareSchueler}
          spalten={spalten}
          eintraege={eintraege}
          zeugnisnoten={zeugnisnoten}
          aktiveSemester={aktiveSemester}
          semester1Eingeklappt={semester1Eingeklappt}
          setSemester1Eingeklappt={setSemester1Eingeklappt}
          openSpalteModal={openSpalteModal}
        />

        {/* Tabelle */}
        <div className="noten-tabelle-container" ref={tableRef}>
          <table className="noten-tabelle">
            <thead>
              <tr>
                <th className="name-header bg-white dark:bg-ink-950 text-left px-3 py-2 text-[10px] font-bold text-ink-400 dark:text-ink-500 uppercase tracking-wider"
                  style={{ minWidth: 184, width: 184 }}>
                  Name
                </th>

                {/* Semester 1 Spalten */}
                {semester1Eingeklappt && aktiveSemester === 2 ? (
                  <th
                    className="bg-paper-100 dark:bg-ink-800/60 cursor-pointer hover:bg-paper-200 dark:hover:bg-ink-700"
                    style={{ width: 22, minWidth: 22 }}
                    onClick={() => setSemester1Eingeklappt(false)}
                    title="S1 anzeigen"
                  >
                    <div className="h-14 flex items-center justify-center">
                      <span className="text-ink-400 text-xs font-bold" style={{ writingMode: 'vertical-rl' }}>S1</span>
                    </div>
                  </th>
                ) : (
                  spaltenS1.map(sp => (
                    <SpalteHeader key={sp.id} spalte={sp} onContextMenu={handleSpalteContextMenu} />
                  ))
                )}

                <ZNHeader semester={1} />

                {aktiveSemester === 2 && spaltenS2.map(sp => (
                  <SpalteHeader key={sp.id} spalte={sp} onContextMenu={handleSpalteContextMenu} />
                ))}

                {aktiveSemester === 2 && <ZNHeader semester={2} />}

                <GhostSpalteHeader onClick={openSpalteModal} />
                <SpacerHeader />
                {aktiveSemester === 2 && <ENHeader />}
              </tr>
            </thead>

            <tbody>
              {sichtbareSchueler.map(s => (
                <tr key={s.id} className="group/row border-b border-paper-100 dark:border-ink-800/50">
                  <SchuelerNameZelle
                    schueler={s}
                    isDifferenziert={aktivesFach?.benotungssystem === 'differenziert'}
                    niveau={niveaus[s.id] ?? 'AHS'}
                    onClick={() => setDetailSchueler(s)}
                    onNiveauKlick={e => {
                      e.stopPropagation()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setNiveauPopup({ schuelerId: s.id, anchorRect: rect })
                    }}
                  />

                  {/* S1 Zellen */}
                  {semester1Eingeklappt && aktiveSemester === 2 ? (
                    <td style={{ width: 22, minWidth: 22 }} className="bg-paper-100/60 dark:bg-ink-800/60" />
                  ) : (
                    spaltenS1.map(sp =>
                      sp.eingeklappt
                        ? <EingeklappteZelle key={sp.id} />
                        : <Zelle key={sp.id} spalte={sp} schueler={s} />
                    )
                  )}

                  <ZeugnisnoteZelle schueler={s} semester={1} />

                  {aktiveSemester === 2 && spaltenS2.map(sp =>
                    sp.eingeklappt
                      ? <EingeklappteZelle key={sp.id} />
                      : <Zelle key={sp.id} spalte={sp} schueler={s} />
                  )}

                  {aktiveSemester === 2 && <ZeugnisnoteZelle schueler={s} semester={2} />}

                  <GhostZelle onClick={openSpalteModal} />
                  <SpacerZelle />
                  {aktiveSemester === 2 && <ZeugnisnoteZelle schueler={s} semester={3} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Spalte-Bearbeiten-Modal */}
      {spalteBearbeitenModal && (
        <SpalteBearbeitenModal
          spalte={spalteBearbeitenModal}
          onSpeichern={handleSpalteBearbeitenSpeichern}
          onClose={() => setSpalteBearbeitenModal(null)}
        />
      )}

      {/* Spalten-Kontext-Menü */}
      {spaltenContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSpaltenContextMenu(null)} />
          <div className="context-menu" style={{ left: spaltenContextMenu.x, top: spaltenContextMenu.y, position: 'fixed' }}>
            <div className="context-menu-item" onClick={() => {
              const sp = spaltenContextMenu.spalte
              window.api.spalten.toggleEingeklappt(sp.id).then(() => {
                ladeSpalten()
                setSpaltenContextMenu(null)
              })
            }}>
              {spaltenContextMenu.spalte.eingeklappt ? 'Ausklappen' : 'Einklappen'}
            </div>
            <div className="context-menu-item" onClick={() => handleKategorieEinklappen(spaltenContextMenu.spalte.kategorie, true)}>
              Alle {spaltenContextMenu.spalte.kategorie}-Spalten einklappen
            </div>
            <div className="context-menu-item" onClick={() => handleKategorieEinklappen(spaltenContextMenu.spalte.kategorie, false)}>
              Alle {spaltenContextMenu.spalte.kategorie}-Spalten ausklappen
            </div>
            <div className="context-menu-separator" />
            <div className="context-menu-item" onClick={() => handleSortieren(spaltenContextMenu.spalte.semester)}>
              Nach Kategorie sortieren (S{spaltenContextMenu.spalte.semester})
            </div>
            <div className="context-menu-separator" />
            <div className="context-menu-item" onClick={() => handleSpalteBearbeiten(spaltenContextMenu.spalte)}>
              ✎ Spalte bearbeiten
            </div>
            <div className="context-menu-separator" />
            <div className="context-menu-item text-red-500" onClick={() => handleSpalteLoeschen(spaltenContextMenu.spalte.id)}>
              Spalte löschen
            </div>
          </div>
        </>
      )}

      {/* Niveau-Wechsel-Popup */}
      {niveauPopup && (
        <NiveauWechselPopup
          schuelerId={niveauPopup.schuelerId}
          schuelerName={(() => {
            const s = schueler.find(x => x.id === niveauPopup.schuelerId)
            return s ? `${s.vorname} ${s.nachname}` : ''
          })()}
          aktuellesNiveau={niveaus[niveauPopup.schuelerId] ?? 'AHS'}
          historie={niveauHistorie?.[niveauPopup.schuelerId] ?? []}
          anchorRect={niveauPopup.anchorRect}
          onWechsel={async (zielNiveau, datum) => {
            await setNiveau(niveauPopup.schuelerId, zielNiveau, datum)
          }}
          onDeleteEintrag={async (gueltigAb) => {
            await deleteNiveauHistorie(niveauPopup.schuelerId, gueltigAb)
          }}
          onClose={() => setNiveauPopup(null)}
        />
      )}
    </div>
  )
}

// ─── Niveau-Wechsel-Popup ────────────────────────────────────────────────────
function NiveauWechselPopup({ schuelerId, schuelerName, aktuellesNiveau, historie, anchorRect, onWechsel, onDeleteEintrag, onClose }) {
  const heute = new Date().toISOString().slice(0, 10)
  const zielNiveau = aktuellesNiveau === 'AHS' ? 'ST' : 'AHS'
  const [datum, setDatum] = useState(heute)
  const [saving, setSaving] = useState(false)

  const handleWechsel = async () => {
    setSaving(true)
    try {
      await onWechsel(zielNiveau, datum)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const popupW = 280
  let left = anchorRect ? anchorRect.left : 100
  let top = anchorRect ? anchorRect.bottom + 6 : 100
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - 8 - popupW

  const echteHistorie = (historie ?? []).filter(h => h.gueltig_ab !== '1900-01-01')

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white dark:bg-ink-800 rounded-2xl border border-paper-200 dark:border-ink-700 shadow-pop p-4 animate-pop-in"
        style={{ left, top, width: popupW }}
      >
        <p className="text-xs text-ink-500 dark:text-ink-400 mb-0.5">Niveau-Wechsel</p>
        <p className="text-sm font-bold text-ink-800 dark:text-paper-100 mb-3 truncate">{schuelerName}</p>

        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className={`px-2 py-1 rounded-lg font-bold ${
            aktuellesNiveau === 'AHS'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
          }`}>{aktuellesNiveau}</span>
          <span className="text-ink-400">→</span>
          <span className={`px-2 py-1 rounded-lg font-bold ${
            zielNiveau === 'AHS'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
          }`}>{zielNiveau}</span>
        </div>

        <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">Wechsel gilt ab</label>
        <input
          type="date"
          className="input mb-3"
          value={datum}
          onChange={e => setDatum(e.target.value)}
          autoFocus
        />
        <p className="text-[10px] text-ink-400 mb-3 leading-relaxed">
          Einträge ab diesem Datum werden als {zielNiveau} interpretiert, alle früheren bleiben {aktuellesNiveau}.
        </p>

        <div className="flex gap-2 mb-3">
          <button className="btn-secondary flex-1 text-sm" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1 text-sm" disabled={saving} onClick={handleWechsel}>
            {saving ? 'Speichern…' : 'Wechseln'}
          </button>
        </div>

        {echteHistorie.length > 0 && (
          <div className="border-t border-paper-200 dark:border-ink-700 pt-2.5">
            <p className="text-[10px] font-semibold text-ink-500 dark:text-ink-400 mb-1.5 uppercase tracking-wider">Verlauf</p>
            <ul className="space-y-0.5 max-h-32 overflow-y-auto">
              {echteHistorie.map(h => (
                <li key={h.gueltig_ab} className="flex items-center justify-between text-xs gap-2 group">
                  <span className="text-ink-600 dark:text-paper-300 flex-1 truncate">
                    <span className={`inline-block px-1.5 py-0.5 rounded mr-1.5 text-[10px] font-bold ${
                      h.niveau === 'AHS'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
                    }`}>{h.niveau}</span>
                    ab {h.gueltig_ab}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-500 transition-opacity"
                    title="Diesen Wechsel entfernen"
                    onClick={() => onDeleteEintrag?.(h.gueltig_ab)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

function SpalteBearbeitenModal({ spalte, onSpeichern, onClose }) {
  const [kuerzel, setKuerzel] = useState(spalte.kuerzel)
  const [datum, setDatum] = useState(spalte.datum ?? '')
  const [notiz, setNotiz] = useState(spalte.notiz ?? '')
  const [loading, setLoading] = useState(false)

  const speichern = async () => {
    if (!kuerzel.trim()) return
    setLoading(true)
    try {
      await onSpeichern({ kuerzel: kuerzel.trim(), datum: datum || null, notiz: notiz.trim() || null })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <h2 className="text-base font-bold text-ink-900 dark:text-white mb-1">Spalte bearbeiten</h2>
        <p className="text-xs text-ink-400 mb-4">{KATEGORIEN_LABEL[spalte.kategorie] ?? spalte.kategorie}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">Kürzel</label>
            <input
              className="input"
              value={kuerzel}
              onChange={e => setKuerzel(e.target.value)}
              maxLength={10}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && speichern()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">Datum</label>
            <input
              type="date"
              className="input"
              value={datum}
              onChange={e => setDatum(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-1">
              Notiz <span className="font-normal text-ink-400">(Tooltip am Spaltenkopf)</span>
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              placeholder="z.B. Thema, Hinweise…"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button
            className="btn-primary flex-1"
            onClick={speichern}
            disabled={loading || !kuerzel.trim()}
          >
            {loading ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

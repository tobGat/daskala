import React, { useState, useRef, useCallback, memo } from 'react'
import useStore from '../store/useStore'
import Zelle from './Zelle'
import ZeugnisnoteZelle from './ZeugnisnoteZelle'

// ─── Kategorie-Farben ─────────────────────────────────────────────────────────
const KAT_FARBE = {
  MA: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  HÜ: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  T: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  SA: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  CUSTOM: 'bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
}

// ─── Spalten-Kopf ─────────────────────────────────────────────────────────────
const SpalteHeader = memo(function SpalteHeader({ spalte, onContextMenu }) {
  const { toggleSpalteEingeklappt } = useStore()

  const datumAnzeige = spalte.datum
    ? new Date(spalte.datum).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
    : ''

  if (spalte.eingeklappt) {
    return (
      <th
        className="p-0 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
        style={{ width: 20, minWidth: 20 }}
        onClick={() => toggleSpalteEingeklappt(spalte.id)}
        onContextMenu={e => onContextMenu(e, spalte)}
        title={`${spalte.kuerzel} ${datumAnzeige} – Klick zum Ausklappen`}
      >
        <div className="h-12 flex items-center justify-center">
          <span className="text-zinc-400 text-xs" style={{ writingMode: 'vertical-rl' }}>
            {spalte.kuerzel}
          </span>
        </div>
      </th>
    )
  }

  return (
    <th
      className={`p-0 text-center cursor-pointer select-none group ${KAT_FARBE[spalte.kategorie] ?? KAT_FARBE.CUSTOM}`}
      style={{ width: 36, minWidth: 36 }}
      onContextMenu={e => onContextMenu(e, spalte)}
      title="Rechtsklick für Optionen"
    >
      <div className="h-12 flex flex-col items-center justify-center px-0.5">
        <span className="font-semibold text-xs leading-tight">{spalte.kuerzel}</span>
        <span className="text-xs opacity-70 leading-tight">{datumAnzeige}</span>
      </div>
    </th>
  )
})

// ─── Eingeklappte Zelle ───────────────────────────────────────────────────────
const EingeklappteZelle = memo(function EingeklappteZelle() {
  return <td style={{ width: 20, minWidth: 20 }} className="bg-zinc-50 dark:bg-zinc-900/50" />
})

// ─── ZN-Spalten-Kopf ──────────────────────────────────────────────────────────
function ZNHeader({ semester }) {
  return (
    <th className="bg-zinc-50 dark:bg-zinc-900/40 text-center" style={{ width: 42, minWidth: 42 }}>
      <div className="h-12 flex flex-col items-center justify-center px-1">
        <span className="font-bold text-xs text-zinc-500 dark:text-zinc-400">ZN</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">S{semester}</span>
      </div>
    </th>
  )
}

// ─── Ghost-Spalte (+ Hinzufügen) ──────────────────────────────────────────────
function GhostSpalteHeader({ onClick }) {
  return (
    <th
      className="p-0 cursor-pointer group"
      style={{ width: 36, minWidth: 36 }}
      onClick={onClick}
      title="Neue Spalte hinzufügen"
    >
      <div className="h-12 flex items-center justify-center border-l border-dashed border-zinc-200 dark:border-zinc-700/60 group-hover:border-indigo-300 dark:group-hover:border-indigo-600 transition-colors">
        <span className="text-zinc-300 dark:text-zinc-700 group-hover:text-indigo-400 dark:group-hover:text-indigo-500 transition-colors text-base font-light select-none">
          +
        </span>
      </div>
    </th>
  )
}

function GhostZelle({ onClick }) {
  return (
    <td
      style={{ width: 36, minWidth: 36 }}
      className="p-0 cursor-pointer group/ghost"
      onClick={onClick}
    >
      <div className="w-9 h-9 border-l border-dashed border-zinc-100 dark:border-zinc-800/60 group-hover/ghost:border-indigo-200 dark:group-hover/ghost:border-indigo-800 group-hover/ghost:bg-indigo-50/30 dark:group-hover/ghost:bg-indigo-950/20 transition-colors" />
    </td>
  )
}

// ─── Haupt-Tabelle ────────────────────────────────────────────────────────────
export default function NotenTabelle() {
  const {
    schueler, spalten, aktivesFach,
    aktiveSemester, semester1Eingeklappt, setSemester1Eingeklappt,
    setDetailSchueler, openModal,
    ladeSpalten, refreshZeugnisnoten,
  } = useStore()

  const [spaltenContextMenu, setSpaltenContextMenu] = useState(null)
  const tableRef = useRef(null)

  const spaltenS1 = spalten.filter(s => s.semester === 1)
  const spaltenS2 = spalten.filter(s => s.semester === 2)

  const spaltenZeigen = [
    ...spaltenS1,
    ...(aktiveSemester === 2 ? spaltenS2 : []),
  ]

  const handleSpalteContextMenu = useCallback((e, spalte) => {
    e.preventDefault()
    setSpaltenContextMenu({ x: e.clientX, y: e.clientY, spalte })
  }, [])

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

  if (!aktivesFach) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-base mb-1 text-zinc-500 dark:text-zinc-400">Kein Fach ausgewählt</p>
          <p className="text-sm text-zinc-400">Wähle oben ein Fach oder lege ein neues an.</p>
        </div>
      </div>
    )
  }

  if (schueler.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-base mb-3 text-zinc-500 dark:text-zinc-400">Noch keine Schüler:innen</p>
          <button className="btn-primary" onClick={() => openModal('schuelerVerwalten')}>
            Schüler:innen hinzufügen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Semester-Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
          <button
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all
              ${aktiveSemester === 1
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
            onClick={() => useStore.setState({ aktiveSemester: 1 })}
          >
            S1
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all
              ${aktiveSemester === 2
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
            onClick={() => useStore.setState({ aktiveSemester: 2 })}
          >
            S2
          </button>
        </div>

        {aktiveSemester === 2 && (
          <button
            className="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            onClick={() => setSemester1Eingeklappt(!semester1Eingeklappt)}
          >
            {semester1Eingeklappt ? 'S1 ▸' : 'S1 ◂'}
          </button>
        )}
      </div>

      {/* Tabelle */}
      <div className="noten-tabelle-container" ref={tableRef}>
        <table className="noten-tabelle">
          <thead>
            <tr>
              {/* Namens-Kopf */}
              <th className="name-header bg-white dark:bg-zinc-950 text-left px-3 py-2 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider"
                style={{ minWidth: 160, width: 160 }}>
                Name
              </th>

              {/* Semester 1 Spalten */}
              {semester1Eingeklappt && aktiveSemester === 2 ? (
                <th
                  className="bg-zinc-100 dark:bg-zinc-800/60 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  style={{ width: 20, minWidth: 20 }}
                  onClick={() => setSemester1Eingeklappt(false)}
                  title="S1 anzeigen"
                >
                  <div className="h-12 flex items-center justify-center">
                    <span className="text-zinc-400 text-xs" style={{ writingMode: 'vertical-rl' }}>S1</span>
                  </div>
                </th>
              ) : (
                spaltenS1.map(sp => (
                  <SpalteHeader key={sp.id} spalte={sp} onContextMenu={handleSpalteContextMenu} />
                ))
              )}

              {/* ZN S1 */}
              <ZNHeader semester={1} />

              {/* Semester 2 Spalten */}
              {aktiveSemester === 2 && spaltenS2.map(sp => (
                <SpalteHeader key={sp.id} spalte={sp} onContextMenu={handleSpalteContextMenu} />
              ))}

              {/* ZN S2 */}
              {aktiveSemester === 2 && <ZNHeader semester={2} />}

              {/* Ghost-Spalte zum Hinzufügen */}
              <GhostSpalteHeader onClick={openSpalteModal} />
            </tr>
          </thead>

          <tbody>
            {schueler.map(s => (
              <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                {/* Name */}
                <td
                  className="sticky left-0 z-10 bg-white dark:bg-zinc-950 px-3 py-0 cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 border-r border-zinc-100 dark:border-zinc-800/60 transition-colors"
                  style={{ minWidth: 160, width: 160, height: 36 }}
                  onClick={() => setDetailSchueler(s)}
                  title="Detailansicht öffnen"
                >
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {s.nachname}
                  </span>
                  <span className="text-sm text-zinc-400 dark:text-zinc-500 ml-1">
                    {s.vorname}
                  </span>
                  {s.lernschwaeche ? <span title="Lernschwäche" className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">LS</span> : null}
                  {s.legasthenie   ? <span title="Legasthenie"  className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">LEG</span> : null}
                  {s.spf           ? <span title="Sonderpädagogischer Förderbedarf" className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">SPF</span> : null}
                </td>

                {/* S1 Zellen */}
                {semester1Eingeklappt && aktiveSemester === 2 ? (
                  <td style={{ width: 20, minWidth: 20 }} className="bg-zinc-100 dark:bg-zinc-800/60" />
                ) : (
                  spaltenS1.map(sp =>
                    sp.eingeklappt
                      ? <EingeklappteZelle key={sp.id} />
                      : <Zelle key={sp.id} spalte={sp} schueler={s} />
                  )
                )}

                {/* ZN S1 */}
                <ZeugnisnoteZelle schueler={s} semester={1} />

                {/* S2 Zellen */}
                {aktiveSemester === 2 && spaltenS2.map(sp =>
                  sp.eingeklappt
                    ? <EingeklappteZelle key={sp.id} />
                    : <Zelle key={sp.id} spalte={sp} schueler={s} />
                )}

                {/* ZN S2 */}
                {aktiveSemester === 2 && <ZeugnisnoteZelle schueler={s} semester={2} />}

                {/* Ghost-Zelle */}
                <GhostZelle onClick={openSpalteModal} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            <div className="context-menu-item text-red-500" onClick={() => handleSpalteLoeschen(spaltenContextMenu.spalte.id)}>
              Spalte löschen
            </div>
          </div>
        </>
      )}
    </div>
  )
}

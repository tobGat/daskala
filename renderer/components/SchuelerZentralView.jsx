// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Zentrale, klassenübergreifende Schüler:innen-Verwaltung: listet ALLE Schüler:innen des aktuellen
// Schuljahrs mit Merkmalen (Lernschwäche/Legasthenie/SPF), Klassen- und Fächer-Zuordnung.
// Die Tabelle dient nur der ANSICHT; das Bearbeiten (Name, Merkmale, Klassen, Fächer) läuft über
// ein eigenes Modal, das der „Bearbeiten"-Button am Zeilenende öffnet. Ein Klick auf den Namen
// öffnet weiterhin das Detail-/Leistungsprofil.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../store/useStore'
import SchuelerAvatar from './SchuelerAvatar'
import { useIsMobile } from '../hooks/useIsMobile'
import { parseSchuelerDatei } from '../utils/schuelerImport'

// Merkmal-Badge – reine Anzeige (Tabelle). Aktiv = farbig, sonst gedämpft.
function MerkmalBadge({ an, label, farbe }) {
  const aus = 'bg-paper-200 text-ink-400 dark:bg-ink-700 dark:text-ink-500'
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${an ? farbe : aus}`}
      title={an ? `${label} aktiv` : `${label} nicht gesetzt`}>{label}</span>
  )
}

// Umschaltbares Merkmal (im Bearbeiten-Modal).
function MerkmalToggle({ an, label, farbe, onClick }) {
  const aus = 'bg-paper-200 text-ink-400 dark:bg-ink-700 dark:text-ink-500'
  return (
    <button type="button" onClick={onClick}
      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${an ? farbe : aus}`}
      title={an ? `${label} aktiv – klicken zum Entfernen` : `${label} setzen`}>{label}</button>
  )
}

const MERKMALE = [
  { feld: 'lernschwaeche', label: 'LS', farbe: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { feld: 'legasthenie', label: 'LEG', farbe: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  { feld: 'spf', label: 'SPF', farbe: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
]

// Stammdaten-Felder (Kontakt/Notfall/Berechtigte) für Bearbeiten-Modal + Anzeige.
const STAMMDATEN = [
  { feld: 'geburtsdatum', label: 'Geburtsdatum', type: 'date', icon: '🎂' },
  { feld: 'telefon', label: 'Telefon', type: 'text', icon: '📞' },
  { feld: 'email', label: 'E-Mail', type: 'text', icon: '✉️' },
  { feld: 'notfallnummer', label: 'Notfallnummer', type: 'text', icon: '🚨' },
  { feld: 'adresse', label: 'Adresse', type: 'textarea', icon: '🏠' },
  { feld: 'erziehungsberechtigte', label: 'Erziehungsberechtigte', type: 'textarea', icon: '👪' },
  { feld: 'abholberechtigte', label: 'Abholberechtigte', type: 'textarea', icon: '🚸' },
  { feld: 'anmerkungen', label: 'Anmerkungen', type: 'textarea', icon: '📝' },
]

export default function SchuelerZentralView() {
  const { alleSchueler, ladeAlleSchueler, klassen, aktuellesSchuljahr, setDetailSchueler, bearbeiteSchueler, zentraleSortierung: sort, setZentraleSortierung: setSort } = useStore()
  const [suche, setSuche] = useState('')
  const [bearbeiten, setBearbeiten] = useState(null) // { schueler } – Bearbeiten-Modal
  const [neu, setNeu] = useState(false) // Neu-Anlegen-Modal
  const [klasseFilter, setKlasseFilter] = useState('') // '' = alle Klassen, sonst klasse_id (String)
  const [merkmalFilter, setMerkmalFilter] = useState(() => ({ lernschwaeche: false, legasthenie: false, spf: false }))

  useEffect(() => { ladeAlleSchueler() }, [aktuellesSchuljahr?.id, ladeAlleSchueler])

  const echteKlassen = useMemo(() => (klassen || []).filter(k => !k.ist_vorlage), [klassen])
  const merkmalUmschalten = (feld) => setMerkmalFilter(m => ({ ...m, [feld]: !m[feld] }))
  // Klick auf eine sortierbare Spalte: gleiche Spalte → Richtung wechseln, sonst neu (aufsteigend).
  // sort/setSort kommen aus dem Store → Auswahl bleibt bis zum Neustart erhalten.
  const sortieren = (feld) => setSort(sort.feld === feld ? { feld, richtung: sort.richtung === 'asc' ? 'desc' : 'asc' } : { feld, richtung: 'asc' })
  const sortPfeil = (feld) => sort.feld !== feld ? '' : (sort.richtung === 'asc' ? ' ▲' : ' ▼')

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const kId = klasseFilter ? Number(klasseFilter) : null
    const aktiveMerkmale = Object.keys(merkmalFilter).filter(f => merkmalFilter[f])
    let list = alleSchueler.filter(s => {
      if (q && !(`${s.vorname} ${s.nachname}`.toLowerCase().includes(q) || (s.klassen || []).some(k => (k.name || '').toLowerCase().includes(q)))) return false
      if (kId && !(s.klassen || []).some(k => k.id === kId)) return false
      if (aktiveMerkmale.length && !aktiveMerkmale.every(f => s[f])) return false
      return true
    })
    const { feld, richtung } = sort
    const faktor = richtung === 'desc' ? -1 : 1
    // Sortierschlüssel je Spalte; „klasse" = Stammklasse (bzw. erste Klasse) der Person.
    const wert = (s, f) => {
      if (f === 'klasse') {
        const ks = s.klassen || []
        const stamm = ks.find(k => k.ist_stammklasse) || ks[0]
        return stamm ? stamm.name : ''
      }
      return s[f] || ''
    }
    const cmp = (a, b, f) => wert(a, f).localeCompare(wert(b, f), 'de', { sensitivity: 'base' })
    const sekundaer = feld === 'klasse' ? ['nachname', 'vorname'] : (feld === 'nachname' ? ['vorname'] : ['nachname'])
    return [...list].sort((a, b) => {
      const p = cmp(a, b, feld) * faktor
      if (p !== 0) return p
      for (const sf of sekundaer) { const c = cmp(a, b, sf); if (c !== 0) return c }
      return 0
    })
  }, [alleSchueler, suche, klasseFilter, merkmalFilter, sort])

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-paper-50 dark:bg-ink-950">
      {/* Kompakte Kopfleiste: Titel + Filter/Suche in EINER schmalen Zeile */}
      <div className="shrink-0 px-4 py-1.5 border-b border-paper-200 dark:border-ink-800 flex items-center gap-2 flex-wrap">
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
          <span aria-hidden>🙋</span> Schüler:innen
          <span className="text-xs font-normal text-ink-400">({gefiltert.length}{gefiltert.length !== alleSchueler.length ? `/${alleSchueler.length}` : ''})</span>
        </h1>
        <button type="button" onClick={() => setNeu(true)}
          className="text-xs font-semibold px-2.5 h-7 rounded-lg bg-coral-600 text-white hover:bg-coral-700 transition-colors"
          title="Neue:n Schüler:in anlegen">+ Neu</button>
        {/* Filter: Merkmale */}
        <div className="flex items-center gap-1 ml-auto">
          {MERKMALE.map(m => (
            <button key={m.feld} type="button" onClick={() => merkmalUmschalten(m.feld)}
              className={`text-[10px] font-bold px-1.5 h-7 rounded-lg border transition-colors ${
                merkmalFilter[m.feld] ? m.farbe + ' border-transparent' : 'border-paper-200 dark:border-ink-700 text-ink-400 hover:text-ink-600'}`}
              title={merkmalFilter[m.feld] ? `Filter ${m.label} aktiv – nur mit ${m.label}` : `Nach ${m.label} filtern`}>
              {m.label}
            </button>
          ))}
        </div>
        {/* Filter: Klasse */}
        <select value={klasseFilter} onChange={e => setKlasseFilter(e.target.value)}
          className="h-7 text-xs px-2 rounded-lg border border-paper-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-400/30 focus:border-coral-400"
          title="Nach Klasse filtern">
          <option value="">Alle Klassen</option>
          {echteKlassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Suchen …"
          className="h-7 text-xs px-2.5 rounded-lg w-44 max-w-full border border-paper-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-800 dark:text-white placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-coral-400/30 focus:border-coral-400"
        />
      </div>

      {/* Tabelle (nur Ansicht) */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {gefiltert.length === 0 ? (
          <div className="text-center text-sm text-ink-400 py-16">
            {alleSchueler.length === 0
              ? 'Noch keine Schüler:innen in diesem Schuljahr. Lege sie in einer Klasse an.'
              : 'Keine Treffer.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 bg-paper-100 dark:bg-ink-800/60">
                  <th className="text-left px-3 py-2">
                    <button type="button" onClick={() => sortieren('vorname')} className="text-[10px] font-bold uppercase tracking-wider hover:text-coral-600 dark:hover:text-coral-300" title="Nach Vorname sortieren">Vorname{sortPfeil('vorname')}</button>
                  </th>
                  <th className="text-left px-3 py-2">
                    <button type="button" onClick={() => sortieren('nachname')} className="text-[10px] font-bold uppercase tracking-wider hover:text-coral-600 dark:hover:text-coral-300" title="Nach Nachname sortieren">Nachname{sortPfeil('nachname')}</button>
                  </th>
                  <th className="text-left px-3 py-2">Merkmale</th>
                  <th className="text-left px-3 py-2">
                    <button type="button" onClick={() => sortieren('klasse')} className="text-[10px] font-bold uppercase tracking-wider hover:text-coral-600 dark:hover:text-coral-300" title="Nach Stammklasse sortieren">Klassen{sortPfeil('klasse')}</button>
                  </th>
                  <th className="text-left px-3 py-2">Fächer</th>
                  <th className="text-right px-3 py-2">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-100 dark:divide-ink-800">
                {gefiltert.map(s => (
                  <tr key={s.id} className="hover:bg-paper-50 dark:hover:bg-ink-800/40">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <SchuelerAvatar schueler={s} size={30} className="shadow-softer shrink-0" />
                        <button type="button" onClick={() => setDetailSchueler(s)}
                          className="text-left text-ink-700 dark:text-paper-200 hover:text-coral-600 dark:hover:text-coral-300"
                          title="Detail-/Leistungsprofil öffnen">{s.vorname}</button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setDetailSchueler(s)}
                        className="text-left font-semibold text-ink-800 dark:text-paper-100 hover:text-coral-600 dark:hover:text-coral-300"
                        title="Detail-/Leistungsprofil öffnen">{s.nachname}</button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {MERKMALE.map(m => (
                          <MerkmalBadge key={m.feld} an={s[m.feld]} label={m.label} farbe={m.farbe} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(s.klassen || []).length === 0
                          ? <span className="text-ink-400 text-xs">–</span>
                          : (s.klassen || []).map(k => (
                            <span key={k.id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300">
                              {k.name}{k.ist_stammklasse ? <span className="text-coral-500" title="Stammklasse"> ●</span> : null}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                        {(s.faecher || []).length === 0
                          ? <span className="text-ink-400 text-xs">–</span>
                          : (<>
                            {(s.faecher || []).slice(0, 2).map(f => (
                              <span key={f.id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-paper-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400" title={f.klasse_name}>
                                {f.name}
                              </span>
                            ))}
                            {(s.faecher || []).length > 2 && (
                              <span className="text-[11px] text-ink-400" title={(s.faecher || []).slice(2).map(f => f.name).join(', ')}>+{(s.faecher || []).length - 2}</span>
                            )}
                          </>)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setBearbeiten({ schueler: s })}
                        className="btn-secondary text-xs px-2.5 py-1 whitespace-nowrap" title="Details bearbeiten">
                        ✎ Bearbeiten
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bearbeiten-Modal (Name, Merkmale, Klassen, Fächer) */}
      {bearbeiten && (
        <SchuelerBearbeitenModal
          schueler={bearbeiten.schueler}
          klassen={echteKlassen}
          onClose={() => setBearbeiten(null)}
          onSpeichern={async (payload) => { await bearbeiteSchueler(bearbeiten.schueler.id, payload); setBearbeiten(null) }}
        />
      )}

      {/* Neu-Anlegen-Modal (nur hier – Anlegen neuer Schüler:innen ist zentral) */}
      {neu && <SchuelerNeuModal klassen={echteKlassen} onClose={() => setNeu(false)} />}
    </div>
  )
}

// Modal zum Anlegen NEUER Schüler:innen (einzeln oder per Import). Anlegen ist ausschließlich hier
// möglich; die Klassen-Ansicht ordnet nur bereits bestehende Personen zu.
function SchuelerNeuModal({ klassen, onClose }) {
  const { erstelleSchueler, importiereSchueler } = useStore()
  const [tab, setTab] = useState('einzeln') // 'einzeln' | 'import'
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [klasseId, setKlasseId] = useState(klassen[0] ? String(klassen[0].id) : '')
  const [importListe, setImportListe] = useState([])
  const [loading, setLoading] = useState(false)
  const [zuletzt, setZuletzt] = useState(null)
  const vornameRef = useRef(null)
  const dateiInputRef = useRef(null)
  const mobil = useIsMobile()

  const kannEinzeln = !!klasseId && (vorname.trim() || nachname.trim()) && !loading

  const anlegen = async () => {
    if (!kannEinzeln) return
    setLoading(true)
    try {
      await erstelleSchueler({ klasseId: Number(klasseId), vorname: vorname.trim(), nachname: nachname.trim() })
      setZuletzt(`${vorname.trim()} ${nachname.trim()}`.trim())
      setVorname(''); setNachname('')
      vornameRef.current?.focus()
    } finally { setLoading(false) }
  }
  const dateiWaehlen = async () => {
    if (mobil) { dateiInputRef.current?.click(); return }
    const filePath = await window.api.dialog.openFile([{ name: 'Tabellen', extensions: ['csv', 'xlsx', 'xls'] }])
    if (!filePath) return
    const liste = await window.api.import.schuelerFromFile(filePath)
    if (!liste || !liste.length) { alert('Keine Schüler:innen gefunden. Erwartet: Spalten „Vorname" und „Nachname".'); return }
    setImportListe(liste)
  }
  const dateiGewaehlt = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try {
      const liste = await parseSchuelerDatei(file)
      if (!liste.length) { alert('Keine Schüler:innen gefunden. Erwartet: Spalten „Vorname" und „Nachname".'); return }
      setImportListe(liste)
    } catch { alert('Die Datei konnte nicht gelesen werden. Bitte CSV/Excel mit „Vorname"/„Nachname".') }
  }
  const importSpeichern = async () => {
    if (!importListe.length || !klasseId) return
    setLoading(true)
    try { await importiereSchueler(Number(klasseId), importListe); onClose() }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal-box max-w-md">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-1">Neue:r Schüler:in</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">Wird global angelegt und der gewählten Klasse als Stammklasse zugeordnet.</p>
        {klassen.length === 0 ? (
          <p className="text-sm text-ink-400 py-6 text-center">Lege zuerst eine Klasse an.</p>
        ) : (
          <>
            <label className="block text-xs text-ink-500 mb-1">Klasse (Stammklasse)</label>
            <select value={klasseId} onChange={e => setKlasseId(e.target.value)} className="input w-full mb-4 text-sm">
              {klassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <div className="flex gap-1 mb-4 bg-paper-100 dark:bg-ink-800 rounded-lg p-1">
              {[['einzeln', 'Einzeln'], ['import', 'Importieren']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setTab(v)}
                  className={`flex-1 py-1.5 text-sm rounded font-medium transition-colors ${tab === v ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-white shadow-sm' : 'text-ink-500 dark:text-ink-400'}`}>{l}</button>
              ))}
            </div>
            {tab === 'einzeln' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input ref={vornameRef} className="input" placeholder="Vorname" value={vorname} autoFocus onChange={e => setVorname(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') anlegen() }} />
                  <input className="input" placeholder="Nachname" value={nachname} onChange={e => setNachname(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') anlegen() }} />
                </div>
                <button className="btn-primary w-full" onClick={anlegen} disabled={!kannEinzeln}>{loading ? 'Anlegen…' : 'Anlegen'}</button>
                {zuletzt && <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center">„{zuletzt}" angelegt – weitere:n eingeben oder schließen.</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <input ref={dateiInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={dateiGewaehlt} />
                {importListe.length === 0 ? (
                  <>
                    <p className="text-sm text-ink-500 dark:text-ink-400">CSV- oder Excel-Datei mit Spalten „Vorname" und „Nachname".</p>
                    <button className="btn-secondary w-full" onClick={dateiWaehlen}>Datei auswählen</button>
                  </>
                ) : (
                  <>
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <p className="text-sm text-green-700 dark:text-green-400 font-medium mb-1">{importListe.length} Schüler:innen gefunden</p>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {importListe.map((s, i) => <p key={i} className="text-xs text-green-600 dark:text-green-500">{s.nachname} {s.vorname}</p>)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary flex-1" onClick={() => setImportListe([])}>Verwerfen</button>
                      <button className="btn-primary flex-1" onClick={importSpeichern} disabled={loading}>{loading ? 'Importieren…' : 'Importieren'}</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
        <div className="flex justify-end mt-5">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// Eigenes Modal zum Bearbeiten aller Details einer Person: Name, Merkmale, Klassen- und
// Fächer-Zuordnung – gebündelt mit EINEM „Speichern".
function SchuelerBearbeitenModal({ schueler, klassen, onClose, onSpeichern }) {
  const [vorname, setVorname] = useState(schueler.vorname || '')
  const [nachname, setNachname] = useState(schueler.nachname || '')
  const [merkmale, setMerkmale] = useState(() => ({
    lernschwaeche: !!schueler.lernschwaeche,
    legasthenie: !!schueler.legasthenie,
  }))
  const [klassenIds, setKlassenIds] = useState(() => new Set((schueler.klassen || []).map(k => k.id)))
  const [klassenFaecher, setKlassenFaecher] = useState(null) // [{ klasse, faecher:[{id,name,alle_schueler}] }]
  const [faecherAusw, setFaecherAusw] = useState(() => new Set((schueler.faecher || []).map(f => f.id)))
  const [spfFaecher, setSpfFaecher] = useState(() => new Set(schueler.spf_faecher || [])) // SPF je Fach
  const [spfModal, setSpfModal] = useState(false) // Auswahl der SPF-Fächer im eigenen Modal
  const [stammdaten, setStammdaten] = useState(() => Object.fromEntries(STAMMDATEN.map(s => [s.feld, schueler[s.feld] || ''])))
  const [speichert, setSpeichert] = useState(false)

  // Fächer der aktuell zugeordneten Klassen laden (für die Fächer-Auswahl).
  useEffect(() => {
    let abbruch = false
    ;(async () => {
      const ks = schueler.klassen || []
      const rows = await Promise.all(ks.map(async k => ({ klasse: k, faecher: await window.api.faecher.getAll(k.id) })))
      if (!abbruch) setKlassenFaecher(rows)
    })()
    return () => { abbruch = true }
  }, [schueler.id])

  const merkmalUmschalten = (feld) => setMerkmale(m => ({ ...m, [feld]: !m[feld] }))
  const klasseUmschalten = (id) => setKlassenIds(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const fachUmschalten = (id) => setFaecherAusw(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const nameOk = vorname.trim() && nachname.trim()
  const kannSpeichern = nameOk && klassenIds.size > 0 && !speichert && klassenFaecher !== null

  const speichern = async () => {
    if (!kannSpeichern) return
    setSpeichert(true)
    const details = {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      lernschwaeche: merkmale.lernschwaeche ? 1 : 0,
      legasthenie: merkmale.legasthenie ? 1 : 0,
      // spf NICHT hier – SPF ist fachbezogen und wird über spfFaecher gesetzt (Summen-Flag im Kern).
    }
    // Klassen-Diff.
    const origK = new Set((schueler.klassen || []).map(k => k.id))
    const klassenGeaendert = origK.size !== klassenIds.size || [...klassenIds].some(id => !origK.has(id))
    // Fächer-Diff: nur Auswahl-Fächer (alle_schueler=0) der geladenen Klassen; Mitgliedschaften in
    // nicht angebotenen (z.B. klassenübergreifenden) Fächern bleiben unangetastet.
    const original = new Set((schueler.faecher || []).map(f => f.id))
    const auswahlIds = new Set()
    for (const row of (klassenFaecher || [])) for (const f of row.faecher) if (f.alle_schueler === 0) auswahlIds.add(f.id)
    const add = [], remove = []
    for (const fid of auswahlIds) {
      const drin = faecherAusw.has(fid)
      if (drin && !original.has(fid)) add.push(fid)
      else if (!drin && original.has(fid)) remove.push(fid)
    }
    await onSpeichern({
      details,
      klasseIds: klassenGeaendert ? [...klassenIds] : null,
      faecherChanges: { add, remove },
      spfFaecher: [...spfFaecher],
      stammdaten,
    })
  }

  return (
    <>
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !speichert && onClose()}>
      <div className="modal-box max-w-lg">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white mb-1">Schüler:in bearbeiten</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">{schueler.vorname} {schueler.nachname}</p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Name</label>
            <div className="grid grid-cols-2 gap-2">
              <input className="input w-full" placeholder="Vorname" value={vorname} onChange={e => setVorname(e.target.value)} />
              <input className="input w-full" placeholder="Nachname" value={nachname} onChange={e => setNachname(e.target.value)} />
            </div>
          </div>

          {/* Merkmale (LS/LEG gelten für die ganze Person; SPF fachbezogen darunter) */}
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Merkmale</label>
            <div className="flex items-center gap-2">
              {MERKMALE.filter(m => m.feld !== 'spf').map(m => (
                <MerkmalToggle key={m.feld} an={merkmale[m.feld]} label={m.label} farbe={m.farbe} onClick={() => merkmalUmschalten(m.feld)} />
              ))}
            </div>
          </div>

          {/* SPF – je Fach: Auswahl in eigenem Modal; hier kompakte Anzeige der SPF-Fächer. */}
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">SPF (Sonderpäd. Förderbedarf)</label>
            {(schueler.faecher || []).length === 0 ? (
              <p className="text-sm text-ink-400">Die Person ist noch keinem Fach zugeordnet – SPF kann erst je Fach gesetzt werden, sobald es Fächer gibt.</p>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {spfFaecher.size === 0 ? (
                  <span className="text-sm text-ink-400">Kein SPF gesetzt.</span>
                ) : (
                  (schueler.faecher || []).filter(f => spfFaecher.has(f.id)).map(f => (
                    <span key={f.id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" title={f.klasse_name}>{f.name}</span>
                  ))
                )}
                <button type="button" onClick={() => setSpfModal(true)}
                  className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-300">
                  {spfFaecher.size === 0 ? 'SPF-Fächer festlegen' : 'ändern'}
                </button>
              </div>
            )}
          </div>

          {/* Klassen */}
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Klassen</label>
            <div className="space-y-1 border border-paper-200 dark:border-ink-700 rounded-lg p-1 max-h-40 overflow-y-auto">
              {klassen.map(k => (
                <label key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800 cursor-pointer">
                  <input type="checkbox" className="accent-coral-500" checked={klassenIds.has(k.id)} onChange={() => klasseUmschalten(k.id)} />
                  <span className="text-sm text-ink-700 dark:text-paper-200">{k.name}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Mindestens eine Klasse. Die Stammklasse (KV/Anzeige) bleibt erhalten bzw. wird umgehängt.</p>
          </div>

          {/* Fächer */}
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Fächer</label>
            {klassenFaecher === null ? (
              <p className="text-sm text-ink-400 py-3 text-center">Lade…</p>
            ) : klassenFaecher.length === 0 ? (
              <p className="text-sm text-ink-400 py-3 text-center">Noch keiner Klasse zugeordnet.</p>
            ) : (
              <div className="space-y-2 border border-paper-200 dark:border-ink-700 rounded-lg p-1 max-h-48 overflow-y-auto">
                {klassenFaecher.map(row => (
                  <div key={row.klasse.id}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400 dark:text-ink-500 px-2 pt-1 pb-0.5">{row.klasse.name}</div>
                    {row.faecher.length === 0 ? (
                      <p className="text-xs text-ink-400 px-2 pb-1">Keine Fächer</p>
                    ) : row.faecher.map(f => {
                      const ganz = f.alle_schueler !== 0
                      const on = ganz || faecherAusw.has(f.id)
                      return (
                        <label key={f.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${ganz ? 'opacity-70' : 'hover:bg-paper-100 dark:hover:bg-ink-800 cursor-pointer'}`}>
                          <input type="checkbox" className="accent-coral-500" checked={on} disabled={ganz} onChange={() => !ganz && fachUmschalten(f.id)} />
                          <span className="text-sm text-ink-700 dark:text-paper-200 flex-1">{f.name}</span>
                          <span className="text-[10px] text-ink-400">{ganz ? 'ganze Klasse' : 'Auswahl'}</span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-ink-400 mt-1">„Ganze Klasse"-Fächer ergeben sich aus der Klassenzugehörigkeit und sind nicht abwählbar.</p>
          </div>

          {/* Stammdaten (Kontakt / Notfall / Berechtigte) */}
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-paper-300 mb-2">Stammdaten</label>
            <div className="grid grid-cols-2 gap-2">
              {STAMMDATEN.map(feld => (
                feld.type === 'textarea' ? (
                  <div key={feld.feld} className="col-span-2">
                    <label className="block text-[11px] text-ink-400 mb-0.5">{feld.icon} {feld.label}</label>
                    <textarea rows={2} className="input w-full text-sm" value={stammdaten[feld.feld]}
                      onChange={e => setStammdaten(d => ({ ...d, [feld.feld]: e.target.value }))} />
                  </div>
                ) : (
                  <div key={feld.feld}>
                    <label className="block text-[11px] text-ink-400 mb-0.5">{feld.icon} {feld.label}</label>
                    <input type={feld.type} className="input w-full text-sm" value={stammdaten[feld.feld]}
                      onChange={e => setStammdaten(d => ({ ...d, [feld.feld]: e.target.value }))} />
                  </div>
                )
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={onClose} disabled={speichert}>Abbrechen</button>
          <button className="btn-primary" onClick={speichern} disabled={!kannSpeichern}>{speichert ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>

    {spfModal && (
      <SpfFaecherModal
        schueler={schueler}
        initial={spfFaecher}
        onClose={() => setSpfModal(false)}
        onOk={(sel) => { setSpfFaecher(sel); setSpfModal(false) }}
      />
    )}
    </>
  )
}

// Eigenes Modal zur Auswahl der SPF-Fächer einer Person (öffnet aus dem Bearbeiten-Modal).
// Bestätigt mit „OK" die Auswahl an das Bearbeiten-Modal (Persistenz erst beim dortigen Speichern).
function SpfFaecherModal({ schueler, initial, onClose, onOk }) {
  const [sel, setSel] = useState(() => new Set(initial))
  const faecher = schueler.faecher || []
  const toggle = (id) => setSel(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-1">SPF-Fächer wählen</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">{schueler.vorname} {schueler.nachname}</p>
        <div className="flex justify-between items-center text-xs text-ink-400 mb-1 px-1">
          <span>{sel.size} von {faecher.length} Fächern</span>
          <span className="flex gap-2">
            <button type="button" className="hover:text-coral-600" onClick={() => setSel(new Set(faecher.map(f => f.id)))}>Alle</button>
            <button type="button" className="hover:text-coral-600" onClick={() => setSel(new Set())}>Keine</button>
          </span>
        </div>
        <div className="space-y-1 border border-paper-200 dark:border-ink-700 rounded-lg p-1 max-h-[50vh] overflow-y-auto">
          {faecher.map(f => (
            <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800 cursor-pointer">
              <input type="checkbox" className="accent-rose-500" checked={sel.has(f.id)} onChange={() => toggle(f.id)} />
              <span className="text-sm text-ink-700 dark:text-paper-200 flex-1">{f.name}</span>
              <span className="text-[10px] text-ink-400">{f.klasse_name}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-ink-400 mt-2">Der SPF-Badge erscheint nur in den gewählten Fächern.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={() => onOk(sel)}>OK</button>
        </div>
      </div>
    </div>
  )
}

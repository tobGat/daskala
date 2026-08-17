// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Zentrale, klassenübergreifende Schüler:innen-Verwaltung: listet ALLE Schüler:innen des aktuellen
// Schuljahrs mit Merkmalen (Lernschwäche/Legasthenie/SPF), Klassen- und Fächer-Zuordnung. Erlaubt
// Bearbeiten der Merkmale/Namen und der Klassen-Zuordnung (n:m). Ein Klick auf den Namen öffnet das
// bestehende Detail-/Leistungsprofil.
import React, { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import SchuelerAvatar from './SchuelerAvatar'

// Toggle-Badge für ein Merkmal (Lernschwäche / Legasthenie / SPF), Stil wie im Klassen-Modal.
function MerkmalBadge({ an, label, farbe, onClick }) {
  const aus = 'bg-paper-200 text-ink-400 dark:bg-ink-700 dark:text-ink-500'
  return (
    <button type="button" onClick={onClick}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${an ? farbe : aus}`}
      title={an ? `${label} aktiv – klicken zum Entfernen` : `${label} setzen`}>
      {label}
    </button>
  )
}

export default function SchuelerZentralView() {
  const { alleSchueler, ladeAlleSchueler, klassen, aktuellesSchuljahr, setDetailSchueler, setSchuelerKlassen, setSchuelerFaecher } = useStore()
  const [suche, setSuche] = useState('')
  const [zuordnung, setZuordnung] = useState(null)   // { schueler } – Klassen-Zuordnungs-Dialog
  const [faecherDialog, setFaecherDialog] = useState(null) // { schueler } – Fächer-Zuordnungs-Dialog
  const [umbenennen, setUmbenennen] = useState(null) // { id, vorname, nachname }

  useEffect(() => { ladeAlleSchueler() }, [aktuellesSchuljahr?.id, ladeAlleSchueler])

  const echteKlassen = useMemo(() => (klassen || []).filter(k => !k.ist_vorlage), [klassen])
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (!q) return alleSchueler
    return alleSchueler.filter(s =>
      `${s.vorname} ${s.nachname}`.toLowerCase().includes(q) ||
      (s.klassen || []).some(k => (k.name || '').toLowerCase().includes(q)))
  }, [alleSchueler, suche])

  const merkmalUmschalten = async (s, feld) => {
    await window.api.schueler.update(s.id, { vorname: s.vorname, nachname: s.nachname, [feld]: s[feld] ? 0 : 1 })
    await ladeAlleSchueler()
  }
  const nameSpeichern = async () => {
    const u = umbenennen
    if (!u || !u.vorname.trim() || !u.nachname.trim()) return
    await window.api.schueler.update(u.id, { vorname: u.vorname.trim(), nachname: u.nachname.trim() })
    setUmbenennen(null)
    await ladeAlleSchueler()
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-paper-50 dark:bg-ink-950">
      {/* Kopfleiste */}
      <div className="shrink-0 px-4 py-3 border-b border-paper-200 dark:border-ink-800 flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-semibold text-ink-900 dark:text-white flex items-center gap-2">
          <span aria-hidden>🙋</span> Schüler:innen
          <span className="text-xs font-normal text-ink-400">({alleSchueler.length})</span>
        </h1>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Suchen (Name oder Klasse) …"
          className="input text-sm px-3 py-1.5 w-64 max-w-full ml-auto"
        />
      </div>

      {/* Tabelle */}
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
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Merkmale</th>
                  <th className="text-left px-3 py-2">Klassen</th>
                  <th className="text-left px-3 py-2">Fächer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-100 dark:divide-ink-800">
                {gefiltert.map(s => (
                  <tr key={s.id} className="hover:bg-paper-50 dark:hover:bg-ink-800/40">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <SchuelerAvatar schueler={s} size={30} className="shadow-softer shrink-0" />
                        <button type="button" onClick={() => setDetailSchueler(s)}
                          className="text-left leading-tight hover:text-coral-600 dark:hover:text-coral-300"
                          title="Detail-/Leistungsprofil öffnen">
                          <div className="font-semibold text-ink-800 dark:text-paper-100">{s.nachname}</div>
                          <div className="text-xs text-ink-500 dark:text-ink-400">{s.vorname}</div>
                        </button>
                        <button type="button" onClick={() => setUmbenennen({ id: s.id, vorname: s.vorname, nachname: s.nachname })}
                          className="text-ink-300 hover:text-coral-600 dark:hover:text-coral-300 text-xs" title="Umbenennen">✎</button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <MerkmalBadge an={s.lernschwaeche} label="LS" farbe="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" onClick={() => merkmalUmschalten(s, 'lernschwaeche')} />
                        <MerkmalBadge an={s.legasthenie} label="LEG" farbe="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" onClick={() => merkmalUmschalten(s, 'legasthenie')} />
                        <MerkmalBadge an={s.spf} label="SPF" farbe="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" onClick={() => merkmalUmschalten(s, 'spf')} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(s.klassen || []).map(k => (
                          <span key={k.id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300">
                            {k.name}{k.ist_stammklasse ? <span className="text-coral-500" title="Stammklasse"> ●</span> : null}
                          </span>
                        ))}
                        <button type="button" onClick={() => setZuordnung({ schueler: s })}
                          className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-300" title="Klassen-Zuordnung ändern">bearbeiten</button>
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
                        <button type="button" onClick={() => setFaecherDialog({ schueler: s })}
                          className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-300" title="Fächer-Zuordnung ändern">✎ Fächer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Umbenennen-Dialog */}
      {umbenennen && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setUmbenennen(null)}>
          <div className="modal-box max-w-sm">
            <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-3">Umbenennen</h3>
            <div className="space-y-2">
              <input className="input w-full" placeholder="Vorname" value={umbenennen.vorname}
                onChange={e => setUmbenennen(u => ({ ...u, vorname: e.target.value }))} />
              <input className="input w-full" placeholder="Nachname" value={umbenennen.nachname}
                onChange={e => setUmbenennen(u => ({ ...u, nachname: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setUmbenennen(null)}>Abbrechen</button>
              <button className="btn-primary" onClick={nameSpeichern} disabled={!umbenennen.vorname.trim() || !umbenennen.nachname.trim()}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* Klassen-Zuordnung */}
      {zuordnung && (
        <KlassenZuordnungDialog
          schueler={zuordnung.schueler}
          klassen={echteKlassen}
          onClose={() => setZuordnung(null)}
          onSpeichern={async (ids) => { await setSchuelerKlassen(zuordnung.schueler.id, ids); setZuordnung(null) }}
        />
      )}

      {/* Fächer-Zuordnung */}
      {faecherDialog && (
        <FaecherZuordnungDialog
          schueler={faecherDialog.schueler}
          onClose={() => setFaecherDialog(null)}
          onSpeichern={async (changes) => { await setSchuelerFaecher(faecherDialog.schueler.id, changes); setFaecherDialog(null) }}
        />
      )}
    </div>
  )
}

// Fächer-Zuordnung einer Person (#3/#4): je Klasse alle Fächer; „ganze Klasse"-Fächer sind
// implizit (nicht abwählbar), „Auswahl"-Fächer per Checkbox einzeln zuordenbar.
function FaecherZuordnungDialog({ schueler, onClose, onSpeichern }) {
  const [klassenFaecher, setKlassenFaecher] = useState(null) // [{ klasse, faecher:[{id,name,alle_schueler}] }]
  const [ausgewaehlt, setAusgewaehlt] = useState(() => new Set((schueler.faecher || []).map(f => f.id)))
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    let abbruch = false
    ;(async () => {
      const ks = schueler.klassen || []
      const rows = await Promise.all(ks.map(async k => ({ klasse: k, faecher: await window.api.faecher.getAll(k.id) })))
      if (!abbruch) setKlassenFaecher(rows)
    })()
    return () => { abbruch = true }
  }, [schueler.id])

  const umschalten = (fid) => setAusgewaehlt(prev => {
    const n = new Set(prev)
    if (n.has(fid)) n.delete(fid); else n.add(fid)
    return n
  })

  const speichern = async () => {
    if (speichert || !klassenFaecher) return
    setSpeichert(true)
    // Nur Auswahl-Fächer (alle_schueler=0) sind zuordenbar; Diff gegen die Ausgangs-Mitgliedschaft.
    const original = new Set((schueler.faecher || []).map(f => f.id))
    const auswahlIds = new Set()
    for (const row of klassenFaecher) for (const f of row.faecher) if (f.alle_schueler === 0) auswahlIds.add(f.id)
    const add = [], remove = []
    for (const fid of auswahlIds) {
      const drin = ausgewaehlt.has(fid)
      if (drin && !original.has(fid)) add.push(fid)
      else if (!drin && original.has(fid)) remove.push(fid)
    }
    if (!add.length && !remove.length) { onClose(); return }
    await onSpeichern({ add, remove })
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !speichert && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-1">Fächer-Zuordnung</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">{schueler.vorname} {schueler.nachname}</p>
        {klassenFaecher === null ? (
          <p className="text-sm text-ink-400 py-6 text-center">Lade…</p>
        ) : klassenFaecher.length === 0 ? (
          <p className="text-sm text-ink-400 py-6 text-center">Noch keiner Klasse zugeordnet.</p>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
            {klassenFaecher.map(row => (
              <div key={row.klasse.id}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400 dark:text-ink-500 px-1 pb-1">{row.klasse.name}</div>
                {row.faecher.length === 0 ? (
                  <p className="text-xs text-ink-400 px-2 pb-1">Keine Fächer</p>
                ) : row.faecher.map(f => {
                  const ganz = f.alle_schueler !== 0
                  const on = ganz || ausgewaehlt.has(f.id)
                  return (
                    <label key={f.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${ganz ? 'opacity-70' : 'hover:bg-paper-100 dark:hover:bg-ink-800 cursor-pointer'}`}>
                      <input type="checkbox" className="accent-coral-500" checked={on} disabled={ganz} onChange={() => !ganz && umschalten(f.id)} />
                      <span className="text-sm text-ink-700 dark:text-paper-200 flex-1">{f.name}</span>
                      <span className="text-[10px] text-ink-400">{ganz ? 'ganze Klasse' : 'Auswahl'}</span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-400 mt-2">„Ganze Klasse"-Fächer ergeben sich aus der Klassenzugehörigkeit und sind hier nicht abwählbar.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose} disabled={speichert}>Abbrechen</button>
          <button className="btn-primary" onClick={speichern} disabled={speichert || klassenFaecher === null}>{speichert ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}

function KlassenZuordnungDialog({ schueler, klassen, onClose, onSpeichern }) {
  const [ausgewaehlt, setAusgewaehlt] = useState(() => new Set((schueler.klassen || []).map(k => k.id)))
  const [speichert, setSpeichert] = useState(false)
  const umschalten = (id) => setAusgewaehlt(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const speichern = async () => {
    if (!ausgewaehlt.size || speichert) return
    setSpeichert(true)
    await onSpeichern([...ausgewaehlt])
  }
  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !speichert && onClose()}>
      <div className="modal-box max-w-sm">
        <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-1">Klassen-Zuordnung</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">{schueler.vorname} {schueler.nachname}</p>
        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {klassen.map(k => (
            <label key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-paper-100 dark:hover:bg-ink-800 cursor-pointer">
              <input type="checkbox" className="accent-coral-500" checked={ausgewaehlt.has(k.id)} onChange={() => umschalten(k.id)} />
              <span className="text-sm text-ink-700 dark:text-paper-200">{k.name}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-ink-400 mt-2">Mindestens eine Klasse wählen. Die erste Klasse gilt als Stammklasse (KV/Anzeige).</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose} disabled={speichert}>Abbrechen</button>
          <button className="btn-primary" onClick={speichern} disabled={!ausgewaehlt.size || speichert}>{speichert ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}

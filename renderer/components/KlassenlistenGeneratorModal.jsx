// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Klassenlisten-Generator: erstellt eine druckbare Liste (PDF) aus der zentralen Schüler:innen-Verwaltung.
// Zwei Modi: „Klassenliste" (mit wählbaren Info-Spalten) und „Leere Liste" (blanko Zeilen zum Ausfüllen).
// Dazu beschriftbare Leerspalten (quadratisch = schmale Kästchen, breit = Schreibfelder), Nr.-Spalte,
// Ausrichtung und Zeilenhöhe. Die Optionen werden hier zusammengestellt und als fertige Spalten/Zeilen
// an window.api.export.klassenliste übergeben (PDF-Erzeugung im Main-Prozess).
import React, { useMemo, useState } from 'react'

const MERK = [
  { feld: 'lernschwaeche', label: 'LS' },
  { feld: 'legasthenie', label: 'LEG' },
  { feld: 'spf', label: 'SPF' },
]

function gebFormat(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function heuteStr() {
  return new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Auswählbare Info-Spalten (Klassenliste). wert(s) → Zellentext.
const INFO_SPALTEN = [
  { key: 'nachname', label: 'Nachname', wert: s => s.nachname },
  { key: 'vorname', label: 'Vorname', wert: s => s.vorname },
  { key: 'geburtsdatum', label: 'Geburtsdatum', wert: s => gebFormat(s.geburtsdatum) },
  { key: 'klasse', label: 'Klasse(n)', wert: s => (s.klassen || []).map(k => k.name).join(', ') },
  { key: 'telefon', label: 'Telefon', wert: s => s.telefon },
  { key: 'email', label: 'E-Mail', wert: s => s.email },
  { key: 'notfallnummer', label: 'Notfallnummer', wert: s => s.notfallnummer },
  { key: 'adresse', label: 'Adresse', wert: s => [s.strasse, [s.plz, s.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
  { key: 'erziehungsberechtigte', label: 'Erziehungsberechtigte', wert: s => s.erziehungsberechtigte },
  { key: 'abholberechtigte', label: 'Abholberechtigte', wert: s => s.abholberechtigte },
  { key: 'merkmale', label: 'Merkmale (LS/LEG/SPF)', wert: s => MERK.filter(m => s[m.feld]).map(m => m.label).join(', ') },
  { key: 'anmerkungen', label: 'Anmerkungen', wert: s => s.anmerkungen },
]

export default function KlassenlistenGeneratorModal({ alleSchueler, klassen, aktuellesSchuljahr, initialKlasseId = '', onClose }) {
  const [modus, setModus] = useState('klassenliste') // 'klassenliste' | 'leer'
  const [klasseId, setKlasseId] = useState(initialKlasseId ? String(initialKlasseId) : '')
  const [titel, setTitel] = useState('')
  const [info, setInfo] = useState({ nachname: true, vorname: true })
  const [nummer, setNummer] = useState(true)
  const [nameLeer, setNameLeer] = useState(true) // nur „leer"-Modus: breite Namensspalte (blanko)
  const [zeilenLeer, setZeilenLeer] = useState(25) // nur „leer"-Modus
  const [leerAnzahl, setLeerAnzahl] = useState(3)
  const [leerForm, setLeerForm] = useState('quadrat') // 'quadrat' | 'breit'
  const [leerLabels, setLeerLabels] = useState([])
  const [orientierung, setOrientierung] = useState('hoch') // 'hoch' | 'quer'
  const [zeilenHoehe, setZeilenHoehe] = useState('normal') // 'normal' | 'gross'
  const [laden, setLaden] = useState(false)

  const echteKlassen = useMemo(() => (klassen || []).filter(k => !k.ist_vorlage), [klassen])

  const schuelerListe = useMemo(() => {
    const kId = klasseId ? Number(klasseId) : null
    const list = (alleSchueler || []).filter(s => !kId || (s.klassen || []).some(k => k.id === kId))
    return [...list].sort((a, b) =>
      (a.nachname || '').localeCompare(b.nachname || '', 'de', { sensitivity: 'base' }) ||
      (a.vorname || '').localeCompare(b.vorname || '', 'de', { sensitivity: 'base' }))
  }, [alleSchueler, klasseId])

  const klasseName = klasseId ? (echteKlassen.find(k => k.id === Number(klasseId))?.name || '') : 'Alle Klassen'
  const titelPlatzhalter = modus === 'klassenliste' ? `Klassenliste ${klasseName}` : `Liste ${klasseName}`

  const setLabel = (i, v) => setLeerLabels(prev => { const n = [...prev]; n[i] = v; return n })
  const infoUmschalten = (key) => setInfo(m => ({ ...m, [key]: !m[key] }))
  const anzahlInfo = INFO_SPALTEN.filter(c => info[c.key]).length

  // Wie viele Spalten hätte die Liste? (für Validierung/Hinweis)
  const spaltenGesamt = (nummer ? 1 : 0) + (modus === 'klassenliste' ? anzahlInfo : (nameLeer ? 1 : 0)) + Math.max(0, leerAnzahl)
  const kannErstellen = spaltenGesamt > 0 && !(modus === 'klassenliste' && schuelerListe.length === 0)

  const erstellen = async () => {
    if (!kannErstellen || laden) return
    const infoCols = INFO_SPALTEN.filter(c => info[c.key])
    const spalten = []
    if (nummer) spalten.push({ label: 'Nr.', art: 'nummer' })
    if (modus === 'klassenliste') {
      for (const c of infoCols) spalten.push({ label: c.label, art: 'text' })
    } else if (nameLeer) {
      spalten.push({ label: 'Name', art: 'leer', form: 'breit' })
    }
    for (let i = 0; i < leerAnzahl; i++) spalten.push({ label: (leerLabels[i] || '').trim(), art: 'leer', form: leerForm })

    const zeilen = []
    if (modus === 'klassenliste') {
      schuelerListe.forEach((s, idx) => {
        const row = []
        if (nummer) row.push(String(idx + 1))
        for (const c of infoCols) row.push(c.wert(s) || '')
        for (let i = 0; i < leerAnzahl; i++) row.push('')
        zeilen.push(row)
      })
    } else {
      for (let r = 0; r < zeilenLeer; r++) {
        const row = []
        if (nummer) row.push(String(r + 1))
        if (nameLeer) row.push('')
        for (let i = 0; i < leerAnzahl; i++) row.push('')
        zeilen.push(row)
      }
    }

    const titelFinal = (titel.trim() || titelPlatzhalter)
    const opt = {
      titel: titelFinal,
      untertitel: `${aktuellesSchuljahr?.bezeichnung ? aktuellesSchuljahr.bezeichnung + ' · ' : ''}Stand ${heuteStr()}${modus === 'klassenliste' ? ` · ${schuelerListe.length} Schüler:innen` : ''}`,
      dateiName: titelFinal,
      orientierung,
      zeilenHoeheMm: zeilenHoehe === 'gross' ? 13 : 9,
      spalten,
      zeilen,
    }
    setLaden(true)
    try {
      await window.api.export.klassenliste(opt)
      onClose()
    } finally {
      setLaden(false)
    }
  }

  const Seg = ({ wert, aktiv, onClick, children }) => (
    <button type="button" onClick={() => onClick(wert)}
      className={`px-3 h-8 rounded-lg text-xs font-semibold transition-colors ${aktiv
        ? 'bg-coral-500 text-white shadow-soft'
        : 'bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-700'}`}>
      {children}
    </button>
  )
  const feldLabel = 'block text-[11px] font-medium text-ink-500 dark:text-ink-400 mb-1'
  const inputCls = 'w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-2.5 py-1.5 text-ink-800 dark:text-paper-200 focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400'

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg w-[92vw] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex items-center gap-2"><span aria-hidden>📋</span> Klassenliste erstellen</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-600 text-sm">✕</button>
        </div>
        <p className="text-xs text-ink-500 dark:text-ink-400 mb-4">Erzeugt eine druckbare Liste als PDF.</p>

        <div className="space-y-4">
          {/* Art */}
          <div className="flex gap-2">
            <Seg wert="klassenliste" aktiv={modus === 'klassenliste'} onClick={setModus}>Klassenliste (mit Namen)</Seg>
            <Seg wert="leer" aktiv={modus === 'leer'} onClick={setModus}>Leere Liste</Seg>
          </div>

          {/* Klasse + Titel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={feldLabel}>Klasse</label>
              <select value={klasseId} onChange={e => setKlasseId(e.target.value)} className={inputCls}>
                <option value="">Alle Klassen</option>
                {echteKlassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              {modus === 'klassenliste' && (
                <p className="text-[11px] text-ink-400 mt-1">{schuelerListe.length} Schüler:in{schuelerListe.length === 1 ? '' : 'nen'}</p>
              )}
            </div>
            <div>
              <label className={feldLabel}>Titel (optional)</label>
              <input type="text" value={titel} onChange={e => setTitel(e.target.value)} placeholder={titelPlatzhalter} className={`${inputCls} placeholder-ink-400`} />
            </div>
          </div>

          {/* Modus-spezifisch */}
          {modus === 'klassenliste' ? (
            <div>
              <label className={feldLabel}>Welche Informationen? (Spalten)</label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border border-paper-200 dark:border-ink-800 rounded-lg p-2.5">
                {INFO_SPALTEN.map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm text-ink-700 dark:text-paper-200 cursor-pointer py-0.5">
                    <input type="checkbox" className="accent-coral-500 w-3.5 h-3.5" checked={!!info[c.key]} onChange={() => infoUmschalten(c.key)} />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className={feldLabel}>Anzahl leerer Zeilen</label>
                <input type="number" min={1} max={60} value={zeilenLeer}
                  onChange={e => setZeilenLeer(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-paper-200 cursor-pointer pb-1.5">
                <input type="checkbox" className="accent-coral-500 w-3.5 h-3.5" checked={nameLeer} onChange={() => setNameLeer(v => !v)} />
                <span>Breite „Name"-Spalte (blanko)</span>
              </label>
            </div>
          )}

          {/* Nr.-Spalte */}
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-paper-200 cursor-pointer">
            <input type="checkbox" className="accent-coral-500 w-3.5 h-3.5" checked={nummer} onChange={() => setNummer(v => !v)} />
            <span>Nummerierung (Nr.-Spalte)</span>
          </label>

          {/* Leerspalten */}
          <div className="border-t border-paper-100 dark:border-ink-800 pt-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-ink-500 dark:text-ink-400">Leerspalten zum Ausfüllen</label>
                <input type="number" min={0} max={12} value={leerAnzahl}
                  onChange={e => setLeerAnzahl(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
                  className="w-16 text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-2 py-1 text-ink-800 dark:text-paper-200 focus:outline-none focus:ring-2 focus:ring-coral-400/40" />
              </div>
              <div className="flex gap-1.5">
                <Seg wert="quadrat" aktiv={leerForm === 'quadrat'} onClick={setLeerForm}>▫ Quadratisch</Seg>
                <Seg wert="breit" aktiv={leerForm === 'breit'} onClick={setLeerForm}>▭ Breit</Seg>
              </div>
            </div>
            {leerAnzahl > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-ink-400">Spaltenbeschriftung (leer lassen für ein blankes Kopffeld):</p>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: leerAnzahl }, (_, i) => (
                    <input key={i} type="text" value={leerLabels[i] || ''} onChange={e => setLabel(i, e.target.value)}
                      placeholder={`Spalte ${i + 1}`} className={`${inputCls} placeholder-ink-400`} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Layout */}
          <div className="grid grid-cols-2 gap-3 border-t border-paper-100 dark:border-ink-800 pt-3">
            <div>
              <label className={feldLabel}>Ausrichtung</label>
              <div className="flex gap-1.5">
                <Seg wert="hoch" aktiv={orientierung === 'hoch'} onClick={setOrientierung}>Hochformat</Seg>
                <Seg wert="quer" aktiv={orientierung === 'quer'} onClick={setOrientierung}>Querformat</Seg>
              </div>
            </div>
            <div>
              <label className={feldLabel}>Zeilenhöhe</label>
              <div className="flex gap-1.5">
                <Seg wert="normal" aktiv={zeilenHoehe === 'normal'} onClick={setZeilenHoehe}>Normal</Seg>
                <Seg wert="gross" aktiv={zeilenHoehe === 'gross'} onClick={setZeilenHoehe}>Groß</Seg>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 mt-3 border-t border-paper-100 dark:border-ink-800">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={erstellen} disabled={!kannErstellen || laden}>
            {laden ? 'Erstellt…' : 'PDF erstellen'}
          </button>
        </div>
        {!kannErstellen && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 text-center">
            {modus === 'klassenliste' && schuelerListe.length === 0 ? 'Keine Schüler:innen in dieser Auswahl.' : 'Mindestens eine Spalte auswählen.'}
          </p>
        )}
      </div>
    </div>
  )
}

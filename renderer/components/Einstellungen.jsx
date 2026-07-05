// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

export default function Einstellungen({ onClose }) {
  const { gewichtungGlobal, theme, setTheme, einstellungen, pushToast } = useStore()

  // Nur noch SA, Test, Individuell bilden die Note → beim Laden auf 100 % normieren
  // (Mitarbeit/Hausübung zählen als Einfluss, nicht als Gewicht).
  const [gew, setGew] = useState(() => {
    const roh = {
      SA: gewichtungGlobal['SA'] ?? 0.4,
      T: gewichtungGlobal['T'] ?? 0.3,
      CUSTOM: gewichtungGlobal['CUSTOM'] ?? 0.1,
    }
    const summe = roh.SA + roh.T + roh.CUSTOM || 1
    const pct = {
      SA: Math.round(roh.SA / summe * 100),
      T: Math.round(roh.T / summe * 100),
      CUSTOM: Math.round(roh.CUSTOM / summe * 100),
    }
    // Rundungsdifferenz der größten Kategorie zuschlagen, damit die Summe exakt 100 ergibt
    const groesste = pct.SA >= pct.T && pct.SA >= pct.CUSTOM ? 'SA' : (pct.T >= pct.CUSTOM ? 'T' : 'CUSTOM')
    pct[groesste] += 100 - (pct.SA + pct.T + pct.CUSTOM)
    return pct
  })
  const [maEinfluss, setMaEinfluss] = useState(einstellungen['ma_max_einfluss'] ?? einstellungen['ma_hue_max_einfluss'] ?? '0.5')
  const [hueEinfluss, setHueEinfluss] = useState(einstellungen['hue_max_einfluss'] ?? einstellungen['ma_hue_max_einfluss'] ?? '0.5')
  const [semester2Monat, setSemester2Monat] = useState(einstellungen['semester2_monat'] ?? '2')
  const [s1Gewichtung, setS1Gewichtung] = useState(Math.round((parseFloat(einstellungen['s1_gewichtung'] ?? '0.5')) * 100))
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState('')
  const [erfolg, setErfolg] = useState(false)
  const [bundesland, setBundesland] = useState(einstellungen['bundesland'] ?? '')
  const [onedriveAktiv, setOnedriveAktiv] = useState(einstellungen['onedrive_backup_aktiv'] === '1')
  const [planungAktiv, setPlanungAktiv] = useState(einstellungen['planung_aktiv'] === '1')
  const [onedriveInfo, setOnedriveInfo] = useState(null) // { pfad, verfuegbar }
  const [materialRootPfad, setMaterialRootPfad] = useState(einstellungen['material_root_pfad'] || '')

  const handleMaterialRootWaehlen = async () => {
    const p = await window.api.materialien.waehleRoot()
    if (p) {
      setMaterialRootPfad(p)
      useStore.setState({ einstellungen: await window.api.einstellungen.getAll() })
      pushToast('Materialordner gesetzt.', 'success')
    }
  }
  const handleMaterialRootZuruecksetzen = async () => {
    await window.api.einstellungen.set('material_root_pfad', '')
    setMaterialRootPfad('')
    useStore.setState({ einstellungen: await window.api.einstellungen.getAll() })
  }

  useEffect(() => {
    window.api.onedrive.getInfo().then(setOnedriveInfo)
  }, [])

  const gesamt = Object.values(gew).reduce((a, b) => a + b, 0)

  const handleGewChange = (kat, val) => {
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 0) {
      setGew(prev => ({ ...prev, [kat]: n }))
    }
  }

  const handleSpeichern = async () => {
    if (Math.abs(gesamt - 100) > 0.5) {
      setFehler('Die Gewichtungen müssen zusammen 100% ergeben.')
      return
    }
    setLoading(true)
    setFehler('')
    try {
      for (const [kat, val] of Object.entries(gew)) {
        await window.api.gewichtungGlobal.update(kat, val / 100)
      }
      await window.api.einstellungen.set('ma_max_einfluss', maEinfluss)
      await window.api.einstellungen.set('hue_max_einfluss', hueEinfluss)
      await window.api.einstellungen.set('semester2_monat', semester2Monat)
      await window.api.einstellungen.set('s1_gewichtung', String(s1Gewichtung / 100))
      await window.api.einstellungen.set('bundesland', bundesland)
      await window.api.einstellungen.set('onedrive_backup_aktiv', onedriveAktiv ? '1' : '0')
      await window.api.einstellungen.set('planung_aktiv', planungAktiv ? '1' : '0')

      // Notenrelevante Einstellungen (MA+/-, s1_gewichtung) wirken sich auf gespeicherte ZN aus
      // → alle Zeugnisnoten im aktuellen Schuljahr neu berechnen
      await window.api.zeugnisnoten.rechneAllesNeu()

      // Store aktualisieren
      const gRows = await window.api.gewichtungGlobal.getAll()
      const neueGew = {}
      gRows.forEach(r => { neueGew[r.kategorie] = r.gewichtung })
      useStore.setState({ gewichtungGlobal: neueGew })

      const alleEinst = await window.api.einstellungen.getAll()
      useStore.setState({ einstellungen: alleEinst })

      // ZN im Store fürs aktive Fach neu laden, damit die UI die neuen Werte zeigt
      const { aktivesFach, ladeFachDaten } = useStore.getState()
      if (aktivesFach) await ladeFachDaten(aktivesFach.id)

      setErfolg(true)
      setTimeout(() => setErfolg(false), 2000)
    } finally {
      setLoading(false)
    }
  }

  const handleBackup = async () => {
    const pfad = await window.api.backup.create()
    if (pfad) pushToast(`Backup erstellt:\n${pfad}`, 'success')
    else pushToast('Backup fehlgeschlagen.', 'error')
  }

  const handleSaveAs = async () => {
    const pfad = await window.api.db.saveAs()
    if (pfad) pushToast(`Gespeichert unter:\n${pfad}`, 'success')
    else if (pfad === null) pushToast('Speichern fehlgeschlagen.', 'error')
  }

  const handleOpen = async () => {
    if (!confirm('Die aktuellen Daten werden ersetzt und die App startet neu. Fortfahren?')) return
    const ok = await window.api.db.open()
    if (ok === null) pushToast('Öffnen fehlgeschlagen.', 'error')
  }

  const katLabel = { SA: 'Schularbeiten', T: 'Tests', CUSTOM: 'Individuell' }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Einstellungen</h2>
          <div className="flex items-center gap-3">
            <button
              className="text-sm font-medium text-coral-600 hover:text-coral-700"
              onClick={() => { onClose(); useStore.getState().openModal('dokumentation') }}
            >
              📖 Dokumentation
            </button>
            <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Zweispaltiges Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">

          {/* Linke Spalte */}
          <div>
            {/* Gewichtungen */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-3">Globale Notengewichtung</h3>
              <div className="space-y-3">
                {Object.entries(katLabel).map(([kat, label]) => (
                  <div key={kat} className="flex items-center gap-3">
                    <span className="text-sm text-ink-600 dark:text-ink-400 w-24">{label}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      className="flex-1"
                      value={gew[kat]}
                      onChange={e => handleGewChange(kat, e.target.value)}
                    />
                    <span className={`text-sm font-medium w-10 text-right ${gew[kat] === 0 ? 'text-ink-400' : 'text-ink-900 dark:text-white'}`}>
                      {gew[kat]}%
                    </span>
                  </div>
                ))}
              </div>
              <div className={`mt-2 text-sm ${Math.abs(gesamt - 100) > 0.5 ? 'text-red-500' : 'text-green-600'}`}>
                Gesamt: {gesamt.toFixed(0)}% {Math.abs(gesamt - 100) <= 0.5 ? '✓' : '(muss 100% ergeben)'}
              </div>
              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1.5 leading-snug">
                Mitarbeit und Hausübungen bilden keine Note, sondern wirken nur als Einfluss (siehe unten).
              </p>
            </section>

            {/* Einfluss von Mitarbeit & Hausübung */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-1">Einfluss von Mitarbeit &amp; Hausübung</h3>
              <p className="text-xs text-ink-400 dark:text-ink-500 mb-3">
                Mitarbeit (+/−) und Hausübung (✓/✗) zählen nicht als Note, sondern verschieben die Note aus SA/Test/Individuell leicht – niveau-unabhängig. Jeder Eintrag zählt ein Stück (0,1 Notenpunkte). MA und HÜ wirken unabhängig voneinander: jede hat ihre eigene Deckelung, beide werden addiert.
              </p>
              <div className="space-y-3">
                {[
                  ['Mitarbeit', maEinfluss, setMaEinfluss],
                  ['Hausübung', hueEinfluss, setHueEinfluss],
                ].map(([label, wert, setter]) => (
                  <div key={label}>
                    <label className="block text-xs text-ink-500 mb-1">{label} – max. Verschiebung</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        className="flex-1"
                        value={wert}
                        onChange={e => setter(e.target.value)}
                      />
                      <span className="text-sm font-medium w-16 text-right tabular-nums text-ink-900 dark:text-white">
                        ± {Number(wert).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1">
                0 = kein Einfluss · 0,5 = empfohlen · höhere Werte wirken stärker
              </p>
            </section>
          </div>

          {/* Rechte Spalte */}
          <div>
            {/* Schuljahr */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-3">Schuljahr</h3>
              <div>
                <label className="block text-xs text-ink-500 mb-1">Semester 2 beginnt im Monat</label>
                <select className="input" value={semester2Monat} onChange={e => setSemester2Monat(e.target.value)}>
                  {[
                    [1, 'Jänner'], [2, 'Februar'], [3, 'März']
                  ].map(([m, name]) => (
                    <option key={m} value={m}>{name}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* Bundesland */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-1">Bundesland</h3>
              <p className="text-xs text-ink-400 dark:text-ink-500 mb-2">
                Wird für die automatische Anzeige der Schulferien im Jahresplanungs-Kalender verwendet.
              </p>
              <select className="input mb-2" value={bundesland} onChange={e => setBundesland(e.target.value)}>
                <option value="">– Bitte wählen –</option>
                {['Wien', 'Niederösterreich', 'Burgenland', 'Oberösterreich', 'Steiermark', 'Kärnten', 'Salzburg', 'Tirol', 'Vorarlberg'].map(bl => (
                  <option key={bl} value={bl}>{bl}</option>
                ))}
              </select>
              <button
                className="text-xs text-coral-600 dark:text-coral-400 hover:underline"
                onClick={() => {
                  onClose()
                  useStore.getState().openModal('ferien')
                }}
              >
                Ferien & Feiertage bearbeiten…
              </button>
            </section>

            {/* Module */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-1">Module</h3>
              <p className="text-xs text-ink-400 dark:text-ink-500 mb-2">
                Der Stundenplan ist immer im Dashboard sichtbar. Detaillierte Unterrichtsplanung pro Stunde kannst du hier aktivieren — oder ausschalten, wenn du dafür ein anderes Tool (z.B. Teachino) nutzt.
              </p>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={planungAktiv}
                  onChange={e => setPlanungAktiv(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm text-ink-700 dark:text-paper-200">Unterrichtsplanung aktivieren</span>
                  <p className="text-[11px] text-ink-400 leading-snug">
                    Jahres- und Klassenplanung als Klassen-Tabs verfügbar. Stundenplan bleibt unabhängig davon sichtbar.
                  </p>
                </div>
              </label>
            </section>

            {/* Zeugnisnote */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-1">Zeugnisnote</h3>
              <p className="text-xs text-ink-400 dark:text-ink-500 mb-3">
                Gewichtung der SN 1 in der Zeugnisnote (ZN).
                50% = SN 1 und SN 2 gleichwertig. Ist nur SN 1 vorhanden, wird SN 1 direkt als Zeugnisnote übernommen.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-600 dark:text-ink-400 w-24">SN 1-Gewichtung</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  className="flex-1"
                  value={s1Gewichtung}
                  onChange={e => setS1Gewichtung(parseInt(e.target.value))}
                />
                <span className="text-sm font-medium w-10 text-right text-ink-900 dark:text-white">
                  {s1Gewichtung}%
                </span>
              </div>
              <div className="flex justify-between text-xs text-ink-400 mt-1">
                <span>nur SN 2</span>
                <span>SN 2 {100 - s1Gewichtung}% + SN 1 {s1Gewichtung}%</span>
                <span>nur SN 1</span>
              </div>
            </section>

            {/* Design */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-3">Design</h3>
              <div className="flex gap-3">
                {[['hell', 'Hell ☀'], ['dunkel', 'Dunkel 🌙']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors
                      ${theme === val
                        ? 'border-coral-500 bg-coral-50 dark:bg-coral-900 text-coral-700 dark:text-coral-300'
                        : 'border-paper-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-paper-300'}`}
                    onClick={() => setTheme(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Volle Breite: Datensicherung */}
        <section className="mb-6 pt-4 border-t border-paper-100 dark:border-ink-800">
          <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-3">Datei</h3>
          <div className="flex gap-3 mb-6">
            <button className="btn-secondary" onClick={handleOpen}>Öffnen...</button>
            <button className="btn-secondary" onClick={handleSaveAs}>Speichern unter...</button>
          </div>

          <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-1">Materialordner</h3>
          <p className="text-xs text-ink-400 dark:text-ink-500 mb-2">
            Wurzelordner für die Materialien der Jahresplanung (Struktur: Schuljahr/Klasse/Fach/Abschnitt). Am besten einen kurzen Pfad wählen.
          </p>
          <div className="rounded-xl border border-paper-200 dark:border-ink-700 p-3 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                {materialRootPfad
                  ? <div className="text-xs text-ink-500 dark:text-ink-400 truncate" title={materialRootPfad}>{materialRootPfad}</div>
                  : <div className="text-xs text-ink-400">Noch kein Ordner gewählt.</div>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button className="btn-secondary" onClick={handleMaterialRootWaehlen}>Ordner wählen…</button>
                {materialRootPfad && (
                  <button className="text-xs text-ink-400 hover:text-red-500 px-2" onClick={handleMaterialRootZuruecksetzen} title="Zurücksetzen">✕</button>
                )}
              </div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-3">Datensicherung</h3>
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={handleBackup}>Backup erstellen</button>
              <button className="btn-secondary" onClick={() => window.api.export.toJson()}>JSON-Export</button>
            </div>
            {/* OneDrive */}
            <div className={`rounded-xl border p-3 ${onedriveInfo?.verfuegbar ? 'border-paper-200 dark:border-ink-700' : 'border-paper-100 dark:border-ink-800'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-700 dark:text-paper-300">OneDrive-Backup</span>
                    {onedriveInfo?.verfuegbar
                      ? <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">gefunden</span>
                      : <span className="text-xs text-ink-400">nicht gefunden</span>}
                  </div>
                  {onedriveInfo?.pfad && (
                    <div className="text-xs text-ink-400 truncate mt-0.5" title={onedriveInfo.pfad}>
                      {onedriveInfo.pfad}/Daskala/backups/
                    </div>
                  )}
                  {!onedriveInfo?.verfuegbar && (
                    <div className="text-xs text-ink-400 mt-0.5">OneDrive ist auf diesem PC nicht installiert.</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!onedriveInfo?.verfuegbar}
                  onClick={() => setOnedriveAktiv(v => !v)}
                  className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none
                    ${onedriveAktiv && onedriveInfo?.verfuegbar
                      ? 'bg-coral-600'
                      : 'bg-paper-200 dark:bg-ink-700'}
                    ${!onedriveInfo?.verfuegbar ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                    ${onedriveAktiv && onedriveInfo?.verfuegbar ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              {onedriveAktiv && onedriveInfo?.verfuegbar && (
                <p className="text-xs text-ink-400 mt-2">
                  Beim nächsten Start wird täglich ein Backup in deinen OneDrive-Ordner kopiert.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Jahresabschluss */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-ink-700 dark:text-paper-300 mb-3">Jahresabschluss</h3>
          <button
            className="btn-secondary w-full"
            onClick={() => {
              onClose()
              useStore.getState().openModal('schuljahreswechsel')
            }}
          >
            Klassen vorrücken / Neues Schuljahr beginnen
          </button>
        </section>

        {fehler && <p className="text-red-500 text-sm mb-3">{fehler}</p>}
        {erfolg && <p className="text-green-600 text-sm mb-3">Gespeichert ✓</p>}

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Schließen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading}>
            {loading ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

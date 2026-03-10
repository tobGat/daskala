import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

export default function Einstellungen({ onClose }) {
  const { gewichtungGlobal, theme, setTheme, einstellungen } = useStore()

  const [gew, setGew] = useState({
    SA: (gewichtungGlobal['SA'] ?? 0.4) * 100,
    T: (gewichtungGlobal['T'] ?? 0.3) * 100,
    MA: (gewichtungGlobal['MA'] ?? 0.2) * 100,
    HÜ: (gewichtungGlobal['HÜ'] ?? 0.1) * 100,
  })
  const [maPlusWert, setMaPlusWert] = useState(einstellungen['ma_plus_wert'] ?? '1')
  const [maMinusWert, setMaMinusWert] = useState(einstellungen['ma_minus_wert'] ?? '5')
  const [semester2Monat, setSemester2Monat] = useState(einstellungen['semester2_monat'] ?? '2')
  const [s1Gewichtung, setS1Gewichtung] = useState(Math.round((parseFloat(einstellungen['s1_gewichtung'] ?? '0.5')) * 100))
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState('')
  const [erfolg, setErfolg] = useState(false)
  const [onedriveAktiv, setOnedriveAktiv] = useState(einstellungen['onedrive_backup_aktiv'] === '1')
  const [onedriveInfo, setOnedriveInfo] = useState(null) // { pfad, verfuegbar }

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
      await window.api.einstellungen.set('ma_plus_wert', maPlusWert)
      await window.api.einstellungen.set('ma_minus_wert', maMinusWert)
      await window.api.einstellungen.set('semester2_monat', semester2Monat)
      await window.api.einstellungen.set('s1_gewichtung', String(s1Gewichtung / 100))
      await window.api.einstellungen.set('onedrive_backup_aktiv', onedriveAktiv ? '1' : '0')

      // Store aktualisieren
      const gRows = await window.api.gewichtungGlobal.getAll()
      const neueGew = {}
      gRows.forEach(r => { neueGew[r.kategorie] = r.gewichtung })
      useStore.setState({ gewichtungGlobal: neueGew })

      const alleEinst = await window.api.einstellungen.getAll()
      useStore.setState({ einstellungen: alleEinst })

      setErfolg(true)
      setTimeout(() => setErfolg(false), 2000)
    } finally {
      setLoading(false)
    }
  }

  const handleBackup = async () => {
    const pfad = await window.api.backup.create()
    if (pfad) alert(`Backup erstellt:\n${pfad}`)
    else alert('Backup fehlgeschlagen.')
  }

  const katLabel = { SA: 'Schularbeiten', T: 'Tests', MA: 'Mitarbeit', 'HÜ': 'Hausübungen' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Einstellungen</h2>
          <button className="text-zinc-400 hover:text-zinc-600 text-xl" onClick={onClose}>✕</button>
        </div>

        {/* Zweispaltiges Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">

          {/* Linke Spalte */}
          <div>
            {/* Gewichtungen */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Globale Notengewichtung</h3>
              <div className="space-y-3">
                {Object.entries(katLabel).map(([kat, label]) => (
                  <div key={kat} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 w-24">{label}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      className="flex-1"
                      value={gew[kat]}
                      onChange={e => handleGewChange(kat, e.target.value)}
                    />
                    <span className={`text-sm font-medium w-10 text-right ${gew[kat] === 0 ? 'text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                      {gew[kat]}%
                    </span>
                  </div>
                ))}
              </div>
              <div className={`mt-2 text-sm ${Math.abs(gesamt - 100) > 0.5 ? 'text-red-500' : 'text-green-600'}`}>
                Gesamt: {gesamt.toFixed(0)}% {Math.abs(gesamt - 100) <= 0.5 ? '✓' : '(muss 100% ergeben)'}
              </div>
            </section>

            {/* MA-Bewertung */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Mitarbeit-Bewertung</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">„+" entspricht Note</label>
                  <select className="input" value={maPlusWert} onChange={e => setMaPlusWert(e.target.value)}>
                    {[1, 2].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">„−" entspricht Note</label>
                  <select className="input" value={maMinusWert} onChange={e => setMaMinusWert(e.target.value)}>
                    {[4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </section>
          </div>

          {/* Rechte Spalte */}
          <div>
            {/* Schuljahr */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Schuljahr</h3>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Semester 2 beginnt im Monat</label>
                <select className="input" value={semester2Monat} onChange={e => setSemester2Monat(e.target.value)}>
                  {[
                    [1, 'Jänner'], [2, 'Februar'], [3, 'März']
                  ].map(([m, name]) => (
                    <option key={m} value={m}>{name}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* Jahresberechnung */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Jahresberechnung</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
                Wenn im 1. Semester keine Einträge vorhanden sind, aber eine S1-Zeugnisnote gesetzt wurde,
                fließt diese automatisch in die S2-Zeugnisnote ein.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400 w-24">S1-Gewichtung</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  className="flex-1"
                  value={s1Gewichtung}
                  onChange={e => setS1Gewichtung(parseInt(e.target.value))}
                />
                <span className="text-sm font-medium w-10 text-right text-zinc-900 dark:text-white">
                  {s1Gewichtung}%
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400 mt-1">
                <span>nur S2</span>
                <span>S2 {100 - s1Gewichtung}% + S1 {s1Gewichtung}%</span>
                <span>nur S1</span>
              </div>
            </section>

            {/* Design */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Design</h3>
              <div className="flex gap-3">
                {[['hell', 'Hell ☀'], ['dunkel', 'Dunkel 🌙']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors
                      ${theme === val
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                        : 'border-gray-200 dark:border-gray-700 text-zinc-600 dark:text-zinc-400 hover:border-gray-300'}`}
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
        <section className="mb-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Datensicherung</h3>
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={handleBackup}>Backup erstellen</button>
              <button className="btn-secondary" onClick={() => window.api.export.toJson()}>JSON-Export</button>
            </div>
            {/* OneDrive */}
            <div className={`rounded-xl border p-3 ${onedriveInfo?.verfuegbar ? 'border-zinc-200 dark:border-zinc-700' : 'border-zinc-100 dark:border-zinc-800'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">OneDrive-Backup</span>
                    {onedriveInfo?.verfuegbar
                      ? <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">gefunden</span>
                      : <span className="text-xs text-zinc-400">nicht gefunden</span>}
                  </div>
                  {onedriveInfo?.pfad && (
                    <div className="text-xs text-zinc-400 truncate mt-0.5" title={onedriveInfo.pfad}>
                      {onedriveInfo.pfad}/Daskala/backups/
                    </div>
                  )}
                  {!onedriveInfo?.verfuegbar && (
                    <div className="text-xs text-zinc-400 mt-0.5">OneDrive ist auf diesem PC nicht installiert.</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!onedriveInfo?.verfuegbar}
                  onClick={() => setOnedriveAktiv(v => !v)}
                  className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none
                    ${onedriveAktiv && onedriveInfo?.verfuegbar
                      ? 'bg-indigo-600'
                      : 'bg-zinc-200 dark:bg-zinc-700'}
                    ${!onedriveInfo?.verfuegbar ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                    ${onedriveAktiv && onedriveInfo?.verfuegbar ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              {onedriveAktiv && onedriveInfo?.verfuegbar && (
                <p className="text-xs text-zinc-400 mt-2">
                  Beim nächsten Start wird täglich ein Backup in deinen OneDrive-Ordner kopiert.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Jahresabschluss */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Jahresabschluss</h3>
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

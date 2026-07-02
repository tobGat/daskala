import React, { useState } from 'react'
import useStore from '../store/useStore'

const SCHRITTE = ['Willkommen', 'Schuljahr', 'Klasse & Fach', 'Schüler:innen', 'Fertig']

function SchrittIndikator({ aktuell }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {SCHRITTE.slice(1, -1).map((name, i) => (
        <React.Fragment key={i}>
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold transition-all
            ${i + 1 < aktuell
              ? 'bg-coral-500 text-white shadow-soft'
              : i + 1 === aktuell
                ? 'bg-coral-500 text-white shadow-glow ring-2 ring-coral-200 dark:ring-coral-900 scale-110'
                : 'bg-paper-200 dark:bg-ink-800 text-ink-400'}`}>
            {i + 1 < aktuell ? '✓' : i + 1}
          </div>
          {i < SCHRITTE.length - 3 && (
            <div className={`h-1 w-12 rounded-full transition-colors ${i + 1 < aktuell ? 'bg-coral-500' : 'bg-paper-200 dark:bg-ink-800'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function Einrichtungsflow() {
  const { erststart_abschliessen } = useStore()
  const [schritt, setSchritt] = useState(0) // 0=Willkommen, 1=Schuljahr, 2=Klasse+Fach, 3=Schueler, 4=Fertig

  // Schuljahr
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const defaultSchuljahr = month >= 9
    ? `${year}/${String(year + 1).slice(2)}`
    : `${year - 1}/${String(year).slice(2)}`
  const defaultSemester = month >= 9 || month <= 1 ? 1 : 2

  const [schuljahr, setSchuljahr] = useState(defaultSchuljahr)
  const [semester, setSemester] = useState(defaultSemester)
  const [klasse, setKlasse] = useState('')
  const [fach, setFach] = useState('')
  const [schuelerText, setSchuelerText] = useState('')
  const [importListe, setImportListe] = useState([])
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState('')

  // IDs nach Erstellung
  const [schuljahrId, setSchuljahreId] = useState(null)
  const [klasseId, setKlasseId] = useState(null)
  const [fachId, setFachId] = useState(null)

  const weiter = () => setSchritt(s => s + 1)
  const zurueck = () => { setSchritt(s => s - 1); setFehler('') }

  // Schritt 2: Schuljahr & Semester speichern
  const schuljahrWeiter = async () => {
    if (!schuljahr.trim()) { setFehler('Bitte Schuljahr eingeben.'); return }
    setFehler('')
    weiter()
  }

  // Schritt 3: Klasse & Fach anlegen
  const klasseFachWeiter = async () => {
    if (!klasse.trim()) { setFehler('Bitte Klassenname eingeben.'); return }
    if (!fach.trim()) { setFehler('Bitte Fach eingeben.'); return }
    setLoading(true)
    try {
      // Schuljahr anlegen
      const sjId = await window.api.schuljahre.create(schuljahr.trim())
      setSchuljahreId(sjId)

      // Klasse anlegen
      const kId = await window.api.klassen.create({ schuljahrId: sjId, name: klasse.trim() })
      setKlasseId(kId)

      // Fach anlegen
      const fId = await window.api.faecher.create({ klasseId: kId, name: fach.trim() })
      setFachId(fId)

      // Einstellungen speichern
      await window.api.einstellungen.set('schuljahr_aktuell', schuljahr.trim())
      await window.api.einstellungen.set('semester_aktuell', String(semester))

      setFehler('')
      weiter()
    } catch (e) {
      setFehler('Fehler beim Speichern: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Datei importieren
  const dateiImportieren = async () => {
    const filePath = await window.api.dialog.openFile([
      { name: 'Tabellen', extensions: ['csv', 'xlsx', 'xls'] }
    ])
    if (!filePath) return
    const liste = await window.api.import.schuelerFromFile(filePath)
    setImportListe(liste)
  }

  // Schritt 4: Schüler:innen speichern
  const schuelerWeiter = async () => {
    setLoading(true)
    try {
      let liste = []

      if (importListe.length > 0) {
        liste = importListe
      } else if (schuelerText.trim()) {
        // Manuell: "Vorname Nachname" pro Zeile
        const zeilen = schuelerText.trim().split('\n').filter(z => z.trim())
        for (const zeile of zeilen) {
          const teile = zeile.trim().split(/\s+/)
          if (teile.length >= 2) {
            liste.push({ vorname: teile[0], nachname: teile.slice(1).join(' ') })
          } else if (teile.length === 1) {
            liste.push({ vorname: teile[0], nachname: '' })
          }
        }
      }

      if (liste.length > 0 && klasseId) {
        await window.api.schueler.importBatch(klasseId, liste)
      }

      setFehler('')
      weiter()
    } catch (e) {
      setFehler('Fehler: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Abschluss
  const abschliessen = async () => {
    setLoading(true)
    await erststart_abschliessen(schuljahrId, klasseId, fachId)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-paper-50 dark:bg-ink-950 flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto px-6">

        {/* Schritt 0: Willkommen */}
        {schritt === 0 && (
          <div className="text-center animate-fade-up">
            <div className="text-7xl mb-6 animate-gentle-bounce">👋</div>
            <h1 className="text-5xl font-bold text-ink-800 dark:text-paper-100 mb-3 tracking-tight font-display">Hallo!</h1>
            <p className="text-ink-500 dark:text-ink-400 mb-2 text-xl">Willkommen bei Daskala</p>
            <p className="text-ink-400 dark:text-ink-500 mb-10 text-sm">Dein freundliches digitales Notenbuch ☕</p>
            <button className="btn-primary text-base px-8 py-3 group" onClick={weiter}>
              Los geht's
              <svg className="w-4 h-4 ml-1.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Schritte 1-3 */}
        {schritt >= 1 && schritt <= 3 && (
          <div className="bg-white dark:bg-ink-900 rounded-2xl p-8 border border-paper-100 dark:border-ink-800" style={{boxShadow: '0 24px 64px -12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.03)'}}>
            <SchrittIndikator aktuell={schritt} />

            {/* Schritt 1: Schuljahr */}
            {schritt === 1 && (
              <div>
                <h2 className="text-xl font-semibold text-ink-900 mb-6">Schuljahr & Semester</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">Schuljahr</label>
                    <input
                      className="input"
                      value={schuljahr}
                      onChange={e => setSchuljahr(e.target.value)}
                      placeholder="z.B. 2024/25"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2">Semester</label>
                    <div className="flex gap-3">
                      {[1, 2].map(s => (
                        <button
                          key={s}
                          onClick={() => setSemester(s)}
                          className={`flex-1 py-2 rounded-lg border-2 font-medium text-sm transition-colors
                            ${semester === s
                              ? 'border-coral-500 bg-coral-50 text-coral-600'
                              : 'border-paper-200 text-ink-600 hover:border-paper-300'}`}
                        >
                          Semester {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {fehler && <p className="text-red-500 text-sm mt-3">{fehler}</p>}
                <div className="flex gap-3 mt-8">
                  <button className="btn-secondary flex-1" onClick={zurueck}>Zurück</button>
                  <button className="btn-primary flex-1" onClick={schuljahrWeiter}>Weiter</button>
                </div>
              </div>
            )}

            {/* Schritt 2: Klasse & Fach */}
            {schritt === 2 && (
              <div>
                <h2 className="text-xl font-semibold text-ink-900 mb-6">Erste Klasse & Fach</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">Klasse</label>
                    <input
                      className="input"
                      value={klasse}
                      onChange={e => setKlasse(e.target.value)}
                      placeholder="z.B. 2b"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">Erstes Fach</label>
                    <input
                      className="input"
                      value={fach}
                      onChange={e => setFach(e.target.value)}
                      placeholder="z.B. Deutsch"
                    />
                  </div>
                  <p className="text-xs text-ink-500">Weitere Klassen und Fächer kannst du jederzeit hinzufügen.</p>
                </div>
                {fehler && <p className="text-red-500 text-sm mt-3">{fehler}</p>}
                <div className="flex gap-3 mt-8">
                  <button className="btn-secondary flex-1" onClick={zurueck}>Zurück</button>
                  <button className="btn-primary flex-1" onClick={klasseFachWeiter} disabled={loading}>
                    {loading ? 'Speichern…' : 'Weiter'}
                  </button>
                </div>
              </div>
            )}

            {/* Schritt 3: Schüler:innen */}
            {schritt === 3 && (
              <div>
                <h2 className="text-xl font-semibold text-ink-900 mb-2">Schüler:innen</h2>
                <p className="text-sm text-ink-500 mb-5">Du kannst Schüler:innen auch später hinzufügen.</p>

                {importListe.length > 0 ? (
                  <div className="border border-green-200 bg-green-50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-green-700 font-medium">{importListe.length} Schüler:innen importiert</p>
                    <ul className="text-xs text-green-600 mt-1 max-h-32 overflow-y-auto">
                      {importListe.map((s, i) => (
                        <li key={i}>{s.vorname} {s.nachname}</li>
                      ))}
                    </ul>
                    <button className="text-xs text-green-700 underline mt-2" onClick={() => setImportListe([])}>Zurücksetzen</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1">
                        Manuell eingeben <span className="text-ink-400">(Vorname Nachname, eine Person pro Zeile)</span>
                      </label>
                      <textarea
                        className="input resize-none"
                        rows={5}
                        value={schuelerText}
                        onChange={e => setSchuelerText(e.target.value)}
                        placeholder={'Anna Bauer\nMax Huber\nLisa Mair'}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-paper-200" />
                      <span className="text-xs text-ink-400">oder</span>
                      <div className="flex-1 h-px bg-paper-200" />
                    </div>
                    <button className="btn-secondary w-full" onClick={dateiImportieren}>
                      CSV / Excel importieren
                    </button>
                  </div>
                )}

                {fehler && <p className="text-red-500 text-sm mt-3">{fehler}</p>}
                <div className="flex gap-3 mt-6">
                  <button className="btn-secondary flex-1" onClick={zurueck}>Zurück</button>
                  <button className="btn-secondary" onClick={weiter}>Überspringen</button>
                  <button className="btn-primary flex-1" onClick={schuelerWeiter} disabled={loading}>
                    {loading ? 'Speichern…' : 'Weiter'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Schritt 4: Fertig */}
        {schritt === 4 && (
          <div className="bg-white dark:bg-ink-900 rounded-2xl p-8 text-center border border-paper-100 dark:border-ink-800" style={{boxShadow: '0 24px 64px -12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.03)'}}>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-ink-900 mb-2">Alles bereit!</h2>
            <p className="text-ink-500 mb-8">
              Klasse <strong>{klasse}</strong>, Fach <strong>{fach}</strong> – los geht's.
            </p>
            <button className="btn-primary px-8 py-3 text-base" onClick={abschliessen} disabled={loading}>
              {loading ? 'Laden…' : 'Notentabelle öffnen'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

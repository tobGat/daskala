import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

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
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Farbe</label>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
        {FARB_PALETTE.map(farbe => (
          <button
            key={farbe}
            type="button"
            className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${value === farbe ? 'ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 scale-110' : ''}`}
            style={{ backgroundColor: farbe }}
            onClick={() => onChange(farbe)}
          />
        ))}
        <button
          type="button"
          className={`w-5 h-5 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center text-zinc-400 text-[9px] transition-colors hover:border-zinc-400 ${!value ? 'ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500' : ''}`}
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
  const { closeModal, aktuellesSchuljahr, ladeKlassen } = useStore()
  const [name, setName] = useState('')
  const [farbe, setFarbe] = useState(FARB_PALETTE[0])
  const [loading, setLoading] = useState(false)

  const handleSpeichern = async () => {
    if (!name.trim() || !aktuellesSchuljahr) return
    setLoading(true)
    await window.api.klassen.create({ schuljahrId: aktuellesSchuljahr.id, name: name.trim(), farbe })
    await ladeKlassen(aktuellesSchuljahr.id)
    closeModal()
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-5">Neue Klasse</h2>
        <input
          className="input mb-5"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Klassenname, z.B. 2b"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSpeichern() }}
        />
        <div className="mb-5">
          <FarbPicker value={farbe} onChange={setFarbe} />
        </div>
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
export function FachHinzufuegenModal() {
  const { closeModal, aktiveKlasse, ladeKlassen, aktuellesSchuljahr } = useStore()
  const [name, setName] = useState('')
  const [farbe, setFarbe] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSpeichern = async () => {
    if (!name.trim() || !aktiveKlasse) return
    setLoading(true)
    await window.api.faecher.create({ klasseId: aktiveKlasse.id, name: name.trim(), farbe })
    await ladeKlassen(aktuellesSchuljahr.id)
    closeModal()
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-5">Neues Fach</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Für Klasse {aktiveKlasse?.name}</p>
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

// ─── Schüler:innen verwalten ─────────────────────────────────────────────────
export function SchuelerVerwaltenModal() {
  const { closeModal, aktiveKlasse, schueler, ladeSchueler } = useStore()
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [importListe, setImportListe] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('liste') // 'liste' | 'hinzufuegen' | 'import'
  const [loeschenId, setLoeschenId] = useState(null)

  const handleHinzufuegen = async () => {
    if (!vorname.trim() && !nachname.trim()) return
    setLoading(true)
    try {
      await window.api.schueler.create({
        klasseId: aktiveKlasse.id,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
      })
      await ladeSchueler()
      setVorname('')
      setNachname('')
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
    await window.api.schueler.importBatch(aktiveKlasse.id, importListe)
    await ladeSchueler()
    setImportListe([])
    setTab('liste')
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Schüler:innen – {aktiveKlasse?.name}
          </h2>
          <button className="text-zinc-400 hover:text-zinc-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {[['liste', 'Liste'], ['hinzufuegen', 'Hinzufügen'], ['import', 'Importieren']].map(([val, label]) => (
            <button
              key={val}
              className={`flex-1 py-1.5 text-sm rounded font-medium transition-colors
                ${tab === val
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400'}`}
              onClick={() => setTab(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Liste */}
        {tab === 'liste' && (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {schueler.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">Noch keine Schüler:innen</p>
            ) : schueler.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <span className="text-sm text-zinc-900 dark:text-white flex-1">
                  {s.nachname} {s.vorname}
                </span>
                {loeschenId === s.id && (
                  <>
                    <button
                      className="text-xs px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
                      onClick={() => handleLoeschen(s.id)}
                    >Entfernen</button>
                    <button
                      className="text-xs px-1.5 py-0.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
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
                      : 'border-zinc-200 text-zinc-400 dark:border-zinc-600 hover:border-amber-300 hover:text-amber-600'
                  }`}
                >LS</button>
                <button
                  title="Legasthenie"
                  onClick={() => handleToggle(s, 'legasthenie')}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    s.legasthenie
                      ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400'
                      : 'border-zinc-200 text-zinc-400 dark:border-zinc-600 hover:border-violet-300 hover:text-violet-600'
                  }`}
                >LEG</button>
                <button
                  title="Sonderpädagogischer Förderbedarf"
                  onClick={() => handleToggle(s, 'spf')}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    s.spf
                      ? 'bg-rose-100 border-rose-300 text-rose-700 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400'
                      : 'border-zinc-200 text-zinc-400 dark:border-zinc-600 hover:border-rose-300 hover:text-rose-600'
                  }`}
                >SPF</button>
                {loeschenId !== s.id && (
                  <button
                    className="text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 text-sm px-1 transition-colors"
                    onClick={() => setLoeschenId(s.id)}
                    title="Entfernen"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Manuell hinzufügen */}
        {tab === 'hinzufuegen' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Vorname</label>
                <input
                  className="input"
                  value={vorname}
                  onChange={e => setVorname(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleHinzufuegen() }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nachname</label>
                <input
                  className="input"
                  value={nachname}
                  onChange={e => setNachname(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleHinzufuegen() }}
                />
              </div>
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleHinzufuegen}
              disabled={loading || (!vorname.trim() && !nachname.trim())}
            >
              Hinzufügen
            </button>
            <div className="text-xs text-zinc-400 text-center">
              {schueler.length} Schüler:innen in der Klasse
            </div>
          </div>
        )}

        {/* Import */}
        {tab === 'import' && (
          <div className="space-y-3">
            {importListe.length === 0 ? (
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
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
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-700">
            <button className="btn-secondary w-full" onClick={closeModal}>Schließen</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Gewichtung anpassen (fach-spezifisch) ───────────────────────────────────
export function GewichtungModal() {
  const { closeModal, modalData: fach, gewichtungGlobal, ladeKlassen, aktuellesSchuljahr } = useStore()

  const [gew, setGew] = useState({
    SA: ((fach?.gewichtung_sa ?? gewichtungGlobal['SA'] ?? 0.4) * 100),
    T: ((fach?.gewichtung_t ?? gewichtungGlobal['T'] ?? 0.3) * 100),
    MA: ((fach?.gewichtung_ma ?? gewichtungGlobal['MA'] ?? 0.2) * 100),
    HÜ: ((fach?.gewichtung_hue ?? gewichtungGlobal['HÜ'] ?? 0.1) * 100),
  })
  const [loading, setLoading] = useState(false)

  const gesamt = Object.values(gew).reduce((a, b) => a + b, 0)
  const katLabel = { SA: 'Schularbeiten', T: 'Tests', MA: 'Mitarbeit', 'HÜ': 'Hausübungen' }

  const handleSpeichern = async () => {
    if (Math.abs(gesamt - 100) > 0.5) return
    if (!fach) return
    setLoading(true)
    await window.api.faecher.updateGewichtung(fach.id, {
      sa: gew.SA / 100,
      t: gew.T / 100,
      ma: gew.MA / 100,
      hue: gew['HÜ'] / 100,
      custom: null,
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
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Gewichtung anpassen</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">für {fach?.name}</p>

        <div className="space-y-3 mb-4">
          {Object.entries(katLabel).map(([kat, label]) => (
            <div key={kat} className="flex items-center gap-3">
              <span className="text-sm text-zinc-600 dark:text-zinc-400 w-28">{label}</span>
              <input
                type="range" min="0" max="100" step="5"
                className="flex-1"
                value={gew[kat]}
                onChange={e => setGew(prev => ({ ...prev, [kat]: parseFloat(e.target.value) }))}
              />
              <span className="text-sm font-medium w-12 text-right text-zinc-900 dark:text-white">
                {gew[kat]}%
              </span>
            </div>
          ))}
        </div>

        <p className={`text-sm mb-5 ${Math.abs(gesamt - 100) > 0.5 ? 'text-red-500' : 'text-green-600'}`}>
          Gesamt: {gesamt.toFixed(0)}% {Math.abs(gesamt - 100) <= 0.5 ? '✓' : '(muss 100% sein)'}
        </p>

        <div className="flex gap-3">
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

  const [schuelerDaten, setSchuelerDaten] = useState([]) // { schueler, klasse, aktion, neueKlasse, neuerKlassenName }
  const [neuesSchuljahr, setNeuesSchuljahr] = useState('')
  const [loading, setLoading] = useState(false)
  const [schritt, setSchritt] = useState('vorbereitung') // 'vorbereitung' | 'bestaetigung'

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

  // Schüler:innen laden
  useEffect(() => {
    const laden = async () => {
      const daten = []
      for (const klasse of klassen) {
        const schuelerListe = await window.api.schueler.getAll(klasse.id)
        // Automatisch neuen Klassennamen generieren (Zahl inkrementieren)
        const neuerName = klasse.name.replace(/(\d+)/, m => String(parseInt(m) + 1))
        for (const s of schuelerListe) {
          daten.push({
            schueler: s,
            klasse,
            aktion: 'bleibt',
            neueKlasse: neuerName,
            neuerKlassenName: neuerName,
          })
        }
      }
      setSchuelerDaten(daten)
    }
    laden()
  }, [klassen])

  const handleAktionChange = (schuelerId, aktion) => {
    setSchuelerDaten(prev => prev.map(d =>
      d.schueler.id === schuelerId ? { ...d, aktion } : d
    ))
  }

  const handleDurchfuehren = async () => {
    if (!aktuellesSchuljahr || !neuesSchuljahr.trim()) return
    setLoading(true)
    try {
      // Klassen-Namen deduplizieren
      const klassenNamen = {}
      for (const d of schuelerDaten) {
        if (!klassenNamen[d.klasse.id]) {
          klassenNamen[d.klasse.id] = d.neuerKlassenName
        }
      }

      const zuordnungen = schuelerDaten.map(d => ({
        schuelerId: d.schueler.id,
        alteKlasseId: d.klasse.id,
        aktion: d.aktion,
        neueKlasse: d.neuerKlassenName,
        neuerKlassenName: klassenNamen[d.klasse.id],
      }))

      const neueId = await window.api.jahresabschluss.neuesSchuljahr({
        altesSchuljahreId: aktuellesSchuljahr.id,
        neueBezeichnung: neuesSchuljahr.trim(),
        schuelerZuordnungen: zuordnungen,
      })

      await ladeSchuljahrDaten(neueId)
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  // Nach Klassen gruppieren
  const nachKlassen = {}
  for (const d of schuelerDaten) {
    const kid = d.klasse.id
    if (!nachKlassen[kid]) nachKlassen[kid] = { klasse: d.klasse, schueler: [] }
    nachKlassen[kid].schueler.push(d)
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Klassen vorrücken</h2>
          <button className="text-zinc-400 hover:text-zinc-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        {/* Neues Schuljahr */}
        <div className="mb-5 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Neues Schuljahr</label>
            <input
              className="input"
              value={neuesSchuljahr}
              onChange={e => setNeuesSchuljahr(e.target.value)}
              placeholder="z.B. 2025/26"
            />
          </div>
        </div>

        {/* Schüler:innen pro Klasse */}
        <div className="max-h-96 overflow-y-auto space-y-4 mb-5">
          {Object.values(nachKlassen).map(({ klasse, schueler: sl }) => (
            <div key={klasse.id}>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{klasse.name}</h3>
                <span className="text-zinc-400">→</span>
                <input
                  className="input py-1 text-sm w-24"
                  value={sl[0]?.neuerKlassenName ?? ''}
                  onChange={e => {
                    const val = e.target.value
                    setSchuelerDaten(prev => prev.map(d =>
                      d.klasse.id === klasse.id ? { ...d, neuerKlassenName: val } : d
                    ))
                  }}
                  placeholder="Neuer Name"
                />
              </div>
              <div className="space-y-1 pl-2">
                {sl.map(d => (
                  <div key={d.schueler.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-zinc-900 dark:text-white">
                      {d.schueler.nachname} {d.schueler.vorname}
                    </span>
                    <select
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-800 focus:outline-none"
                      value={d.aktion}
                      onChange={e => handleAktionChange(d.schueler.id, e.target.value)}
                    >
                      <option value="bleibt">bleibt (vorrücken)</option>
                      <option value="ausgeschieden">scheidet aus</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-5">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Alle Daten des aktuellen Schuljahrs werden archiviert und sind danach schreibgeschützt.
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={closeModal}>Abbrechen</button>
          <button
            className="btn-primary flex-1"
            onClick={handleDurchfuehren}
            disabled={loading || !neuesSchuljahr.trim()}
          >
            {loading ? 'Vorrücken…' : 'Schuljahr abschließen & vorrücken'}
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
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Daten exportieren</h2>
          <button className="text-zinc-400 hover:text-zinc-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        <div className="space-y-2 mb-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide font-medium mb-3">Notenübersicht – alle Klassen & Fächer</p>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
            onClick={handlePdf}
            disabled={laden !== false}
          >
            <span className="text-lg">📄</span>
            <div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {laden === 'pdf' ? 'Exportieren…' : 'Als PDF exportieren'}
              </div>
              <div className="text-xs text-zinc-400">Übersichtstabellen pro Klasse und Fach (A4 quer)</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
            onClick={handleExcel}
            disabled={laden !== false}
          >
            <span className="text-lg">📊</span>
            <div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {laden === 'excel' ? 'Exportieren…' : 'Als Excel exportieren'}
              </div>
              <div className="text-xs text-zinc-400">Ein Tabellenblatt pro Klasse und Fach</div>
            </div>
          </button>
        </div>

        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide font-medium mb-3">Vollständiges Backup</p>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
            onClick={handleJson}
            disabled={laden !== false}
          >
            <span className="text-lg">💾</span>
            <div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {laden === 'json' ? 'Exportieren…' : 'Als JSON exportieren'}
              </div>
              <div className="text-xs text-zinc-400">Alle Daten für Import/Backup</div>
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

// ─── Archiv-Modal ─────────────────────────────────────────────────────────────
export function ArchivModal() {
  const { closeModal, schuljahre } = useStore()
  const archivierteSj = schuljahre.filter(s => s.archiviert)

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Archiv</h2>
          <button className="text-zinc-400 hover:text-zinc-600 text-xl" onClick={closeModal}>✕</button>
        </div>

        {archivierteSj.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-6">Noch keine archivierten Schuljahre</p>
        ) : (
          <div className="space-y-2">
            {archivierteSj.map(sj => (
              <div key={sj.id} className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{sj.bezeichnung}</span>
                <span className="text-xs text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded">Archiviert</span>
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

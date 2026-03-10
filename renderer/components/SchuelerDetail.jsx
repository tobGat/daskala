import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'

function noteKlasse(n) {
  const num = Math.round(n)
  if (num === 1) return 'text-green-600 font-bold'
  if (num === 2) return 'text-green-500'
  if (num === 3) return 'text-yellow-500'
  if (num === 4) return 'text-orange-500'
  if (num === 5) return 'text-red-600 font-bold'
  return ''
}

export default function SchuelerDetail() {
  const {
    detailSchueler, closeDetail,
    faecher, aktivesFach, setAktivesFach,
    spalten, eintraege, zeugnisnoten,
    einstellungen,
  } = useStore()

  const [notizText, setNotizText] = useState('')
  const [detailFach, setDetailFach] = useState(null)
  const notizTimerRef = useRef(null)

  useEffect(() => {
    if (aktivesFach) setDetailFach(aktivesFach)
  }, [aktivesFach])

  useEffect(() => {
    if (!detailSchueler || !detailFach) return
    window.api.notizen.get(detailSchueler.id, detailFach.id).then(text => {
      setNotizText(text ?? '')
    })
  }, [detailSchueler, detailFach])

  if (!detailSchueler) return null

  const handleNotizChange = (e) => {
    setNotizText(e.target.value)
    if (notizTimerRef.current) clearTimeout(notizTimerRef.current)
    notizTimerRef.current = setTimeout(() => {
      if (detailSchueler && detailFach) {
        window.api.notizen.set(detailSchueler.id, detailFach.id, e.target.value)
      }
    }, 500)
  }

  const handleFachWechsel = async (fachId) => {
    const fach = faecher.find(f => f.id === parseInt(fachId))
    if (fach) {
      setDetailFach(fach)
      const text = await window.api.notizen.get(detailSchueler.id, fach.id)
      setNotizText(text ?? '')
    }
  }

  // Daten für das aktuelle Detail-Fach
  const fachSpalten = spalten // schon für aktives Fach gefiltert (Store-State)
  const maPlusWert = parseFloat(einstellungen['ma_plus_wert'] ?? '1')
  const maMinusWert = parseFloat(einstellungen['ma_minus_wert'] ?? '5')

  // MA-Einträge
  const maSpalten = fachSpalten.filter(s => s.kategorie === 'MA')
  const maWerte = maSpalten.map(s => eintraege[`${s.id}_${detailSchueler.id}`] ?? '')
  const maVorhanden = maWerte.filter(v => v !== '')
  const maPositiv = maWerte.filter(v => v === '+').length
  const maGesamt = maVorhanden.length
  const maProzent = maGesamt > 0 ? Math.round(maPositiv / maGesamt * 100) : null

  // HÜ-Einträge
  const hueSpalten = fachSpalten.filter(s => s.kategorie === 'HÜ')
  const hueWerte = hueSpalten.map(s => eintraege[`${s.id}_${detailSchueler.id}`] ?? '')
  const hueVorhanden = hueWerte.filter(v => v !== '')
  const huePositiv = hueVorhanden.filter(v => v === '✓').length
  const hueGesamt = hueVorhanden.length

  // SA-Einträge
  const saSpalten = fachSpalten.filter(s => s.kategorie === 'SA')
  const saWerte = saSpalten
    .map(s => ({ datum: s.datum, wert: eintraege[`${s.id}_${detailSchueler.id}`] ?? '' }))
    .filter(e => e.wert)

  // T-Einträge
  const tSpalten = fachSpalten.filter(s => s.kategorie === 'T')
  const tWerte = tSpalten
    .map(s => ({ datum: s.datum, kuerzel: s.kuerzel, wert: eintraege[`${s.id}_${detailSchueler.id}`] ?? '' }))
    .filter(e => e.wert)

  // Zeugnisnoten
  const znS1 = zeugnisnoten[`${detailSchueler.id}_1`]
  const znS2 = zeugnisnoten[`${detailSchueler.id}_2`]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-transparent" onClick={closeDetail} />

      {/* Panel */}
      <div className="slide-over slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700/60">
          <button
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none"
            onClick={closeDetail}
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-semibold text-zinc-900 dark:text-white truncate">
                {detailSchueler.nachname} {detailSchueler.vorname}
              </h2>
              {detailSchueler.lernschwaeche ? <span title="Lernschwäche" className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">LS</span> : null}
              {detailSchueler.legasthenie   ? <span title="Legasthenie"  className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">LEG</span> : null}
              {detailSchueler.spf           ? <span title="Sonderpädagogischer Förderbedarf" className="text-[9px] font-bold px-1 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">SPF</span> : null}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {useStore.getState().aktiveKlasse?.name}
            </p>
          </div>
          {/* Fach-Auswahl */}
          <select
            className="text-sm border border-zinc-200 dark:border-zinc-700/60 rounded px-2 py-1 bg-white dark:bg-zinc-800 dark:text-white focus:outline-none"
            value={detailFach?.id ?? ''}
            onChange={e => handleFachWechsel(e.target.value)}
          >
            {faecher.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Mitarbeit */}
          {maSpalten.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Mitarbeit</h3>
              <div className="flex flex-wrap gap-1 mb-2">
                {maWerte.map((w, i) => (
                  <span key={i} className={`w-7 h-7 flex items-center justify-center rounded text-sm font-medium
                    ${w === '+' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400'
                      : w === '-' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400'
                      : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}>
                    {w === '+' ? '+' : w === '-' ? '−' : '·'}
                  </span>
                ))}
              </div>
              {maProzent !== null && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium">{maPositiv}/{maGesamt}</span> positiv
                  <span className="text-zinc-400 ml-2">({maProzent}%)</span>
                </p>
              )}
            </section>
          )}

          {/* Hausübungen */}
          {hueSpalten.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Hausübungen</h3>
              <div className="flex flex-wrap gap-1 mb-2">
                {hueVorhanden.map((w, i) => (
                  <span key={i} className={`w-7 h-7 flex items-center justify-center rounded text-sm
                    ${w === '✓' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400'}`}>
                    {w}
                  </span>
                ))}
              </div>
              {hueGesamt > 0 && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium">{huePositiv}/{hueGesamt}</span> gemacht
                </p>
              )}
            </section>
          )}

          {/* Schularbeiten */}
          {saWerte.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Schularbeiten</h3>
              <div className="space-y-1">
                {saWerte.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      SA {e.datum ? new Date(e.datum).toLocaleDateString('de-AT') : '–'}
                    </span>
                    <span className={`text-sm font-bold ${noteKlasse(e.wert)}`}>{e.wert}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tests */}
          {tWerte.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Tests</h3>
              <div className="space-y-1">
                {tWerte.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {e.kuerzel} {e.datum ? new Date(e.datum).toLocaleDateString('de-AT') : '–'}
                    </span>
                    <span className={`text-sm font-bold ${noteKlasse(e.wert)}`}>{e.wert}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Zeugnisnoten */}
          <section className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-3">Zeugnisnoten</h3>
            <div className="space-y-2">
              {[1, 2].map(sem => {
                const zn = sem === 1 ? znS1 : znS2
                const noteManuell = zn?.note_manuell
                const noteBerechnet = zn?.note_berechnet
                const anzeige = noteManuell ?? (noteBerechnet ? Math.round(noteBerechnet) : null)
                return (
                  <div key={sem} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Semester {sem}</span>
                    <div className="text-right">
                      {anzeige ? (
                        <>
                          <span className={`text-lg font-bold ${noteKlasse(anzeige)}`}>{anzeige}</span>
                          {noteBerechnet && (
                            <span className="text-xs text-zinc-400 ml-2">(Ø {noteBerechnet.toFixed(1)})</span>
                          )}
                          {noteManuell && (
                            <span className="text-xs text-yellow-500 ml-1">manuell</span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-zinc-400">–</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Notizen */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Notizen</h3>
            <textarea
              className="input resize-none text-sm"
              rows={4}
              value={notizText}
              onChange={handleNotizChange}
              placeholder="Freitext…"
            />
          </section>
        </div>
      </div>
    </>
  )
}

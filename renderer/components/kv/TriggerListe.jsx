import React, { useEffect, useState, useCallback } from 'react'

const TYP_LABEL = {
  fruehwarnung:     'Frühwarnung',
  fehlstunden_15:   'Fehlstunden ≥ 15',
  fehlstunden_30:   'Fehlstunden ≥ 30',
  vorfall:          'Vorfall',
  elternkontakt:    'Offener Rückruf',
  kindeswohl:       'Kindeswohl',
  schulveranstaltung:'Schulveranstaltung',
}

const SCHWEREGRAD = {
  critical: { label: 'Kritisch', bg: 'bg-red-100 dark:bg-red-900/40',     text: 'text-red-700 dark:text-red-300',     emoji: '🚨' },
  warn:     { label: 'Warnung',  bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', emoji: '⚠️' },
  info:     { label: 'Info',     bg: 'bg-sky-100 dark:bg-sky-900/40',     text: 'text-sky-700 dark:text-sky-300',     emoji: 'ℹ️' },
}

function TriggerKarte({ trigger, onReagieren, onDelete }) {
  const stil = SCHWEREGRAD[trigger.schweregrad] ?? SCHWEREGRAD.info
  const [reaktion, setReaktion] = useState('')
  const [zeigeForm, setZeigeForm] = useState(false)
  const erstellt = new Date(trigger.erstellt_am).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })

  return (
    <div className="daskala-card p-3.5 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${stil.bg}`}>
          {stil.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wider ${stil.text}`}>
              {TYP_LABEL[trigger.typ] ?? trigger.typ}
            </span>
            {(trigger.schueler_vorname || trigger.schueler_nachname) && (
              <span className="text-xs font-semibold text-ink-800 dark:text-paper-200">
                · {trigger.schueler_nachname} {trigger.schueler_vorname}
              </span>
            )}
            <span className="text-[10px] text-ink-400 ml-auto tabular-nums">{erstellt}</span>
          </div>
          {trigger.ausloeser && (
            <p className="text-sm text-ink-700 dark:text-paper-200 mt-0.5 leading-snug">{trigger.ausloeser}</p>
          )}
          {trigger.beschreibung && (
            <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5 leading-snug">{trigger.beschreibung}</p>
          )}
        </div>
      </div>

      {zeigeForm ? (
        <div className="border-t border-paper-200 dark:border-ink-800 pt-2">
          <textarea
            className="input resize-none text-sm"
            rows={2}
            value={reaktion}
            onChange={e => setReaktion(e.target.value)}
            placeholder="Was wurde getan? (Pflicht)"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button className="btn-secondary flex-1 text-xs" onClick={() => { setZeigeForm(false); setReaktion('') }}>
              Abbrechen
            </button>
            <button
              className="btn-primary flex-1 text-xs"
              disabled={!reaktion.trim()}
              onClick={async () => {
                await onReagieren(trigger.id, reaktion.trim())
                setZeigeForm(false)
                setReaktion('')
              }}
            >
              Abgehakt ✓
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            className="btn-soft text-xs flex-1"
            onClick={() => setZeigeForm(true)}
          >
            Reagieren & Erledigen
          </button>
          <button
            className="text-xs text-ink-400 hover:text-red-500 px-2"
            onClick={() => { if (confirm('Trigger wirklich löschen?')) onDelete(trigger.id) }}
            title="Trigger löschen"
          >✕</button>
        </div>
      )}
    </div>
  )
}

function ArchivKarte({ trigger }) {
  const stil = SCHWEREGRAD[trigger.schweregrad] ?? SCHWEREGRAD.info
  const erstellt = new Date(trigger.erstellt_am).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const reagiert = trigger.reagiert_am
    ? new Date(trigger.reagiert_am).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : ''

  return (
    <div className="bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-800 rounded-xl p-3 opacity-70">
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${stil.bg}`}>
          {stil.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${stil.text}`}>
              {TYP_LABEL[trigger.typ] ?? trigger.typ}
            </span>
            {(trigger.schueler_vorname || trigger.schueler_nachname) && (
              <span className="text-xs text-ink-700 dark:text-paper-200">{trigger.schueler_nachname} {trigger.schueler_vorname}</span>
            )}
            <span className="text-[10px] text-ink-400 ml-auto tabular-nums">{erstellt} → {reagiert}</span>
          </div>
          {trigger.ausloeser && (
            <p className="text-xs text-ink-600 dark:text-ink-400 mt-0.5">{trigger.ausloeser}</p>
          )}
          {trigger.reaktion && (
            <p className="text-[11px] text-ink-500 dark:text-ink-500 mt-1 italic border-l-2 border-mint-300 dark:border-mint-700 pl-2">
              ✓ {trigger.reaktion}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TriggerListe({ klasse }) {
  const [aktive, setAktive] = useState([])
  const [archiv, setArchiv] = useState([])
  const [tab, setTab] = useState('aktiv')  // aktiv | archiv
  const [loading, setLoading] = useState(true)

  const laden = useCallback(async () => {
    if (!klasse?.id) return
    setLoading(true)
    try {
      const [a, ar] = await Promise.all([
        window.api.kv.trigger.getAlle(klasse.id, { archiviert: 0 }),
        window.api.kv.trigger.getAlle(klasse.id, { archiviert: 1 }),
      ])
      setAktive(a)
      setArchiv(ar)
    } finally {
      setLoading(false)
    }
  }, [klasse?.id])

  useEffect(() => { laden() }, [laden])

  const handleReagieren = async (id, reaktion) => {
    await window.api.kv.trigger.reagieren(id, reaktion)
    await laden()
  }
  const handleDelete = async (id) => {
    await window.api.kv.trigger.delete(id)
    await laden()
  }

  // Gruppierung nach Schweregrad
  const critical = aktive.filter(t => t.schweregrad === 'critical')
  const warn     = aktive.filter(t => t.schweregrad === 'warn')
  const info     = aktive.filter(t => t.schweregrad === 'info')

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl mx-auto">
        {/* Tab-Switcher */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-0.5 bg-paper-100 dark:bg-ink-800 rounded-xl p-0.5">
            <button
              className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all
                ${tab === 'aktiv'
                  ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
                  : 'text-ink-500 dark:text-ink-400'}`}
              onClick={() => setTab('aktiv')}
            >
              Offen ({aktive.length})
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all
                ${tab === 'archiv'
                  ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
                  : 'text-ink-500 dark:text-ink-400'}`}
              onClick={() => setTab('archiv')}
            >
              Archiv ({archiv.length})
            </button>
          </div>
        </div>

        {loading && (<p className="text-sm text-ink-400 text-center py-6">Lade…</p>)}

        {!loading && tab === 'aktiv' && (
          <div className="space-y-4">
            {aktive.length === 0 && (
              <div className="text-center py-12 daskala-card">
                <div className="text-4xl mb-2">🌿</div>
                <p className="text-sm text-ink-500">Keine offenen Trigger — alles im grünen Bereich.</p>
              </div>
            )}
            {critical.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 mb-2">🚨 Kritisch ({critical.length})</p>
                <div className="space-y-2">
                  {critical.map(t => <TriggerKarte key={t.id} trigger={t} onReagieren={handleReagieren} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
            {warn.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">⚠️ Warnung ({warn.length})</p>
                <div className="space-y-2">
                  {warn.map(t => <TriggerKarte key={t.id} trigger={t} onReagieren={handleReagieren} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
            {info.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 mb-2">ℹ️ Info ({info.length})</p>
                <div className="space-y-2">
                  {info.map(t => <TriggerKarte key={t.id} trigger={t} onReagieren={handleReagieren} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
          </div>
        )}

        {!loading && tab === 'archiv' && (
          <div className="space-y-2">
            {archiv.length === 0
              ? <p className="text-sm text-ink-400 text-center py-6 italic">Noch nichts archiviert.</p>
              : archiv.map(t => <ArchivKarte key={t.id} trigger={t} />)
            }
          </div>
        )}
      </div>
    </div>
  )
}

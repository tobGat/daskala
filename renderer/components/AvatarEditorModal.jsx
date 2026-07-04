import React, { useMemo, useState } from 'react'
import { createAvatar } from '@dicebear/core'
import { lorelei } from '@dicebear/collection'
import useStore from '../store/useStore'
import { SKIN, HAIR, variantsOf, parseAvatarOptions, hashFromString } from '../utils/avatar'

const MERKMALE = [
  { key: 'head',     label: 'Gesichtsform' },
  { key: 'hair',     label: 'Haare' },
  { key: 'eyes',     label: 'Augen' },
  { key: 'eyebrows', label: 'Augenbrauen' },
  { key: 'nose',     label: 'Nase' },
  { key: 'mouth',    label: 'Mund' },
]
const OPTIONAL = [
  { key: 'glasses',  prob: 'glassesProbability',  label: 'Brille' },
  { key: 'earrings', prob: 'earringsProbability',  label: 'Ohrringe' },
  { key: 'beard',    prob: 'beardProbability',     label: 'Bart' },
]
const ALL_CATS = [...MERKMALE.map(m => m.key), ...OPTIONAL.map(o => o.key)]

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]

// Deterministischer, aber expliziter Startzustand aus dem Namen (nah am Auto-Avatar).
function seedToOptions(schueler) {
  const name = (schueler?.vorname ?? '') + (schueler?.nachname ?? '')
  const hc = HAIR[hashFromString('hair' + name) % HAIR.length]
  const o = { skinColor: [SKIN[hashFromString('skin' + name) % SKIN.length]], hairColor: [hc], eyebrowsColor: [hc], glassesProbability: 0, earringsProbability: 0, beardProbability: 0 }
  for (const cat of ALL_CATS) {
    const vs = variantsOf(cat)
    if (vs.length) o[cat] = [vs[hashFromString(cat + name) % vs.length]]
  }
  return o
}

const LABEL_MAP = Object.fromEntries(MERKMALE.map(m => [m.key, m.label]))

// Übersichts-Picker: zeigt alle Varianten einer Kategorie als Vorschau-Thumbnails.
function VariantPicker({ cat, opts, onPick, onClose }) {
  const variants = variantsOf(cat)
  const current = opts[cat]?.[0]
  const thumbs = useMemo(
    () => variants.map(v => {
      let svg = ''
      try { svg = createAvatar(lorelei, { size: 56, ...opts, [cat]: [v] }).toString() } catch { svg = '' }
      return { v, svg }
    }),
    [cat, JSON.stringify(opts)]
  )
  return (
    <div className="modal-overlay" style={{ zIndex: 70 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-800 dark:text-paper-100">{LABEL_MAP[cat] ?? cat} wählen</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-sm">✕</button>
        </div>
        <div className="grid gap-2 max-h-[62vh] overflow-y-auto pr-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {thumbs.map(({ v, svg }) => (
            <button key={v}
              onClick={() => onPick(v)}
              className={`aspect-square flex items-center justify-center rounded-lg border-2 bg-paper-100 dark:bg-ink-800 transition-colors ${v === current ? 'border-coral-500' : 'border-transparent hover:border-coral-300'}`}
            >
              <span className="inline-block" style={{ width: 56, height: 56 }} dangerouslySetInnerHTML={{ __html: svg }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AvatarEditorModal({ schueler, onClose, onSaved }) {
  const [opts, setOpts] = useState(() => parseAvatarOptions(schueler) ?? seedToOptions(schueler))
  const [saving, setSaving] = useState(false)
  const [pickerCat, setPickerCat] = useState(null)

  const previewSvg = useMemo(() => {
    try { return createAvatar(lorelei, { size: 160, ...opts }).toString() } catch { return '' }
  }, [opts])

  const setCat = (cat, variant) => setOpts(o => ({ ...o, [cat]: [variant] }))
  const cycle = (cat, dir) => {
    const vs = variantsOf(cat); if (!vs.length) return
    const idx = Math.max(0, vs.indexOf(opts[cat]?.[0]))
    setCat(cat, vs[(idx + dir + vs.length) % vs.length])
  }
  const toggleOptional = (opt) => setOpts(prev => {
    const an = prev[opt.prob] === 100
    const next = { ...prev, [opt.prob]: an ? 0 : 100 }
    if (!an && !prev[opt.key]?.length) {
      const vs = variantsOf(opt.key); if (vs.length) next[opt.key] = [vs[0]]
    }
    return next
  })

  const wuerfeln = () => {
    const hc = rand(HAIR)
    const o = { skinColor: [rand(SKIN)], hairColor: [hc], eyebrowsColor: [hc] }
    for (const m of MERKMALE) { const vs = variantsOf(m.key); if (vs.length) o[m.key] = [rand(vs)] }
    for (const opt of OPTIONAL) {
      o[opt.prob] = Math.random() < (opt.key === 'beard' ? 0.2 : 0.35) ? 100 : 0
      const vs = variantsOf(opt.key); if (vs.length) o[opt.key] = [rand(vs)]
    }
    setOpts(o)
  }

  const speichern = async () => {
    setSaving(true)
    try {
      await window.api.schueler.setAvatar(schueler.id, JSON.stringify({ options: opts }))
      await onSaved?.()
      onClose()
    } catch (e) {
      console.error('Avatar speichern:', e)
      useStore.getState().pushToast?.('Avatar speichern fehlgeschlagen.', 'error')
      setSaving(false)
    }
  }
  const zuruecksetzen = async () => {
    setSaving(true)
    try { await window.api.schueler.setAvatar(schueler.id, null); await onSaved?.(); onClose() }
    catch (e) { console.error('Avatar zurücksetzen:', e); setSaving(false) }
  }

  const MerkmalReihe = ({ cat, label }) => {
    const vs = variantsOf(cat)
    const idx = Math.max(0, vs.indexOf(opts[cat]?.[0]))
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-600 dark:text-ink-400 w-24 flex-shrink-0">{label}</span>
        <button className="w-7 h-7 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-100 dark:hover:bg-ink-800 flex-shrink-0" onClick={() => cycle(cat, -1)}>◀</button>
        <button className="flex-1 h-7 rounded-lg border border-paper-200 dark:border-ink-700 text-[11px] text-ink-500 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 tabular-nums" onClick={() => setPickerCat(cat)} title="Aus Übersicht wählen">{idx + 1}/{vs.length} · wählen</button>
        <button className="w-7 h-7 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-100 dark:hover:bg-ink-800 flex-shrink-0" onClick={() => cycle(cat, 1)}>▶</button>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 640 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">
            Avatar – {schueler?.vorname} {schueler?.nachname}
          </h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-sm">✕</button>
        </div>

        <div className="flex gap-5">
          {/* Vorschau */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="w-40 h-40 rounded-2xl overflow-hidden bg-paper-100 dark:bg-ink-800 border border-paper-200 dark:border-ink-700"
              dangerouslySetInnerHTML={{ __html: previewSvg }} />
            <button className="btn-secondary w-full text-sm" onClick={wuerfeln}>🎲 Würfeln</button>
          </div>

          {/* Steuerung */}
          <div className="flex-1 min-w-0 space-y-3 max-h-80 overflow-y-auto pr-1">
            {/* Hautfarbe */}
            <div>
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Hautfarbe</p>
              <div className="flex flex-wrap gap-1.5">
                {SKIN.map(hex => {
                  const aktiv = opts.skinColor?.[0] === hex
                  return (
                    <button key={hex}
                      onClick={() => setOpts(o => ({ ...o, skinColor: [hex] }))}
                      className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${aktiv ? 'ring-2 ring-offset-1 ring-coral-500' : 'border-paper-300 dark:border-ink-600'}`}
                      style={{ backgroundColor: '#' + hex }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Haarfarbe (Haare + Augenbrauen) */}
            <div>
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Haarfarbe</p>
              <div className="flex flex-wrap gap-1.5">
                {HAIR.map(hex => {
                  const aktiv = opts.hairColor?.[0] === hex
                  return (
                    <button key={hex}
                      onClick={() => setOpts(o => ({ ...o, hairColor: [hex], eyebrowsColor: [hex] }))}
                      className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${aktiv ? 'ring-2 ring-offset-1 ring-coral-500' : 'border-paper-300 dark:border-ink-600'}`}
                      style={{ backgroundColor: '#' + hex }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Merkmale */}
            <div className="space-y-1.5">
              {MERKMALE.map(m => <MerkmalReihe key={m.key} cat={m.key} label={m.label} />)}
            </div>

            {/* Accessoires */}
            <div>
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Accessoires</p>
              <div className="space-y-1.5">
                {OPTIONAL.map(opt => {
                  const an = opts[opt.prob] === 100
                  const vs = variantsOf(opt.key)
                  const idx = Math.max(0, vs.indexOf(opts[opt.key]?.[0]))
                  return (
                    <div key={opt.key} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleOptional(opt)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg border w-24 flex-shrink-0 text-left transition-colors ${an ? 'bg-coral-100 text-coral-700 border-coral-300 dark:bg-coral-900/40 dark:text-coral-300 dark:border-coral-700' : 'border-paper-200 dark:border-ink-700 text-ink-500 dark:text-ink-400'}`}
                      >
                        {an ? '✓ ' : ''}{opt.label}
                      </button>
                      {an && (
                        <>
                          <button className="w-7 h-7 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-100 dark:hover:bg-ink-800" onClick={() => cycle(opt.key, -1)}>◀</button>
                          <span className="text-[11px] text-ink-400 tabular-nums w-10 text-center">{idx + 1}/{vs.length}</span>
                          <button className="w-7 h-7 rounded-lg border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-100 dark:hover:bg-ink-800" onClick={() => cycle(opt.key, 1)}>▶</button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button className="btn-secondary text-sm" onClick={zuruecksetzen} disabled={saving} title="Zurück auf automatisches Gesicht aus dem Namen">Zurücksetzen</button>
          <button className="btn-secondary flex-1 text-sm" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn-primary flex-1 text-sm" onClick={speichern} disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>

      {pickerCat && (
        <VariantPicker
          cat={pickerCat}
          opts={opts}
          onPick={(v) => { setCat(pickerCat, v); setPickerCat(null) }}
          onClose={() => setPickerCat(null)}
        />
      )}
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import { SKIN, HAIR, MERKMALE, OPTIONAL, variantsOf, randomOptions, svgFromOptions, optionsToCode } from './avatar.js'

export default function App() {
  const [opts, setOpts] = useState(() => randomOptions())
  const [copied, setCopied] = useState(false)

  const svg = useMemo(() => svgFromOptions(opts, 200), [opts])
  const code = useMemo(() => optionsToCode(opts), [opts])

  const setCat = (cat, v) => setOpts(o => ({ ...o, [cat]: [v] }))
  const cycle = (cat, dir) => {
    const vs = variantsOf(cat); if (!vs.length) return
    const idx = Math.max(0, vs.indexOf(opts[cat]?.[0]))
    setCat(cat, vs[(idx + dir + vs.length) % vs.length])
  }
  const toggleOptional = (opt) => setOpts(prev => {
    const an = prev[opt.prob] === 100
    const next = { ...prev, [opt.prob]: an ? 0 : 100 }
    if (!an && !prev[opt.key]?.length) { const vs = variantsOf(opt.key); if (vs.length) next[opt.key] = [vs[0]] }
    return next
  })

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch { /* Fallback: der Code ist markierbar (user-select: all) */ }
  }

  return (
    <div className="view">
      <div className="brand">
        <div className="logo">🎨</div>
        <h1>Avatar-Werkstatt</h1>
        <p>Bau dein eigenes Gesicht und schick den Code deiner Lehrkraft.</p>
      </div>

      <div className="card glass-light">
        <div className="editor">
          <div className="preview-col">
            <div className="preview" dangerouslySetInnerHTML={{ __html: svg }} />
            <button className="btn btn-secondary btn-large" onClick={() => setOpts(randomOptions())}>🎲 Würfeln</button>
          </div>

          <div className="controls">
            <div>
              <div className="field-label">Hautfarbe</div>
              <div className="swatches">
                {SKIN.map(hex => (
                  <button
                    key={hex}
                    className={`swatch ${opts.skinColor?.[0] === hex ? 'active' : ''}`}
                    style={{ background: '#' + hex }}
                    onClick={() => setOpts(o => ({ ...o, skinColor: [hex] }))}
                    aria-label={'Hautfarbe ' + hex}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="field-label">Haarfarbe</div>
              <div className="swatches">
                {HAIR.map(hex => (
                  <button
                    key={hex}
                    className={`swatch ${opts.hairColor?.[0] === hex ? 'active' : ''}`}
                    style={{ background: '#' + hex }}
                    onClick={() => setOpts(o => ({ ...o, hairColor: [hex], eyebrowsColor: [hex] }))}
                    aria-label={'Haarfarbe ' + hex}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="field-label">Aussehen</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {MERKMALE.map(m => {
                  const vs = variantsOf(m.key)
                  const idx = Math.max(0, vs.indexOf(opts[m.key]?.[0]))
                  return (
                    <div className="pick-row" key={m.key}>
                      <span className="name">{m.label}</span>
                      <button className="arrow" onClick={() => cycle(m.key, -1)} aria-label="zurück">◀</button>
                      <span className="pick-mid">{idx + 1} / {vs.length}</span>
                      <button className="arrow" onClick={() => cycle(m.key, 1)} aria-label="weiter">▶</button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="field-label">Extras</div>
              <div className="toggles">
                {OPTIONAL.map(opt => {
                  const an = opts[opt.prob] === 100
                  return (
                    <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                      <button className={`toggle ${an ? 'on' : ''}`} onClick={() => toggleOptional(opt)}>
                        {an ? '✓ ' : ''}{opt.label}
                      </button>
                      {an && (
                        <>
                          <button className="arrow" onClick={() => cycle(opt.key, -1)} aria-label="zurück">◀</button>
                          <button className="arrow" onClick={() => cycle(opt.key, 1)} aria-label="weiter">▶</button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card glass" style={{ marginTop: '1.25rem' }}>
        <div className="field-label" style={{ color: '#fff', opacity: .85 }}>Dein Code</div>
        <div className="code">{code}</div>
        <div className="row" style={{ marginTop: '.9rem' }}>
          <button className="btn btn-primary" onClick={kopieren}>📋 Code kopieren</button>
        </div>
        <p className={copied ? 'copied' : 'hint'}>
          {copied
            ? '✓ Kopiert! Schick den Code deiner Lehrkraft (z. B. über Teams).'
            : 'Fertig? Kopiere den Code und schick ihn deiner Lehrkraft (z. B. über Teams).'}
        </p>
      </div>

      <p className="footer-note">Es werden keine Daten gespeichert oder gesendet – dein Avatar entsteht nur in deinem Browser.</p>
    </div>
  )
}

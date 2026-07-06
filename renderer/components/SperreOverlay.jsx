// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useRef, useEffect } from 'react'

// Vollflächige Sperre. Der App-Inhalt dahinter ist geblurt; entsperrt wird per PIN.
export default function SperreOverlay({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [fehler, setFehler] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const versuchen = async () => {
    const ok = await window.api.sperre.pruefe(pin)
    if (ok) {
      onUnlock()
    } else {
      setFehler(true)
      setPin('')
      setTimeout(() => { setFehler(false); inputRef.current?.focus() }, 500)
    }
  }

  const handleChange = (e) => {
    setPin(e.target.value.replace(/\D/g, '').slice(0, 12))
    setFehler(false)
  }
  const handleSubmit = (e) => {
    e.preventDefault()
    if (pin.length >= 4) versuchen()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/30 dark:bg-ink-950/50">
      <div
        className={`bg-white dark:bg-ink-900 rounded-3xl shadow-pop px-8 py-10 w-[22rem] max-w-[90vw] text-center border border-paper-200 dark:border-ink-700 ${fehler ? 'animate-shake' : 'animate-pop-in'}`}
      >
        <div className="text-5xl mb-3">🔒</div>
        <h2 className="text-xl font-semibold text-ink-900 dark:text-white mb-1">App gesperrt</h2>
        <p className="text-sm text-ink-400 dark:text-ink-500 mb-6">PIN eingeben, um fortzufahren.</p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={handleChange}
            placeholder="••••"
            className={`w-full text-center text-2xl tracking-[0.4em] py-3 rounded-xl border-2 bg-paper-50 dark:bg-ink-800 text-ink-900 dark:text-white outline-none transition-colors
              ${fehler
                ? 'border-red-400 dark:border-red-500'
                : 'border-paper-200 dark:border-ink-700 focus:border-coral-400 dark:focus:border-coral-500'}`}
          />
          {fehler && <p className="text-red-500 text-sm mt-3">Falscher PIN.</p>}
          <button type="submit" className="btn-primary w-full mt-6" disabled={pin.length < 4}>
            Entsperren
          </button>
        </form>
      </div>
    </div>
  )
}

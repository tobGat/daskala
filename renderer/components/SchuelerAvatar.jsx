import React, { useMemo } from 'react'
import { avatarSvg, avatarFarbe, initialen } from '../utils/avatar'

// Rendert den Schüler-Avatar als Inline-SVG (CSP erlaubt kein <img data:>).
// Fällt auf den farbigen Initialen-Kreis zurück, wenn kein SVG erzeugt werden kann.
export default function SchuelerAvatar({ schueler, size = 28, className = '', onClick, title }) {
  const svg = useMemo(
    () => avatarSvg(schueler, size),
    [schueler?.avatar, schueler?.vorname, schueler?.nachname, size]
  )
  const box = { width: size, height: size }
  const clickable = onClick ? 'cursor-pointer' : ''

  if (!svg) {
    return (
      <span
        onClick={onClick}
        title={title}
        style={{ ...box, backgroundColor: avatarFarbe(schueler), fontSize: Math.round(size * 0.36) }}
        className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none ${clickable} ${className}`}
      >
        {initialen(schueler)}
      </span>
    )
  }

  return (
    <span
      onClick={onClick}
      title={title}
      style={box}
      className={`rounded-full overflow-hidden inline-block flex-shrink-0 bg-paper-100 dark:bg-ink-800 ${clickable} ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

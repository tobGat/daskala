// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Schlanke mobile Kopfzeile (Capacitor). Ersetzt am Gerät die Desktop-Kopfleisten
// (KlassenTabs/FachTabs) durch reines Branding: Logo + Schriftzug „Daskala".
// Klassen-/Fachwechsel läuft mobil über die Bottom-Navigation (MobileBottomNav).

import React from 'react'
import logo from '../../daskalalogo.png'

export default function MobileHeader() {
  return (
    <header className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-ink-900 border-b border-paper-200 dark:border-ink-800">
      <img src={logo} alt="" className="h-6 w-6 rounded-md" />
      <span className="text-lg font-bold font-display text-ink-800 dark:text-paper-100 tracking-tight">Daskala</span>
    </header>
  )
}

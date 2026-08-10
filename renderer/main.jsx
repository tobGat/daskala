// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toaster'

// Desktop (Electron): window.api wird von preload.js gesetzt, bevor dieser Code läuft.
// Mobil (Capacitor-Spike): kein preload/IPC → wir bauen window.api im WebView auf
// (SQLite via @capacitor-community/sqlite + Kern-Domänen). Der dynamische Import
// hält den Capacitor-Code aus dem Desktop-Ladepfad heraus.
async function boot() {
  if (!window.api) {
    const { bootstrapMobile } = await import('../platform/capacitor/bootstrap')
    await bootstrapMobile()
  }
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
      <Toaster />
    </ErrorBoundary>
  )
}

boot()

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Der plattformunabhängige Kern (core/) ist CommonJS. Für den Capacitor-Spike
    // wird er in den WebView gebündelt → CommonJS-Transform auch auf core/ anwenden.
    commonjsOptions: {
      include: [/node_modules/, /core[\\/]/, /platform[\\/]capacitor[\\/]shims/],
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './renderer'),
      // Capacitor-Spike: der Kern wird für Mobil in den WebView gebündelt und nutzt
      // Node-Builtins. Browser-taugliche Ersatz-Module bereitstellen (betrifft nur
      // den Mobil-Chunk; der Desktop-Renderer importiert den Kern nicht).
      path: 'path-browserify',
      crypto: path.resolve(__dirname, './platform/capacitor/shims/crypto.js'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

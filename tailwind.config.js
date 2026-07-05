// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './renderer/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cream-Hintergrund (Paper) — warm, einladend, ersetzt slate-50/100 in den meisten BG-Fällen
        paper: {
          50:  '#fffdfa',
          100: '#fef9f3',
          200: '#fdf2e7',
          300: '#fae5d0',
          400: '#f5d3ad',
          500: '#eebd83',
          600: '#daa05f',
          700: '#a87545',
          800: '#7a5435',
          900: '#4f372a',
          950: '#2a1d17',
        },
        // Warme Grautöne (Ink) — für Text, Borders. Wärmer als slate.
        ink: {
          50:  '#fafaf9',
          100: '#f4f3f1',
          200: '#e6e3df',
          300: '#cfc9c2',
          400: '#a59c91',
          500: '#7c7167',
          600: '#5e544c',
          700: '#46403a',
          800: '#2e2a26',
          900: '#1c1a17',
          950: '#0e0d0c',
        },
        // Primary-Akzent: Coral (Peach). Wärme, Energie, aber nicht aufdringlich.
        coral: {
          50:  '#fff5f1',
          100: '#ffe8de',
          200: '#ffcdb8',
          300: '#ffac8a',
          400: '#ff8559',
          500: '#fb6936',
          600: '#ec4d1a',
          700: '#c43a14',
          800: '#9a3216',
          900: '#7d2d16',
          950: '#3e1208',
        },
        // Sekundär-Akzent: Mint. Frische, Erfolg.
        mint: {
          50:  '#f0fbf7',
          100: '#dcf6ec',
          200: '#bbecd9',
          300: '#8cdcbe',
          400: '#56c39e',
          500: '#31a982',
          600: '#21896a',
          700: '#1c6e57',
          800: '#1a5746',
          900: '#17483b',
          950: '#0a2620',
        },
        // Tertiary: Soft Lavender für besondere Akzente (Manuell-Marker etc.)
        lavender: {
          50:  '#f6f4ff',
          100: '#ede9ff',
          200: '#ded4ff',
          300: '#c7b6ff',
          400: '#a98fff',
          500: '#8b66f5',
          600: '#7449e6',
          700: '#623bc4',
          800: '#5232a0',
          900: '#442c81',
          950: '#241451',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Inter Fallback"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'Monaco', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        // Weiche, freundliche Schatten
        'soft':   '0 1px 3px 0 rgb(46 42 38 / 0.04), 0 2px 8px -2px rgb(46 42 38 / 0.06)',
        'softer': '0 1px 2px 0 rgb(46 42 38 / 0.04)',
        'pop':    '0 4px 12px -2px rgb(46 42 38 / 0.10), 0 8px 24px -4px rgb(46 42 38 / 0.08)',
        'glow':   '0 0 0 4px rgb(251 105 54 / 0.15)',  // coral-glow für Focus
        'glow-mint': '0 0 0 4px rgb(49 169 130 / 0.18)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'gentle-bounce': 'gentleBounce 2.4s ease-in-out infinite',
        'fade-up':       'fadeUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':       'fadeIn 0.24s ease-out both',
        'pop-in':        'popIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'slide-up':      'slideUp 0.36s cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer':       'shimmer 2.2s linear infinite',
        'glow-frame':    'glowFrame 3s ease-in-out infinite',
      },
      keyframes: {
        gentleBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-3px)' },
        },
        fadeUp: {
          '0%':   { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: 0 },
          '100%': { opacity: 1 },
        },
        popIn: {
          '0%':   { opacity: 0, transform: 'scale(0.92)' },
          '60%':  { opacity: 1, transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%':   { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Dezent pulsierendes grünes Leuchten für den Vorlagen-Modus-Rahmen
        glowFrame: {
          '0%, 100%': { boxShadow: 'inset 0 0 8px 0px rgba(34, 197, 94, 0.22)' },
          '50%':      { boxShadow: 'inset 0 0 16px 2px rgba(34, 197, 94, 0.40)' },
        },
      },
    },
  },
  plugins: [],
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Plattform-Erkennung für die mobile UI (Capacitor). „Mobil" ist genau dann wahr,
// wenn am <html> die Klasse `cap` gesetzt ist – das passiert NUR im Capacitor-Bootstrap
// (echtes Gerät) bzw. über den Dev-Override (localStorage 'daskala:forceMobile').
// Die Desktop-App (Electron) setzt die Klasse nie → hier ist es immer false, die
// Desktop-Oberfläche bleibt damit garantiert unverändert.

export function istMobil() {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('cap')
}

// React-Hook-Variante. Der Wert ist pro Sitzung konstant (die Markierung wird einmalig
// beim Start gesetzt), daher genügt die synchrone Abfrage – kein Listener nötig.
export function useIsMobile() {
  return istMobil()
}

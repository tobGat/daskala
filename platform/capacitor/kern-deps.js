// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Mobile kernDeps (Capacitor-Spike). Entspricht dem `kernDeps`-Bündel aus main.js,
// aber gegen den Capacitor-DbPort gebunden. Die Noten-/Trigger-Logik kommt aus dem
// plattformunabhängigen Kern (core/services/notenberechnung); Datei-/Material-Ports
// gibt es im Spike noch nicht und sind daher no-ops.

import noten from '../../core/services/notenberechnung'

export function createMobileKernDeps(dbPort) {
  const logError = (msg, e) => console.error('[daskala:mobile]', msg, e)
  return {
    logError,
    pushUndo: () => {}, // Undo im Spike nicht abgebildet
    berechneAlleFuerSchuljahr: (sjId) => noten.berechneAlleFuerSchuljahr(dbPort, sjId),
    berechneAlleFuerFach: (fachId) => noten.berechneAlleFuerFach(dbPort, fachId),
    berechneZeugnisnote: (fachId, sId) => noten.berechneZeugnisnote(dbPort, fachId, sId),
    rosterIdsFuerFach: (fachId, opts) => noten.rosterIdsFuerFach(dbPort, fachId, opts),
    rosterFuerFach: (fachId, opts) => noten.rosterFuerFach(dbPort, fachId, opts),
    pruefeNotenTrigger: (...a) => noten.pruefeNotenTrigger(dbPort, ...a),
    pruefeFehlstundenSchwellen: (sId) => noten.pruefeFehlstundenSchwellen(dbPort, sId),
    erzeugeTrigger: (...a) => noten.erzeugeTrigger(dbPort, ...a),
    // Material-/Datei-Schicht (Desktop-only) – im Spike neutralisiert:
    materialRoot: async () => null,
    verschiebeDir: async () => null,
    sanitizeSegment: (s) => String(s ?? '').replace(/[\\/:*?"<>|]+/g, ' ').trim(),
    initKompetenzVorlagen: async () => {},
    raeumeFachDatenAuf: async (fachIds) => {
      const ids = (Array.isArray(fachIds) ? fachIds : [fachIds]).filter((x) => x != null)
      if (!ids.length) return
      const ph = ids.map(() => '?').join(',')
      await dbPort.execute(`DELETE FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id IN (${ph}))`, ids)
      await dbPort.execute(`DELETE FROM eintraege_verlauf WHERE fach_id IN (${ph})`, ids)
      await dbPort.execute(`DELETE FROM spalten WHERE fach_id IN (${ph})`, ids)
      await dbPort.execute(`DELETE FROM zeugnisnoten WHERE fach_id IN (${ph})`, ids)
      await dbPort.execute(`DELETE FROM notizen WHERE fach_id IN (${ph})`, ids)
      await dbPort.execute(`DELETE FROM stunden_planung WHERE stundenplan_id IN (SELECT id FROM stundenplan WHERE fach_id IN (${ph}))`, ids)
      await dbPort.execute(`DELETE FROM stundenplan WHERE fach_id IN (${ph})`, ids)
    },
  }
}

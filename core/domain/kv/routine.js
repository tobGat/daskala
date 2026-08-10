// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: periodische Routine-Prüfungen. Async DbPort; deps = { erzeugeTrigger }.

// Offene Eltern-Rückrufe älter als 3 Tage → Trigger anlegen.
async function pruefeOffeneRueckrufe(db, deps) {
  const heute = new Date()
  const dreiTageZurueck = new Date(heute.getTime() - 3 * 86400000)
  const cutoff = `${dreiTageZurueck.getFullYear()}-${String(dreiTageZurueck.getMonth() + 1).padStart(2, '0')}-${String(dreiTageZurueck.getDate()).padStart(2, '0')}`
  const offene = await db.select(`
      SELECT e.id, e.thema, e.datum, s.id AS schueler_id, s.klasse_id, s.vorname, s.nachname
      FROM kv_elternkontakte e
      JOIN schueler s ON s.id = e.schueler_id
      JOIN klassen k ON k.id = s.klasse_id
      WHERE e.erledigt = 0 AND e.datum <= ? AND k.ist_kv = 1
    `, [cutoff])
  for (const o of offene) {
    await deps.erzeugeTrigger(
      o.klasse_id, o.schueler_id, 'elternkontakt', 'warn',
      `Offener Rückruf seit ${o.datum}`,
      `Thema: ${o.thema}`
    )
  }
  return offene.length
}

module.exports = { pruefeOffeneRueckrufe }

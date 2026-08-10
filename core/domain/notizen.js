// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Notizen (Schüler:in × Fach). Async DbPort; deps = { pushUndo }.

const { neueUuid } = require('../db/uuid')

async function get(db, schuelerId, fachId) {
  const row = await db.selectOne('SELECT text FROM notizen WHERE schueler_id = ? AND fach_id = ?', [schuelerId, fachId])
  return row?.text ?? ''
}

async function set(db, deps, schuelerId, fachId, text) {
  const existing = await db.selectOne('SELECT text, uuid FROM notizen WHERE schueler_id = ? AND fach_id = ?', [schuelerId, fachId])
  const oldText = existing ? existing.text : null
  // INSERT OR REPLACE erzeugt eine neue Zeile – vorhandene UUID beibehalten,
  // damit die Identität über Bearbeitungen hinweg stabil bleibt.
  const uuid = existing?.uuid ?? neueUuid()
  const apply = async (t) => {
    if (t === null) {
      await db.execute('DELETE FROM notizen WHERE schueler_id = ? AND fach_id = ?', [schuelerId, fachId])
    } else {
      await db.execute('INSERT OR REPLACE INTO notizen (schueler_id, fach_id, text, uuid) VALUES (?, ?, ?, ?)', [schuelerId, fachId, t, uuid])
    }
  }
  await apply(text)
  deps.pushUndo({ description: 'Notiz', undo: () => apply(oldText), redo: () => apply(text) })
  return true
}

module.exports = { get, set }

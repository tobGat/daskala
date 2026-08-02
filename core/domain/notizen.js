// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Notizen (Schüler:in × Fach). Plattformunabhängig, ohne electron.
// db und Abhängigkeiten (pushUndo) werden injiziert.

function get(db, schuelerId, fachId) {
  return db.prepare('SELECT text FROM notizen WHERE schueler_id = ? AND fach_id = ?').get(schuelerId, fachId)?.text ?? ''
}

function set(db, deps, schuelerId, fachId, text) {
  const existing = db.prepare('SELECT text FROM notizen WHERE schueler_id = ? AND fach_id = ?').get(schuelerId, fachId)
  const oldText = existing ? existing.text : null
  const apply = (t) => {
    if (t === null) {
      db.prepare('DELETE FROM notizen WHERE schueler_id = ? AND fach_id = ?').run(schuelerId, fachId)
    } else {
      db.prepare('INSERT OR REPLACE INTO notizen (schueler_id, fach_id, text) VALUES (?, ?, ?)').run(schuelerId, fachId, t)
    }
  }
  apply(text)
  deps.pushUndo({ description: 'Notiz', undo: () => apply(oldText), redo: () => apply(text) })
  return true
}

module.exports = { get, set }

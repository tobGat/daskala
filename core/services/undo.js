// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Undo/Redo-Stack. Plattformunabhängig, ohne electron.
// Die Benachrichtigung des Renderers (früher BrowserWindow.send('undo:applied'))
// wird als onApplied-Callback injiziert.

function createUndo({ onApplied } = {}) {
  const undoStack = []
  const redoStack = []

  function push(action) {
    undoStack.push(action)
    if (undoStack.length > 50) undoStack.shift()
    redoStack.length = 0
  }

  // Async: die undo/redo-Closures greifen jetzt über den async DbPort auf die DB zu.
  async function execute() {
    if (undoStack.length === 0) return { ok: false }
    const action = undoStack.pop()
    try { await action.undo(); redoStack.push(action) } catch (e) { console.error('Undo fehlgeschlagen:', e) }
    onApplied?.()
    return { ok: true }
  }

  async function redo() {
    if (redoStack.length === 0) return { ok: false }
    const action = redoStack.pop()
    try { await action.redo(); undoStack.push(action) } catch (e) { console.error('Redo fehlgeschlagen:', e) }
    onApplied?.()
    return { ok: true }
  }

  function state() {
    return {
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoDescription: undoStack[undoStack.length - 1]?.description,
      redoDescription: redoStack[redoStack.length - 1]?.description,
    }
  }

  function reset() {
    undoStack.length = 0
    redoStack.length = 0
  }

  return { push, execute, redo, state, reset }
}

module.exports = { createUndo }

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Phase 0.2 – API-Oberflächen-Test.
//
// Lädt preload.js mit gestubbtem electron, fängt das an contextBridge übergebene
// `api`-Objekt ab und bildet die vollständige Liste der Methodenpfade
// (z. B. "einstellungen.get", "kv.jahresaufgaben.getAlle"). Diese Liste ist
// eingefroren: Der Test schlägt fehl, sobald eine Methode verschwindet,
// hinzukommt oder umbenannt wird. Das ist die Messlatte dafür, dass der
// Kern-Umbau den Renderer-Vertrag (window.api) bitweise erhält.
//
// Ausführen:      npm run test:core
// Liste neu:      npm run test:core:update

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const PRELOAD_PATH = require.resolve('../../preload.js')
const SNAP_PATH = path.join(__dirname, 'snapshots', 'api-surface.json')
const UPDATE = process.env.SNAPSHOT_UPDATE === '1'

// preload.js mit gestubbtem electron laden und das api-Objekt einfangen.
function ladeApi() {
  let captured = null
  const electronStub = {
    contextBridge: { exposeInMainWorld: (_name, api) => { captured = api } },
    ipcRenderer: { invoke: () => {}, on: () => {}, removeListener: () => {}, send: () => {} },
  }
  const origLoad = Module._load
  Module._load = function (request) {
    if (request === 'electron') return electronStub
    return origLoad.apply(this, arguments)
  }
  try {
    delete require.cache[PRELOAD_PATH]
    require(PRELOAD_PATH)
  } finally {
    Module._load = origLoad
    delete require.cache[PRELOAD_PATH]
  }
  if (!captured) throw new Error('api-surface: contextBridge.exposeInMainWorld wurde nicht aufgerufen')
  return captured
}

// Alle Methodenpfade (Funktionen) in Punktnotation, sortiert.
function methodenPfade(obj, prefix = '') {
  const out = []
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    const pfad = prefix ? `${prefix}.${key}` : key
    if (typeof val === 'function') out.push(pfad)
    else if (val && typeof val === 'object') out.push(...methodenPfade(val, pfad))
  }
  return out
}

test('window.api-Oberfläche unverändert (eingefrorene Methodenliste)', () => {
  const aktuell = methodenPfade(ladeApi()).sort()
  if (UPDATE) {
    fs.mkdirSync(path.dirname(SNAP_PATH), { recursive: true })
    fs.writeFileSync(SNAP_PATH, JSON.stringify(aktuell, null, 2) + '\n', 'utf8')
    return
  }
  const eingefroren = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'))
  assert.deepStrictEqual(aktuell, eingefroren)
})

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron-Stub für den Charakterisierungs-Harness (Phase 0).
// Erlaubt es, main.js außerhalb von Electron zu laden: app.whenReady() liefert
// eine echte Promise, ipcMain.handle() fängt die Handler ein, alles andere ist
// ein „tiefer No-Op-Proxy", der beliebige Methoden-/Property-Zugriffe verschluckt.
//
// WICHTIG: Kein Verhalten der App wird nachgebaut – der Stub existiert nur, damit
// der Lade-Pfad bis registerIPC() durchläuft. Die eigentliche Logik testet dann
// callHandler() gegen die echte SQLite-DB.

// Tiefer No-Op-Proxy: aufrufbar, konstruierbar, jeder Property-Zugriff liefert
// wieder einen No-Op. `then` ist bewusst undefined, damit `await noop` nicht hängt.
function makeNoop() {
  const target = function () {}
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return undefined
      if (prop === Symbol.toPrimitive) return () => ''
      return proxy
    },
    apply() { return proxy },
    construct() { return proxy },
  }
  const proxy = new Proxy(target, handler)
  return proxy
}

const os = require('os')

function createElectronStub({ userDataPath, handlers, version = '0.0.0-test' }) {
  const noop = makeNoop()

  const appBase = {
    whenReady: () => Promise.resolve(),
    on: () => appProxy,
    once: () => appProxy,
    getPath: (name) => (name === 'temp' ? os.tmpdir() : userDataPath),
    getName: () => 'Daskala',
    getVersion: () => version,
    isPackaged: false,
    quit: () => {},
    exit: () => {},
    requestSingleInstanceLock: () => true,
    setAppUserModelId: () => {},
    disableHardwareAcceleration: () => {},
  }
  const appProxy = new Proxy(appBase, {
    get: (t, p) => (p in t ? t[p] : noop),
  })

  const ipcMain = {
    handle: (channel, fn) => { handlers.set(channel, fn) },
    handleOnce: (channel, fn) => { handlers.set(channel, fn) },
    removeHandler: (channel) => { handlers.delete(channel) },
    on: () => {},
    once: () => {},
    removeAllListeners: () => {},
  }

  // BrowserWindow: konstruierbar (No-Op-Instanz), plus statisches getAllWindows().
  const BrowserWindow = new Proxy(function () {}, {
    construct: () => noop,
    apply: () => noop,
    get: (_t, prop) => (prop === 'getAllWindows' ? () => [] : noop),
  })

  const known = {
    app: appProxy,
    ipcMain,
    BrowserWindow,
    dialog: noop,
    shell: noop,
    clipboard: noop,
    Menu: noop,
    MenuItem: noop,
    nativeImage: noop,
    nativeTheme: noop,
    net: noop,
    session: noop,
    screen: noop,
    globalShortcut: noop,
    protocol: noop,
  }

  // Alles Unbekannte → No-Op.
  return new Proxy(known, {
    get: (t, p) => (p in t ? t[p] : noop),
  })
}

module.exports = { createElectronStub, makeNoop }

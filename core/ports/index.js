// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Port-Interfaces (Phase 1.2 des Portierungsplans).
//
// Alles, was heute Electron oder Node direkt aufruft, wird zu einem Interface.
// Kernfunktionen bekommen die Ports injiziert, statt sie zu importieren – so
// bleibt `core/` frei von `require('electron')`. Die Signaturen verwenden
// ausschliesslich primitive Typen, Strings, Buffer/Uint8Array; kein Electron-Typ
// reicht durch ein Port-Interface hindurch.
//
// Dieses Modul definiert nur die Vertraege (als JSDoc). Die konkreten
// Implementierungen liegen unter `platform/electron/ports/`.

/**
 * Dateisystem. Ersetzt direkte `require('fs')`-Aufrufe.
 * @typedef {Object} FsPort
 * @property {(p: string) => boolean} exists
 * @property {(p: string, encoding?: string) => string|Buffer} read     Text (mit encoding) oder Buffer (ohne)
 * @property {(p: string, length: number) => Buffer} readBytes          Erste `length` Bytes (z.B. Datei-Header)
 * @property {(p: string, data: string|Buffer, encoding?: string) => void} write
 * @property {(p: string) => void} mkdir                                 rekursiv
 * @property {(p: string, opts?: {withFileTypes?: boolean}) => Array} list
 * @property {(p: string) => void} remove                               eine Datei loeschen (ignoriert Fehlen)
 * @property {(quelle: string, ziel: string) => void} copy
 * @property {(quelle: string, ziel: string) => void} move
 * @property {(p: string) => {size: number, mtimeMs: number, isFile: boolean}} stat
 */

/**
 * Standard-Verzeichnisse. Ersetzt `app.getPath(...)` und `os.tmpdir()`.
 * @typedef {Object} PathsPort
 * @property {() => string} userData
 * @property {() => string} temp
 * @property {() => string} documents
 */

/**
 * Datei-/Ordner-Dialoge. Ersetzt `dialog.*`.
 * @typedef {Object} DialogPort
 * @property {(opts?: {filters?: Array}) => Promise<string|null>} openFile
 * @property {(opts?: {filters?: Array, multiSelections?: boolean}) => Promise<string[]|null>} openFiles
 * @property {(opts?: {title?: string, createDirectory?: boolean}) => Promise<string|null>} openDirectory
 * @property {(opts?: {filters?: Array, defaultName?: string}) => Promise<string|null>} saveFile
 * @property {(opts: {type?: string, title?: string, message?: string, buttons?: string[]}) => Promise<number>} message
 */

/**
 * PDF-Erzeugung aus HTML. Ersetzt `webContents.printToPDF`.
 * @typedef {Object} PdfPort
 * @property {(html: string, opts?: {landscape?: boolean}) => Promise<Uint8Array>} fromHtml
 */

/**
 * HTTP(S)-JSON-Abruf. Ersetzt `require('https')`.
 * @typedef {Object} HttpPort
 * @property {(url: string) => Promise<Object>} getJson
 */

/**
 * Betriebssystem-Shell. Ersetzt `shell.*`.
 * @typedef {Object} ShellPort
 * @property {(pfad: string) => Promise<string>} openPath      Datei/Ordner mit Standard-App oeffnen
 * @property {(url: string) => Promise<void>} openExternal     nur http/https/mailto
 */

/**
 * Buendel aller Ports, wie es Kernfunktionen erhalten.
 * @typedef {Object} Ports
 * @property {FsPort} fs
 * @property {PathsPort} paths
 * @property {DialogPort} dialog
 * @property {PdfPort} pdf
 * @property {HttpPort} http
 * @property {ShellPort} shell
 */

module.exports = {}

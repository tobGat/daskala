// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Node-Implementierung des HttpPort (siehe core/ports/index.js).

const https = require('https')

// Rohtext holen; folgt bis zu 3 Weiterleitungen (webcal-Feeds liegen oft hinter 30x).
function holeText(url, tiefe = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Daskala' } }, (res) => {
      const code = res.statusCode
      if (code >= 300 && code < 400 && res.headers.location && tiefe < 3) {
        res.resume()
        const ziel = new URL(res.headers.location, url).toString()
        resolve(holeText(ziel, tiefe + 1))
        return
      }
      if (code < 200 || code >= 300) { res.resume(); reject(new Error('HTTP ' + code)); return }
      // Buffer sammeln und erst am Ende als UTF-8 dekodieren – sonst zerbrechen
      // Mehrbyte-Zeichen (Umlaute) an Chunk-Grenzen.
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('timeout')))
  })
}

/** @returns {import('../../../core/ports').HttpPort} */
function createHttpPort() {
  return {
    getJson(url) {
      return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Daskala' } }, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
        })
        req.on('error', reject)
        req.setTimeout(8000, () => req.destroy(new Error('timeout')))
      })
    },
    getText(url) {
      return holeText(url)
    },
  }
}

module.exports = { createHttpPort }

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Node-Implementierung des HttpPort (siehe core/ports/index.js).

const https = require('https')

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
  }
}

module.exports = { createHttpPort }

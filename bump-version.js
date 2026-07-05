// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const parts = pkg.version.split('.').map(Number)
parts[2]++
pkg.version = parts.join('.')
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
console.log(`Version: ${pkg.version}`)

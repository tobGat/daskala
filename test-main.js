// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
console.log('process.type:', process.type)
console.log('process.versions.electron:', process.versions.electron)
const electronModule = require('electron')
console.log('type:', typeof electronModule)
console.log('is app available:', !!(electronModule && electronModule.app))

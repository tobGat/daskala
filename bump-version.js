const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const parts = pkg.version.split('.').map(Number)
parts[2]++
pkg.version = parts.join('.')
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
console.log(`Version: ${pkg.version}`)

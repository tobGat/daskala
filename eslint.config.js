// ESLint Flat-Config. Bewusst pragmatisch: echte Fehler als Fehler,
// Stil/Ungenutztes nur als Warnung (blockiert den Lint-Lauf nicht).
const js = require('@eslint/js')
const globals = require('globals')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = [
  {
    ignores: [
      'dist/**', 'dist-electron/**', 'node_modules/**',
      'web/**', 'test/**',
      'tailwind.config.js', 'postcss.config.js', 'eslint.config.js', 'vite.config.js',
    ],
  },
  js.configs.recommended,

  // Renderer (React, ES-Module, Browser-Globals)
  {
    files: ['renderer/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // Main-Prozess / Node-Skripte (CommonJS, Node-Globals)
  {
    files: ['main.js', 'preload.js', 'launch-electron.js', 'bump-version.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'off',
      // Dateinamen-Sanitizer entfernt bewusst Steuerzeichen per Regex.
      'no-control-regex': 'off',
    },
  },
]

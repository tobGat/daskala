import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toaster'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
    <Toaster />
  </ErrorBoundary>
)

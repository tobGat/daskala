import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Statischer Build – alles gebündelt, keine externen CDNs/Fonts (DSGVO).
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  build: { outDir: 'dist', emptyOutDir: true },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Deployed on Vercel (served at the domain root), so the default base '/' is
// correct — build config lives in vercel.json, matching the sentinel project.
export default defineConfig({
  plugins: [react()],
})

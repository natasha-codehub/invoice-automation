import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` is the project-Pages subpath in production (the site lives at
// natasha-codehub.github.io/invoice-automation/), but stays at root for local
// `npm run dev` / `npm run preview` so nothing changes about running it locally.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/invoice-automation/' : '/',
  plugins: [react()],
}))

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// The app is hosted in two places, which need different base paths, so `base` is
// host-aware:
//   - Vercel  → served at the domain root, so base '/'. Vercel sets the VERCEL
//               env var during its build, which is how we detect it.
//   - GitHub Pages (project site) → served under /invoice-automation/, so the
//               GitHub Actions build (no VERCEL var) uses that subpath.
//   - Local dev/preview → root, so `npm run dev` is unchanged.
export default defineConfig(({ command }) => {
  const isProdBuild = command === 'build'
  const onVercel = !!process.env.VERCEL
  return {
    base: isProdBuild && !onVercel ? '/invoice-automation/' : '/',
    plugins: [react()],
  }
})

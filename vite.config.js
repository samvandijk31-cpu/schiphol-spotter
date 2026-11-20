import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// opendata.adsb.fi sends no CORS headers, so the browser must reach it via a same-origin proxy.
const proxy = {
  '/adsb': {
    target: 'https://opendata.adsb.fi',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/adsb/, ''),
  },
}

export default defineConfig({
  base: './', // relative asset paths: works on Vercel and on a GitHub Pages sub-path
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})

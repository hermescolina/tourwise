import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    base: isProd ? '/tourism-analytics/' : '/tourism-analytics/',
    plugins: [react()],
    server: {
      host: true,                      // listen 0.0.0.0
      origin: 'https://app.tourwise.shop',   // absolute URLs Vite generates
      allowedHosts: ['app.tourwise.shop'],
      hmr: {
        protocol: 'wss',               // <- secure WS through CF
        host: 'app.tourwise.shop',     // <- not localhost
        clientPort: 443,
        // path: '/@vite/client'       // usually not needed; uncomment if custom
      },
    },
  }
})



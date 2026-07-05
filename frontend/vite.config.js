import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { URL, fileURLToPath } from 'url';

export default defineConfig({
  // Keep this if you are deploying to a /tourism-analytics/ subdirectory in production
  base: '/tourism-analytics/', 
  plugins: [react()],
  
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@Common', replacement: fileURLToPath(new URL('./src/features/Common', import.meta.url)) },
      { find: '@LandingPage', replacement: fileURLToPath(new URL('./src/features/LandingPage', import.meta.url)) },
      { find: '@TourCardsPage', replacement: fileURLToPath(new URL('./src/features/TourCardsPage', import.meta.url)) },
      { find: '@TourCardsAdminPage', replacement: fileURLToPath(new URL('./src/features/TourCardsAdminPage', import.meta.url)) },
      { find: '@TourPage', replacement: fileURLToPath(new URL('./src/features/TourPage', import.meta.url)) },
      { find: '@LoginPage', replacement: fileURLToPath(new URL('./src/features/LoginPage', import.meta.url)) }
    ]
  },

  server: {
    host: true, 
    port: 5173, 
    watch: {
      usePolling: true,
    },
    
    // 👇 ADD THE PROXY BLOCK HERE 👇
    proxy: {
      // Intercepts any request starting with /api or /tourism-analytics/api
      '/api': {
        target: 'http://localhost:3001', // Targets the Flask service container name
        changeOrigin: true,
        secure: false,
      },
      '/tourism-analytics/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // Rewrites paths to strip away the base prefix before sending to Flask
        rewrite: (path) => path.replace(/^\/tourism-analytics/, '')
      }
    }
  },
});
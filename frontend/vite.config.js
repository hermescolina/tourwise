
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { URL, fileURLToPath } from 'url';

// This is the definitive, correct configuration for your development environment.
export default defineConfig({
  base: '/tourism-analytics/',
  plugins: [react()],
  
  resolve: {
    alias: [
      { 
        find: '@', 
        replacement: fileURLToPath(new URL('./src', import.meta.url)) 
      },
      { 
        find: '@Common', 
        replacement: fileURLToPath(new URL('./src/features/Common', import.meta.url)) 
      },
      { 
        find: '@LandingPage', 
        replacement: fileURLToPath(new URL('./src/features/LandingPage', import.meta.url)) 
      },
      { 
        find: '@TourCardsPage', 
        replacement: fileURLToPath(new URL('./src/features/TourCardsPage', import.meta.url)) 
      }
    ]
  },

  server: {
    // This is required to make Vite accessible from outside the Docker container
    host: true, 
    // This is the port you are mapping in docker-compose
    port: 5173, 
    
    // This is the permanent fix for the live-reloading issue inside Docker
    watch: {
      usePolling: true,
    },
  },
});
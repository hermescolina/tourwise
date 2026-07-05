import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Necessary for Docker container port binding
    port: 5173,
    
    // ✅ ADD THIS BLOCK TO ALLOW NGROK TRAFFIC
    allowedHosts: [
      'contented-abroad-headpiece.ngrok-free.dev', // Your specific ngrok URL
      '.ngrok-free.dev'                             // Wildcard to allow any future ngrok URLs you generate
    ]
  },
  resolve: {
    alias: {
      '@LandingPage': path.resolve(__dirname, './src/features/LandingPage'),
      '@TourCardsPage': path.resolve(__dirname, './src/features/TourCardsPage'),
      '@TourPage': path.resolve(__dirname, './src/features/TourPage'),
      '@LoginPage': path.resolve(__dirname, './src/features/LoginPage'),
      '@Common': path.resolve(__dirname, './src/features/Common'),
    },
  },
});
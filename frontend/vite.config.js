import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, proxyamos /api al backend Express para evitar CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Root-hosted preview by default. For legacy Catalyst /app hosting build with
// VITE_PUBLIC_BASE=/app/ npm run build and configure the server's SPA fallback.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_PUBLIC_BASE || '/',
});

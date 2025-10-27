import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/chain-x-sol-example/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173
  }
});

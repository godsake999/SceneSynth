import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5328', // Default port for Vercel Python dev
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

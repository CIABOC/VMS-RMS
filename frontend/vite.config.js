import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // The SPA and API share one origin, so the session and XSRF cookies just work.
      proxy: { '/api': { target: env.VITE_BACKEND_URL || 'http://localhost:8080', changeOrigin: false } },
    },
  };
});

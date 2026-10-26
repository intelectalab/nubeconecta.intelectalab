import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // VITE_API_TARGET: backend (nginx de infra/docker-compose.yml). El proxy deja
  // /api y /sanctum en el mismo origen que la app para que las cookies de
  // sesión y XSRF-TOKEN de Sanctum funcionen en desarrollo.
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_TARGET || 'http://localhost:8080';
  const proxy = { target, changeOrigin: false, secure: false, xfwd: true };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@hub/ui': path.resolve(__dirname, '../../packages/ui/src'),
        '@hub/api': path.resolve(__dirname, '../../packages/api/src'),
      },
    },
    server: {
      proxy: { '/api': proxy, '/sanctum': proxy },
    },
  };
});

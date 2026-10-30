import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite sirve la web en el 5180 y reenvía la API y el WebSocket al servidor (3001).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = `http://127.0.0.1:${env.API_PORT || 3001}`;
  return {
    plugins: [react()],
    server: {
      port: 5180,
      host: true,
      proxy: {
        '/api': { target: api },
        '/ws': { target: api, ws: true },
      },
    },
  };
});

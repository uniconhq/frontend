import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY ?? 'http://localhost:8080';

const apiPublicOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:8080';

/**
 * The backend refuses a state-changing request whose Origin is not its own
 * public URL. The dev server answers on :5173 while the backend believes it
 * lives on :8080, so only the dev server's own Origin is rewritten. Any other
 * Origin is a genuine cross-site request and goes through untouched, to be
 * refused.
 */
const presentDevServerAsApiOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (proxyRequest, request) => {
    if (request.headers.origin === `http://${request.headers.host ?? ''}`) {
      proxyRequest.setHeader('origin', apiPublicOrigin);
    }
  });
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: false,
        configure: presentDevServerAsApiOrigin,
      },
      '/healthz': { target: apiProxyTarget, changeOrigin: false },
      '/readyz': { target: apiProxyTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

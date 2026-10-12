import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY ?? 'http://localhost:8080';

/**
 * `VITE_API_PROXY=none` is a dev server with no backend behind it: every
 * proxied path answers 404 at once, so what a page asks for and a test does
 * not stub fails the same way whatever listens on :8080. The Playwright run
 * uses it.
 */
const noBackend = apiProxyTarget === 'none';

/** What a proxied path does: go through to the backend, or answer 404 with none. */
function proxied(extra: Omit<ProxyOptions, 'target'> = {}): ProxyOptions {
  return noBackend
    ? { target: 'http://127.0.0.1', bypass: () => false }
    : { target: apiProxyTarget, changeOrigin: false, ...extra };
}

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
      '/api': proxied({ configure: presentDevServerAsApiOrigin }),
      // A file goes through the upload door, a path on the app's own origin
      // that the proxy in `deploy` puts through to the forge's large-file
      // store once the backend has said the upload may start.
      '/-/uploads': proxied({ configure: presentDevServerAsApiOrigin }),
      // A submitted file comes back through the download door the same way.
      '/-/downloads': proxied({ configure: presentDevServerAsApiOrigin }),
      '/healthz': proxied(),
      '/readyz': proxied(),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

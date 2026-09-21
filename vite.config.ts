import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The dev server stands in for the nginx hop that fronts the app in
 * production: the browser talks to one origin and everything under /api is
 * forwarded to the backend. That keeps the app on same-origin relative URLs
 * in both environments, so no CORS handling is needed on the C++ side (it
 * currently sends no CORS headers at all).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.2:8090',
        changeOrigin: true,
        // The backend serves /auth/login at its root, so the prefix that
        // marks a request as API traffic is stripped before forwarding.
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Matches the production path, where nginx re-establishes TLS to the
        // Kubernetes ingress against a self-signed certificate.
        secure: false,
      },
    },
  },
})

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * Vite plugin that stubs out all TanStack Start / Nitro SSR-only modules
 * so they resolve to harmless no-ops in the browser/Capacitor bundle.
 *
 * Modules stubbed:
 *  - @tanstack/react-start          (createServerFn → identity passthrough)
 *  - @tanstack/react-start/server   (getCookie → undefined)
 *  - @tanstack/react-start-server   (re-export stub)
 *  - @tanstack/start-server-core    (the missing "#tanstack-start-entry")
 *  - #tanstack-start-entry          (bare specifier used internally)
 */
function tanstackStartStubPlugin(): Plugin {
  const STUB_ID_PREFIX = '\0ssr-stub:'

  // Map each module id to the stub code it should resolve to
  const stubs: Record<string, string> = {
    // createServerFn: on the client the handler is never called server-side;
    // returning a function that returns its argument keeps route loaders from
    // crashing while still being a no-op for SSR.
    '@tanstack/react-start': `
export function createServerFn(_opts) {
  return {
    handler: (fn) => fn,
    middleware: () => ({ handler: (fn) => fn }),
  };
}
export function createMiddleware() {
  return { handler: (fn) => fn };
}
export const json = (data) => data;
export default {};
`,
    // getCookie is SSR-only; on the client just return undefined
    '@tanstack/react-start/server': `
export const getCookie = (_name) => undefined;
export const setCookie = () => {};
export const deleteCookie = () => {};
export const getHeader = (_name) => undefined;
export const setHeader = () => {};
export const getHeaders = () => ({});
export default {};
`,
    '@tanstack/react-start-server': `export default {};`,
    '@tanstack/start-server-core': `export default {};`,
    '#tanstack-start-entry': `export default {};`,
  }

  return {
    name: 'tanstack-start-ssr-stub',
    enforce: 'pre',
    resolveId(id) {
      if (id in stubs) {
        return STUB_ID_PREFIX + id
      }
    },
    load(id) {
      if (id.startsWith(STUB_ID_PREFIX)) {
        const original = id.slice(STUB_ID_PREFIX.length)
        return stubs[original] ?? 'export default {};'
      }
    },
  }
}

/**
 * Mobile / Capacitor build config.
 *
 * Key differences from the default SSR build:
 *  - base: "./"     → relative asset URLs required for APK file:// loading
 *  - outDir: "dist" → Capacitor webDir points here
 *  - No TanStack Start / Nitro; all SSR imports are stubbed out
 *  - entry: index.html → produces index.html + hashed JS/CSS chunks
 */
export default defineConfig({
  plugins: [
    tanstackStartStubPlugin(),
    tailwindcss(),
    react(),
    tsconfigPaths(),
  ],

  base: './',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'index.html'),
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },

  optimizeDeps: {
    exclude: [
      '@tanstack/start-server-core',
      '@tanstack/react-start',
      '@tanstack/react-start-server',
    ],
  },
})

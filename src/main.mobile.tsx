/**
 * Mobile / Capacitor SPA entry point.
 *
 * Used ONLY by `vite.config.mobile.ts` (`npm run build:mobile`).
 *
 * Deliberately does NOT import router.tsx or start.ts — both pull in
 * @tanstack/react-start (SSR-only). Instead we build the router inline
 * with pure @tanstack/react-router so nothing server-side leaks into the
 * Capacitor bundle.
 */
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

// Global styles (same stylesheet used by the SSR build)
import './styles.css'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
})

// Required so TanStack Router's typed APIs work in all route files
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)

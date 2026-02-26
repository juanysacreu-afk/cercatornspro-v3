import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      output: {
        /**
         * Code splitting manual per a NEXUS.
         *
         * Estratègia:
         *  - vendor: React + React-DOM (molt estable, es pot cachear a llarg termini)
         *  - supabase: client Supabase + realtime (canvia rarament)
         *  - ui: components de UI (lucide-react, motion/react-m, html2canvas, etc.)
         *  - views: les 6 vistes principals de l'app
         *
         * Això redueix el bundle inicial carregant només vendor + app shell;
         * les vistes es carreguen sota demanda quan l'operari les selecciona.
         */
        manualChunks(id: string) {
          // React core — màxim caching (Hash estable entre builds si no canvia)
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // React ecosystem (hooks, router, etc.)
          if (id.includes('node_modules/scheduler/') || id.includes('node_modules/react-is/')) {
            return 'vendor-react';
          }
          // Supabase client
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          // Dexie (IndexedDB offline)
          if (id.includes('node_modules/dexie')) {
            return 'vendor-dexie';
          }
          // Framer Motion
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
          // html2canvas (exportació PDF/imatge — pes elevat, carregar sota demanda)
          if (id.includes('node_modules/html2canvas')) {
            return 'vendor-html2canvas';
          }
          // Resta de node_modules → chunk genèric de vendor
          if (id.includes('node_modules/')) {
            return 'vendor-misc';
          }
          // Vistes principals de l'app (ordenades per ús habitual)
          if (id.includes('/views/CercarView')) return 'view-cercar';
          if (id.includes('/views/OrganitzaView')) return 'view-organitza';
          if (id.includes('/views/IncidenciaView') || id.includes('/views/incidencia/')) return 'view-incidencia';
          if (id.includes('/views/DashboardView')) return 'view-dashboard';
          if (id.includes('/views/CiclesView') || id.includes('/views/cicles/')) return 'view-cicles';
          if (id.includes('/views/ManualView')) return 'view-manual';
        },
      },
    },
  },
});

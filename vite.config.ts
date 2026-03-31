import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          // Supabase
          if (id.includes('@supabase/')) {
            return 'vendor-supabase';
          }
          // 3D + globe — large, only WorldIntelligence page
          if (id.includes('react-globe.gl') || id.includes('/three/') || id.includes('@react-three/')) {
            return 'vendor-3d';
          }
          // Charts
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }
          // Framer motion
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Icons
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // Radix UI
          if (id.includes('@radix-ui/')) {
            return 'vendor-ui';
          }
          // TanStack
          if (id.includes('@tanstack/')) {
            return 'vendor-query';
          }
          // NOTE: Do NOT group admin components here — let vite auto-split them
          // as separate lazy chunks via the React.lazy() imports in AdminPanel.tsx
        },
      },
    },
  },
}));

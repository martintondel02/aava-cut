import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4317',
      '/media': 'http://127.0.0.1:4317',
      '/demo': 'http://127.0.0.1:4317',
      '/exports': 'http://127.0.0.1:4317'
    }
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('zustand') || id.includes('immer')) return 'vendor-state';
        }
      }
    }
  }
});

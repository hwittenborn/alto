import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      // Prefix-only builtins aren't in `builtinModules`, so Forge doesn't externalize them.
      external: ['node:sqlite'],
    },
  },
});

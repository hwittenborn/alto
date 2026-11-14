// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import icons from 'unplugin-icons/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The repository root, whose packages (@alto/core, @alto/react) the demo runs on. */
const root = path.resolve(here, '../..');
// https://astro.build/config
export default defineConfig({
  site: 'https://alto.hunterwittenborn.com',
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: {
    plugins: [
      // Provider logos (`~icons/<set>/<icon>?raw`), as SVG strings.
      icons({ compiler: 'raw', scale: 1 }),
    ],
    resolve: {
      alias: {
        '@alto/core': path.join(root, 'packages/core/src/index.ts'),
        '@alto/react': path.join(root, 'packages/react/src/index.tsx'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      fs: { allow: [root] },
    },
  },
});

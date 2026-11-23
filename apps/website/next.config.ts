import path from 'node:path';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

/** The repository root: the packages the demo runs on, the changelog and the app's icon are there. */
const root = path.resolve(import.meta.dirname, '../..');

const dev = process.env.NODE_ENV === 'development';

const config: NextConfig = {
  // *.dev.ts routes exist only in `next dev`.
  pageExtensions: dev ? ['tsx', 'ts', 'mdx', 'dev.ts'] : ['tsx', 'ts', 'mdx'],
  // A static site, for GitHub Pages: every page is built to HTML (into out/).
  output: dev ? undefined : 'export',
  // Published as TypeScript source.
  transpilePackages: ['@alto/core', '@alto/react', '@gtk-js/icons-adwaita', '@gtk-js/icons-gtk4'],
  turbopack: {
    root,
    // Tailwind, as create-next-app sets it up.
    rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } },
  },
  devIndicators: false,
};

// Markdown (.mdx), e.g. the privacy policy's text.
export default createMDX()(config);

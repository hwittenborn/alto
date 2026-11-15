import path from 'node:path';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

/** The repository root: the packages the demo runs on, the changelog and the app's icon are there. */
const root = path.resolve(import.meta.dirname, '../..');

const config: NextConfig = {
  // A static site: every page is built to HTML (into out/), which Vercel serves.
  output: 'export',
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

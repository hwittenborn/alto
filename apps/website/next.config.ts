import path from 'node:path';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

/** The repository root: the packages the demo runs on, the changelog and the app's icon are there. */
const root = path.resolve(import.meta.dirname, '../..');

/** `next dev`, rather than a build. */
const dev = process.env.NODE_ENV === 'development';

const config: NextConfig = {
  // Files named *.dev.ts are routes in `next dev` only: the media pictures,
  // captured live (src/app/media/[file]/route.dev.ts). The build writes them
  // as files instead (scripts/capture-media.ts).
  pageExtensions: dev ? ['tsx', 'ts', 'mdx', 'dev.ts'] : ['tsx', 'ts', 'mdx'],
  // A static site, for GitHub Pages: every page is built to HTML (into out/).
  // (In `next dev`, a server, for the media pictures' route.)
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

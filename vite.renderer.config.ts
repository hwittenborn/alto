import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import icons from 'unplugin-icons/vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

/** Turn the newest CHANGELOG.md section into AppStream-style markup for the About dialog. */
function releaseNotes(): string {
  try {
    const text = readFileSync(path.resolve(__dirname, 'CHANGELOG.md'), 'utf8');
    const section = text.split(/^## /m).find((s) => s.startsWith(`[${pkg.version}]`)) ?? '';
    const items = section
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map(
        (l) =>
          `<li>${l
            .slice(2)
            .replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))
            .replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`,
      );
    return items.length ? `<ul>${items.join('')}</ul>` : '';
  } catch {
    return '';
  }
}

/**
 * The built page's Content Security Policy: only the app's own scripts, and
 * nothing fetched from elsewhere. Styles may be inline (the theme is injected
 * as a style element, and React sets style attributes). Not on the dev
 * server, whose React Refresh preamble is an inline script.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * `$GTK_JS_DIR`: a gtk-js checkout to build against instead of the released
 * packages, to use its changes before they're released (run `vp run
 * build:packages` there first). Its packages by their built bundles, its icon
 * sets by their sources (as they're published), with Alto's React.
 */
const gtkJs = process.env.GTK_JS_DIR && path.resolve(process.env.GTK_JS_DIR);
const GTK_JS_PACKAGES = ['gtk4', 'adwaita', 'gtk-css', 'icon-helpers'];
const gtkJsAliases = gtkJs
  ? [
      ...GTK_JS_PACKAGES.map((name) => ({
        find: new RegExp(`^@gtk-js/${name}$`),
        replacement: path.join(gtkJs, 'packages', name, 'dist/index.js'),
      })),
      { find: /^@gtk-js\/icons-([\w-]+)$/, replacement: path.join(gtkJs, 'icons/$1/src/index.ts') },
      { find: /^@gtk-js\/theme-([\w-]+)$/, replacement: path.join(gtkJs, 'themes/$1/dist/index.js') },
      { find: /^react(-dom)?(\/.*)?$/, replacement: path.resolve(__dirname, 'node_modules/react$1$2') },
    ]
  : [];

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    react(),
    // The React Compiler memoizes components and values, so a render only
    // re-renders what its changes reach.
    babel({ presets: [reactCompilerPreset()] }),
    // Provider logos, imported as `~icons/<set>/<icon>?raw`. Only the icons
    // imported are bundled, as SVG strings.
    icons({ compiler: 'raw', scale: 1 }),
    {
      name: 'alto-content-security-policy',
      apply: 'build',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ],
    },
  ],
  define: {
    ALTO_VERSION: JSON.stringify(pkg.version),
    ALTO_RELEASE_NOTES: JSON.stringify(releaseNotes()),
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // The workspace packages by their sources (rather than through
      // node_modules), so the dev server watches and reloads them.
      { find: '@alto/core', replacement: path.resolve(__dirname, 'packages/core/src/index.ts') },
      { find: '@alto/react', replacement: path.resolve(__dirname, 'packages/react/src/index.tsx') },
      ...gtkJsAliases,
    ],
    dedupe: ['react', 'react-dom'],
  },
  // A checkout's icon sets are thousands of modules: bundled once, like the released ones.
  optimizeDeps: gtkJs
    ? { include: ['@gtk-js/icons-adwaita', '@gtk-js/icons-gtk4', '@gtk-js/icons-mactahoe', '@gtk-js/icons-whitesur'] }
    : undefined,
});

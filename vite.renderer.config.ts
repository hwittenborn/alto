import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import icons from 'unplugin-icons/vite';
import { watch } from 'chokidar';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gitHeadFiles, writeBuildInfo } from './packages/node/src/build-info.ts';

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
      // Regenerate the build information (packages/node/src/build-info.ts)
      // when the checked-out commit changes, so the dev server hot-reloads it.
      name: 'alto-build-info',
      apply: 'serve',
      configureServer(server) {
        writeBuildInfo();
        // Git writes a ref to a lock file and renames it into place, so wait
        // for it to settle.
        let timer: NodeJS.Timeout | undefined;
        const regenerate = () => {
          clearTimeout(timer);
          timer = setTimeout(writeBuildInfo, 200);
        };
        const watcher = watch(gitHeadFiles(), { ignoreInitial: true }).on('all', regenerate);
        server.httpServer?.on('close', () => void watcher.close());
      },
    },
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
    ALTO_RELEASE_NOTES: JSON.stringify(releaseNotes()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // The workspace packages by their sources (rather than through
      // node_modules), so the dev server watches and reloads them.
      '@alto/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@alto/react': path.resolve(__dirname, 'packages/react/src/index.tsx'),
      '@alto/node/build-info.json': path.resolve(__dirname, 'packages/node/src/build-info.generated.json'),
    },
    dedupe: ['react', 'react-dom'],
  },
});

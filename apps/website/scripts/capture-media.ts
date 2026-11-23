// Run after `next build`: screenshots each /media/shot/<id> page into out/media/<id>.png.
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { capture } from '../src/media/capture.ts';
import type { Shot } from '../src/media/shots.tsx';

const out = path.resolve(import.meta.dirname, '../out');

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Serves out/ like GitHub Pages: /x is x.html.
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  for (const candidate of [name, `${name}.html`, path.join(name, 'index.html')]) {
    const file = path.join(out, candidate);
    if (!file.startsWith(out)) break;
    if ((await stat(file).catch(() => null))?.isFile()) {
      const type = TYPES[path.extname(file)];
      res.writeHead(200, type ? { 'content-type': type } : {});
      createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as { port: number };

const pages = (await readdir(path.join(out, 'media/shot'))).filter((f) => f.endsWith('.html'));
const shots = await Promise.all(
  pages.map(async (file) => {
    const html = await readFile(path.join(out, 'media/shot', file), 'utf8');
    const attribute = /data-shot="([^"]*)"/.exec(html)?.[1];
    if (!attribute) throw new Error(`media/shot/${file} has no data-shot`);
    const json = attribute.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&');
    return JSON.parse(json) as Omit<Shot, 'body'>;
  }),
);

const browser = await chromium.launch();
try {
  for (const shot of shots) {
    const png = await capture(browser, `http://127.0.0.1:${port}/media/shot/${shot.id}`, shot);
    if (shot.maxBytes && png.length > shot.maxBytes) {
      throw new Error(`media/${shot.id}.png is ${png.length} bytes, over the ${shot.maxBytes} that ${shot.use} allows`);
    }
    await writeFile(path.join(out, 'media', `${shot.id}.png`), png);
    const size = `${Math.round(shot.width * shot.scale)}×${Math.round(shot.height * shot.scale)}`;
    console.log(`media/${shot.id}.png: ${size}, ${Math.round(png.length / 1024)} kB (${shot.use})`);
  }
} finally {
  await browser.close();
  server.close();
}

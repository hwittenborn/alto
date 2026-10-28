#!/usr/bin/env node
// Render Alto's PNG icons from the SVGs in assets/. Forge runs this before
// `start`, `package` and `make` (the generateAssets hook in forge.config.ts);
// only the SVGs are checked in.
//
// - assets/icons/com.hunterwittenborn.Alto.svg becomes
//   assets/icons/hicolor/<size>x<size>/com.hunterwittenborn.Alto.png, for the
//   window, notifications and the deb/rpm packages.
// - assets/tray/<status>.svg becomes assets/tray/<status>.png (22px) and
//   <status>@2x.png (44px). Electron's tray takes raster images, and the
//   symbolic icons leave their fill to the panel, so they're drawn white.
//
// The icons come from Celeste, Alto's predecessor (by Adrien Facélina).
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/** Rasterize with librsvg (as GNOME does) straight at `size`, not by scaling a larger render. */
async function render(svg, size, out) {
  const width = Number(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/.exec(svg)[1]);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg), { density: (72 * size) / width })
    .resize(size, size)
    .png()
    .toFile(out);
}

const appIcon = readFileSync(join(assets, 'icons', 'com.hunterwittenborn.Alto.svg'), 'utf8');
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  await render(appIcon, size, join(assets, 'icons', 'hicolor', `${size}x${size}`, 'com.hunterwittenborn.Alto.png'));
}

const tray = join(assets, 'tray');
for (const file of readdirSync(tray).filter((f) => f.endsWith('.svg'))) {
  const svg = readFileSync(join(tray, file), 'utf8').replace('<svg ', '<svg fill="#ffffff" ');
  const name = file.replace(/\.svg$/, '');
  await render(svg, 22, join(tray, `${name}.png`));
  await render(svg, 44, join(tray, `${name}@2x.png`));
}

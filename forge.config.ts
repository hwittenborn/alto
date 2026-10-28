import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb, type MakerDebConfig } from '@electron-forge/maker-deb';
import { MakerRpm, type MakerRpmConfig } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFile } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

/** Shared by the deb and rpm packages. */
const linuxOptions = {
  name: 'alto',
  bin: 'alto',
  productName: 'Alto',
  genericName: 'File Synchronizer',
  description: 'Bidirectional file sync for GNOME, powered by rclone',
  productDescription:
    'Alto keeps folders on your computer in sync with cloud storage: Google Drive, Dropbox, Proton Drive, ' +
    'Nextcloud, ownCloud and WebDAV. Changes on both sides are merged, conflicts are ' +
    'never overwritten silently, and exclusion patterns are shared between all your devices.',
  homepage: 'https://github.com/hwittenborn/alto',
  categories: ['Network', 'Utility'] as ('Network' | 'Utility')[],
  desktopTemplate: 'assets/linux/alto.desktop',
  // Installed as /usr/share/pixmaps/alto.png (the desktop file's `Icon=alto`).
  icon: 'assets/icons/hicolor/512x512/com.hunterwittenborn.Alto.png',
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'alto',
    // Tray/notification icons and the sign-in page images. rclone isn't
    // bundled: Alto installs it on its first start (src/main.ts).
    extraResource: ['assets'],
  },
  rebuildConfig: {},
  hooks: {
    // Render the PNG icons from their SVGs (scripts/render-icons.mjs).
    generateAssets: async () => {
      await promisify(execFile)(process.execPath, ['scripts/render-icons.mjs']);
    },
    // Alto's Electron fork ships with debug info (about 1.7 GB of it): strip
    // the packaged Electron binaries when binutils is around.
    postPackage: async (_config, { platform, outputPaths }) => {
      // Alto is English only: drop Chromium's translations of its own strings
      // (about 47 MB). Chromium falls back to en-US.
      for (const dir of outputPaths) {
        const locales = path.join(dir, 'locales');
        const packs = await readdir(locales).catch(() => [] as string[]);
        await Promise.all(packs.filter((pack) => pack !== 'en-US.pak').map((pack) => rm(path.join(locales, pack))));
      }
      if (platform !== 'linux') return;
      const strip = promisify(execFile);
      for (const dir of outputPaths) {
        const files = ['alto', 'chrome_crashpad_handler', 'chrome-sandbox'];
        files.push(...(await readdir(dir)).filter((file) => file.endsWith('.so')));
        await strip('strip', ['--strip-unneeded', ...files.map((file) => path.join(dir, file))]).catch((err: Error) =>
          console.warn(`Not stripping the Electron binaries: ${err.message}`),
        );
      }
    },
  },
  makers: [
    new MakerZIP({}, ['linux']),
    new MakerDeb({ options: { ...linuxOptions, section: 'net' } } satisfies MakerDebConfig),
    new MakerRpm({ options: { ...linuxOptions, license: 'GPL-3.0-or-later' } } satisfies MakerRpmConfig),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;

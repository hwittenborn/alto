import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb, type MakerDebConfig } from '@electron-forge/maker-deb';
import { MakerRpm, type MakerRpmConfig } from '@electron-forge/maker-rpm';
import { MakerAppImage, type MakerAppImageConfig } from '@reforged/maker-appimage';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { installedRclone, installRclone, RCLONE_VERSION } from './packages/node/src/rclone-install.ts';

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

/** Where the build keeps the rclone release it bundles for `arch` (`npm start` runs it from there too). */
const rcloneDir = (arch: string) => path.join(__dirname, '.rclone', arch);

/**
 * Download the rclone release Alto bundles for `arch`, checked against the
 * release's checksums, unless it's already there. `$ALTO_RCLONE_MIRROR` is a
 * mirror of rclone's releases (like https://downloads.rclone.org) to download
 * it from instead of GitHub.
 */
async function fetchRclone(arch: string): Promise<string> {
  const options = { dir: rcloneDir(arch), arch: arch as NodeJS.Architecture };
  const installed = await installedRclone(options);
  if (installed) return installed;
  const mirror = process.env.ALTO_RCLONE_MIRROR?.replace(/\/+$/, '');
  return installRclone({ ...options, baseUrl: mirror && `${mirror}/${RCLONE_VERSION}` });
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'alto',
    // Tray/notification icons and the sign-in page images. rclone is added
    // per architecture (packageAfterExtract below).
    extraResource: ['assets'],
  },
  rebuildConfig: {},
  hooks: {
    // Render the PNG icons from their SVGs (scripts/render-icons.mjs).
    // Download the rclone release Alto bundles, for each architecture built.
    generateAssets: async (_config, _platform, arch) => {
      await promisify(execFile)(process.execPath, ['scripts/render-icons.mjs']);
      for (const each of arch.split(',')) await fetchRclone(each);
    },
    // Bundle rclone as `resources/bin/rclone`, next to Alto's assets (src/main/paths.ts).
    packageAfterExtract: async (_config, buildPath, _electronVersion, _platform, arch) => {
      const bin = path.join(buildPath, 'resources', 'bin');
      await mkdir(bin, { recursive: true });
      await copyFile(await fetchRclone(arch), path.join(bin, 'rclone'));
      await chmod(path.join(bin, 'rclone'), 0o755);
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
    new MakerAppImage({
      options: {
        name: linuxOptions.name,
        bin: linuxOptions.bin,
        productName: linuxOptions.productName,
        genericName: linuxOptions.genericName,
        categories: linuxOptions.categories,
        desktopFile: linuxOptions.desktopTemplate,
        icon: linuxOptions.icon,
      },
    } satisfies MakerAppImageConfig),
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

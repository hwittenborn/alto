import {
  Alto,
  type AltoState,
  type AltoStorage,
  AttentionTracker,
  type AttentionNotice,
  dispatchAltoCall,
  initialState,
  RcloneClient,
} from '@alto/core';
import {
  installedRclone,
  installRclone,
  NodeLocalFs,
  RCLONE_VERSION,
  rcloneBinary,
  RcloneDaemon,
  SqliteStorage,
} from '@alto/node';
import { app, BrowserWindow, dialog, net, Notification, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { copyFile, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import ipc from '@/ipc-main';
import type { MainEvents, SetupState } from '@/ipc-shared';
import { assetPath, cacheDir, configDir, rcloneDir } from './main/paths';
import { isAutostartEnabled, loadPreferences, savePreferences, setAutostart } from './main/preferences';
import { AltoTray } from './main/tray';

app.setName('Alto');
app.setPath('userData', configDir());
// Chromium's caches and crash reports belong in ~/.cache, not next to Alto's settings.
app.setPath('sessionData', path.join(cacheDir(), 'session'));
app.setPath('crashDumps', path.join(cacheDir(), 'crashes'));

const startInBackground = process.argv.includes('--background');

// app.exit(), not app.quit(): quitting is asynchronous, and startup would still
// run, killing the running instance's rclone (RcloneDaemon's stale-daemon cleanup).
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let alto: Alto | null = null;
let daemon: RcloneDaemon | null = null;
let storage: SqliteStorage | null = null;
let tray: AltoTray | null = null;
let quitting = false;
let startupError: string | null = null;
let rclonePath: string | null = null;
let setup: SetupState | null = null;
let retrySetup: (() => void) | null = null;
let startSetup: (() => void) | null = null;
/** No accounts at start: the window greets the user before anything is downloaded. */
let welcome = false;

function send<K extends keyof MainEvents>(channel: K, ...args: Parameters<MainEvents[K]>): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

function currentState(): AltoState | null {
  if (!alto) return null;
  const state = alto.store.getState();
  return startupError ? { ...state, error: startupError } : state;
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow!.show();
  mainWindow!.focus();
}

function quit(): void {
  quitting = true;
  app.quit();
}

/** Window APIs added by Alto's Electron fork; absent (undefined) in stock Electron. */
// TODO: Drop the fork, and this interface, once both Electron PRs ship in a
// stable release: https://github.com/electron/electron/pull/51569 (these
// window APIs) and https://github.com/electron/electron/pull/55415 (the
// Wayland resize fix).
interface ForkWindowApi {
  isTiled?(): boolean;
  setDecorationInsets?(insets: { top: number; right: number; bottom: number; left: number }): boolean;
  on(event: 'tiled-state-changed', listener: (event: unknown, isTiled: boolean) => void): unknown;
}
const fork = (win: BrowserWindow) => win as unknown as ForkWindowApi;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 360,
    minHeight: 420,
    frame: false,
    transparent: true,
    show: false,
    title: 'Alto',
    icon: assetPath('icons', 'hicolor', '256x256', 'com.hunterwittenborn.Alto.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  const win = mainWindow;

  // Forward window state changes to the renderer so it can remove shadow
  // padding when maximized/fullscreen/tiled, or when the window manager can't
  // take insets (stock Electron, no compositing) and would treat the shadow
  // as part of the window.
  const insetsSupported = fork(win).setDecorationInsets?.({ top: 0, right: 0, bottom: 0, left: 0 }) ?? false;
  const sendState = () => {
    const noShadow = !insetsSupported || win.isMaximized() || win.isFullScreen() || Boolean(fork(win).isTiled?.());
    send('window:state-changed', noShadow);
  };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  fork(win).on('tiled-state-changed', sendState);
  win.webContents.on('did-finish-load', sendState);

  // Closing the window keeps Alto syncing in the background.
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
    const prefs = loadPreferences();
    if (!prefs.backgroundNoticeShown && Notification.isSupported()) {
      new Notification({
        title: 'Alto',
        body: 'Alto keeps syncing in the background. Use Quit from the menu to stop it.',
        icon: assetPath('icons', 'hicolor', '128x128', 'com.hunterwittenborn.Alto.png'),
      }).show();
      savePreferences({ ...prefs, backgroundNoticeShown: true });
    }
  });
  win.once('ready-to-show', () => {
    if (!startInBackground) win.show();
  });

  // Links open in the user's browser, never inside the app, and the window
  // never navigates away from it (to a file dropped on it, say).
  const openExternal = (url: string) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    // Vite's dev server reloads the page by navigating to it again.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) return;
    event.preventDefault();
    openExternal(url);
  });
  // Saving a file from the page (About's debugging information) asks where,
  // as GtkFileDialog does: without a save path, Electron saved nothing. The
  // path has to be given right away, so the file is saved to a temporary one
  // first, and copied where the person picks once it's complete, without
  // blocking the main process while they pick.
  win.webContents.session.on('will-download', (_event, item) => {
    const temporary = path.join(app.getPath('temp'), `alto-download-${randomUUID()}`);
    item.setSavePath(temporary);
    item.once('done', (_e, state) => {
      void (async () => {
        if (state !== 'completed') return;
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
        });
        if (!canceled && filePath) await copyFile(temporary, filePath);
      })()
        .catch((err: Error) => console.error(`Unable to save ${item.getFilename()}: ${err.message}`))
        .finally(() => void rm(temporary, { force: true }));
    });
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

function registerIpc(): void {
  ipc.on('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipc.on('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipc.on('window:toggle-maximized', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipc.on('window:set-decoration-insets', (e, top, right, bottom, left) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) fork(win).setDecorationInsets?.({ top, right, bottom, left });
  });
  ipc.on('app:quit', () => quit());
  ipc.on('app:retry-setup', () => retrySetup?.());
  ipc.on('app:start-setup', () => startSetup?.());

  ipc.handle('alto:invoke', async (_e, method, args) => {
    if (!alto) throw new Error('Alto is not running');
    return dispatchAltoCall(alto, method, args);
  });
  ipc.handle('alto:get-state', async () => currentState() ?? initialState(app.getPath('home'), hostname()));
  ipc.handle('dialog:select-folder', async (e, defaultPath) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a Folder',
      defaultPath: defaultPath || app.getPath('home'),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipc.handle('shell:open-path', async (_e, target) => {
    await shell.openPath(target);
  });
  ipc.handle('shell:open-url', async (_e, url) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url);
  });
  ipc.handle('app:get-info', async () => ({
    version: app.getVersion(),
    configDir: configDir(),
    autostart: isAutostartEnabled(),
    rclonePath,
  }));
  ipc.handle('app:set-autostart', async (_e, enabled) => setAutostart(enabled));
  ipc.handle('app:get-setup', async () => setup);
  ipc.handle('app:get-welcome', async () => welcome);
}

function setSetup(state: SetupState | null): void {
  setup = state;
  send('app:setup', state);
}

/** The rclone binary to run without setting up: `$ALTO_RCLONE`, or the release Alto installed in its cache. */
async function readyRclone(): Promise<string | null> {
  return process.env.ALTO_RCLONE || installedRclone({ dir: rcloneDir() });
}

/**
 * Install the rclone release Alto runs in its cache, on the first start and
 * after an update to another release, while the window shows the setup page.
 * Without accounts, it waits until the user has left the welcome page.
 * `$ALTO_RCLONE_MIRROR` is a mirror of rclone's releases (like
 * https://downloads.rclone.org) to download it from instead of GitHub.
 */
async function setUpRclone(): Promise<string> {
  const dir = rcloneDir();
  const mirror = process.env.ALTO_RCLONE_MIRROR?.replace(/\/+$/, '');
  if (setup?.phase === 'pending') {
    await new Promise<void>((resolve) => (startSetup = resolve));
    startSetup = null;
  }
  for (;;) {
    setSetup({ phase: 'downloading', received: 0, total: null });
    let reported = 0;
    try {
      const binary = await installRclone({
        dir,
        baseUrl: mirror && `${mirror}/${RCLONE_VERSION}`,
        fetch: net.fetch as typeof fetch,
        onProgress: ({ received, total }) => {
          // A few updates a second are plenty.
          if (Date.now() - reported < 100 && received !== total) return;
          reported = Date.now();
          setSetup({ phase: 'downloading', received, total });
        },
      });
      setSetup(null);
      return binary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // An update that can't be downloaded now: the release already there still works.
      const previous = await rcloneBinary(dir);
      if (previous) {
        console.warn(`Unable to update rclone, using the installed release: ${message}`);
        setSetup(null);
        return previous;
      }
      setSetup({ phase: 'failed', message });
      await new Promise<void>((resolve) => (retrySetup = resolve));
    }
  }
}

function showNotice(notice: AttentionNotice): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: notice.title,
    body: notice.body,
    icon: assetPath('icons', 'hicolor', '128x128', 'com.hunterwittenborn.Alto.png'),
  });
  notification.on('click', () => {
    showWindow();
    send('app:show-folder', notice.folderId);
  });
  notification.show();
}

async function startAlto(binary: string, storage: AltoStorage): Promise<void> {
  const dir = configDir();
  try {
    daemon = await RcloneDaemon.start({
      binary,
      configPath: path.join(dir, 'rclone.conf'),
      cacheDir: path.join(cacheDir(), 'rclone'),
      logFile: path.join(app.getPath('logs'), 'rclone.log'),
      pidFile: path.join(cacheDir(), 'rclone.pid'),
    });
  } catch (err) {
    startupError = String((err as Error).message ?? err);
  }

  // The desktop's own trash (GIO, Finder, the Recycle Bin), like GTK apps get from g_file_trash.
  const localFs = new NodeLocalFs({ trash: (p) => shell.trashItem(p) });
  // Without rclone, a client that always fails keeps the UI able to show the error.
  const rclone = daemon?.client ?? new RcloneClient({ url: 'http://127.0.0.1:1/' });

  alto = new Alto({
    rclone,
    storage,
    platform: {
      localFs,
      hostName: hostname(),
      openAuthUrl: (url) => shell.openExternal(url),
      log: (level, message, ...data) => {
        if (level === 'error' || level === 'warn' || process.env.ALTO_DEBUG) console[level](message, ...data);
      },
    },
  });

  const attention = new AttentionTracker();
  alto.store.subscribe((state) => {
    const snapshot = startupError ? { ...state, error: startupError } : state;
    send('alto:state', snapshot);
    tray?.update(snapshot);
    for (const notice of attention.update(snapshot)) showNotice(notice);
  });

  if (startupError) {
    alto.store.setState({ error: startupError });
    return;
  }

  const methods = await rclone.listMethods();
  const required = ['config/oauthstatus', 'operations/hashsumfile', 'operations/stat', 'operations/copyfile'];
  const missing = required.filter((m) => !methods.includes(m));
  if (missing.length > 0) {
    const version = await rclone.version().catch(() => ({ version: '?' }));
    startupError = `rclone ${version.version} is too old for Alto. Please install rclone 1.70 or newer.`;
    alto.store.setState({ error: startupError });
    return;
  }

  daemon?.onExit((code) => {
    if (quitting) return;
    startupError = `rclone stopped unexpectedly (exit code ${String(code)}). Restart Alto to continue syncing.`;
    alto?.store.setState({ error: startupError });
  });

  await alto.start();
}

app.on('second-instance', () => showWindow());

app.on('ready', async () => {
  registerIpc();
  tray = new AltoTray({ open: showWindow, syncNow: () => void alto?.syncNow(), quit });
  storage = new SqliteStorage(path.join(configDir(), 'alto.db'));
  // A config Alto can't read isn't a first start: starting reports it.
  welcome = await storage.loadConfig().then(
    (config) => config.remotes.length === 0,
    () => false,
  );
  // Known before the window's first frame, so it opens on the right page.
  const installed = await readyRclone().catch(() => null);
  if (!installed) setup = welcome ? { phase: 'pending' } : { phase: 'downloading', received: 0, total: null };
  createWindow();
  try {
    rclonePath = installed || (await setUpRclone());
    await startAlto(rclonePath, storage);
  } catch (err) {
    startupError = String((err as Error)?.message ?? err);
    if (alto) alto.store.setState({ error: startupError });
    else setSetup({ phase: 'failed', message: startupError });
  }
});

// Alto keeps running in the tray when its window is closed.
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

let cleanedUp = false;
app.on('before-quit', (event) => {
  quitting = true;
  if (cleanedUp) return;
  event.preventDefault();
  void (async () => {
    try {
      await alto?.stop();
      await daemon?.stop();
      await storage?.close();
      tray?.destroy();
    } finally {
      cleanedUp = true;
      app.quit();
    }
  })();
});

// Logging out (or `kill`) sends SIGTERM: quit through the normal path so the
// rclone daemon and the database are shut down cleanly.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => app.quit());
}

app.on('activate', () => showWindow());

import { contextBridge, ipcRenderer } from 'electron';
import type { AltoState } from '@alto/core';
import { invoke, send } from '@/ipc-renderer';
import type { SetupState } from '@/ipc-shared';

function on<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...(args as T));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  invoke,
  send,
  onWindowStateChanged: (callback: (noShadow: boolean) => void) => on('window:state-changed', callback),
  onShowFolder: (callback: (folderId: string) => void) => on('app:show-folder', callback),
  onSetup: (callback: (state: SetupState | null) => void) => on('app:setup', callback),
});

/** Transport for `createAltoClient` from `@alto/core`. */
contextBridge.exposeInMainWorld('altoTransport', {
  invoke: (method: string, args: unknown[]) =>
    ipcRenderer.invoke('alto:invoke', method, args).catch((err: Error) => {
      // Drop Electron's "Error invoking remote method 'alto:invoke': Error: " prefix.
      throw new Error(err.message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, ''));
    }),
  getState: () => ipcRenderer.invoke('alto:get-state') as Promise<AltoState>,
  onState: (callback: (state: AltoState) => void) => on('alto:state', callback),
});

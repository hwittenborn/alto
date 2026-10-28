import type { AltoTransport } from '@alto/core';
import type { RequestChannels, RequestResponseChannels } from '@/ipc-shared';

declare global {
  interface Window {
    electronAPI: {
      invoke<T extends keyof RequestResponseChannels>(
        channel: T,
        ...args: Parameters<RequestResponseChannels[T]>
      ): ReturnType<RequestResponseChannels[T]>;
      send<T extends keyof RequestChannels>(channel: T, ...args: Parameters<RequestChannels[T]>): void;
      onWindowStateChanged(callback: (noShadow: boolean) => void): () => void;
      onShowFolder(callback: (folderId: string) => void): () => void;
      /** The system: `process.platform`, its version (`process.getSystemVersion()`), and `$ALTO_THEME`. */
      platform: { os: string; version: string; theme: string | null };
    };
    altoTransport: AltoTransport;
  }
}

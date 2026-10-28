import type { AltoTransport } from '@alto/core';
import type { RequestChannels, RequestResponseChannels, SetupState } from '@/ipc-shared';

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
      onSetup(callback: (state: SetupState | null) => void): () => void;
    };
    altoTransport: AltoTransport;
  }
}

import { ipcRenderer } from 'electron';
import type { RequestChannels, RequestResponseChannels } from '@/ipc-shared';

export function invoke<T extends keyof RequestResponseChannels>(
  channel: T,
  ...args: Parameters<RequestResponseChannels[T]>
): ReturnType<RequestResponseChannels[T]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<RequestResponseChannels[T]>;
}

export function send<T extends keyof RequestChannels>(channel: T, ...args: Parameters<RequestChannels[T]>): void {
  ipcRenderer.send(channel, ...args);
}

export default { invoke, send };

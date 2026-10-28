import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { RequestChannels, RequestResponseChannels } from '@/ipc-shared';

export function handle<T extends keyof RequestResponseChannels>(
  channel: T,
  listener: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<RequestResponseChannels[T]>
  ) => ReturnType<RequestResponseChannels[T]>,
) {
  ipcMain.handle(channel, listener as Parameters<typeof ipcMain.handle>[1]);
}

export function on<T extends keyof RequestChannels>(
  channel: T,
  listener: (event: IpcMainEvent, ...args: Parameters<RequestChannels[T]>) => void,
) {
  ipcMain.on(channel, listener as Parameters<typeof ipcMain.on>[1]);
}

export default { handle, on };

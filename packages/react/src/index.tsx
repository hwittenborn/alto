/**
 * React bindings for Alto. Nothing here touches the DOM, so the same hooks
 * work in React DOM (desktop) and React Native (mobile).
 */
import type { AltoClient, AltoState, FolderView, RemoteView } from '@alto/core';
import { createContext, type ReactNode, useContext } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';

const AltoContext = createContext<AltoClient | null>(null);

export function AltoProvider({ client, children }: { client: AltoClient; children: ReactNode }) {
  return <AltoContext.Provider value={client}>{children}</AltoContext.Provider>;
}

/** The Alto client (commands). */
export function useAlto(): AltoClient {
  const client = useContext(AltoContext);
  if (!client) throw new Error('useAlto() must be used inside <AltoProvider>');
  return client;
}

/** Select part of the Alto state. Re-renders only when the selection changes (shallowly). */
export function useAltoState<T>(selector: (state: AltoState) => T): T {
  const client = useAlto();
  return useStoreWithEqualityFn(client.store, selector, shallow);
}

export function useRemotes(): RemoteView[] {
  return useAltoState((s) => s.remotes);
}

export function useRemote(name: string | null): RemoteView | null {
  return useAltoState((s) => s.remotes.find((r) => r.name === name) ?? null);
}

export function useFolders(remote?: string | null): FolderView[] {
  return useAltoState((s) => (remote === undefined ? s.folders : s.folders.filter((f) => f.remote === remote)));
}

export function useFolder(id: string | null): FolderView | null {
  return useAltoState((s) => s.folders.find((f) => f.id === id) ?? null);
}

/** Issue counts and activity per remote, for sidebar badges. */
export function useRemoteActivity(name: string): { busy: boolean; issues: number; offline: boolean } {
  return useAltoState((s) => {
    const folders = s.folders.filter((f) => f.remote === name);
    return {
      busy: folders.some((f) => f.runtime.phase === 'checking' || f.runtime.phase === 'syncing'),
      issues: folders.reduce((n, f) => n + f.runtime.issues.length + (f.runtime.phase === 'error' ? 1 : 0), 0),
      offline: folders.length > 0 && folders.every((f) => f.runtime.phase === 'offline'),
    };
  });
}

export function useHomeDir(): string {
  return useAltoState((s) => s.homeDir);
}

import { createStore } from 'zustand/vanilla';
import type { AltoClient } from './alto.ts';
import { ALTO_API_METHODS, type AltoApi, type AltoApiMethod, type AltoState, initialState } from './state.ts';

/** What a transported call returns: its value and the host's state revision when it finished. */
export interface AltoCallResult {
  value: unknown;
  revision: number;
}

/**
 * Transport between a UI and an `Alto` instance living elsewhere (Electron's
 * main process, a worker, a native module, …).
 */
export interface AltoTransport {
  /** Run a call on the host (see `dispatchAltoCall`). */
  invoke(method: AltoApiMethod, args: unknown[]): Promise<AltoCallResult>;
  /** Fetch the current state snapshot. */
  getState(): Promise<AltoState>;
  /** Subscribe to state snapshots pushed by the host. Returns an unsubscribe function. */
  onState(listener: (state: AltoState) => void): () => void;
}

/** How long a reply waits for the state it caused before resolving anyway. */
const STATE_SYNC_TIMEOUT = 2000;

/** Build an `AltoClient` that forwards commands over a transport and mirrors state. */
export function createAltoClient(transport: AltoTransport): AltoClient & { dispose(): void } {
  const store = createStore<AltoState>(() => initialState());
  const apply = (state: AltoState) => {
    // Snapshots can arrive out of order (e.g. the initial fetch after a push).
    if (state.revision >= store.getState().revision) store.setState(state, true);
  };
  const unsubscribe = transport.onState(apply);
  void transport.getState().then(apply);

  // Replies and state pushes may travel separately: a reply only resolves once
  // the mirrored state includes everything the call did, so UIs can rely on
  // e.g. a just-created account being in the state when `createRemote` returns.
  const caughtUp = (revision: number) =>
    new Promise<void>((resolve) => {
      if (store.getState().revision >= revision) return resolve();
      const done = () => {
        stop();
        clearTimeout(timer);
        resolve();
      };
      const stop = store.subscribe((state) => {
        if (state.revision >= revision) done();
      });
      const timer = setTimeout(done, STATE_SYNC_TIMEOUT);
    });

  const api = Object.fromEntries(
    ALTO_API_METHODS.map((method) => [
      method,
      async (...args: unknown[]) => {
        const { value, revision } = await transport.invoke(method, args);
        await caughtUp(revision);
        return value;
      },
    ]),
  ) as unknown as AltoApi;

  return { ...api, store, dispose: unsubscribe };
}

/**
 * Host side: dispatch a transported call to an Alto instance.
 * Unknown methods are rejected so a compromised UI can't reach other members.
 */
export async function dispatchAltoCall(alto: AltoClient, method: string, args: unknown[]): Promise<AltoCallResult> {
  if (!(ALTO_API_METHODS as readonly string[]).includes(method)) {
    throw new Error(`Unknown Alto method '${method}'`);
  }
  const fn = alto[method as AltoApiMethod] as (...a: unknown[]) => Promise<unknown>;
  const value = await fn.apply(alto, args);
  return { value, revision: alto.store.getState().revision };
}

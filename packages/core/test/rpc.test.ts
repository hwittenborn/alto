import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { type AltoTransport, createAltoClient, dispatchAltoCall } from '../src/rpc.ts';
import { type AltoState, initialState } from '../src/state.ts';
import type { AltoClient } from '../src/alto.ts';

/** A transport whose replies overtake the state pushes they caused. */
function racyTransport() {
  const listeners = new Set<(state: AltoState) => void>();
  let state = initialState('/home/me', 'host');
  const pending: AltoState[] = [];
  const transport: AltoTransport = {
    async invoke(method) {
      // The host changed its state while handling the call…
      state = { ...state, revision: state.revision + 1, ready: method === 'syncNow' ? true : state.ready };
      pending.push(state);
      // …and the reply is delivered before the state push.
      return { value: 'done', revision: state.revision };
    },
    getState: async () => state,
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const flushPushes = () => {
    for (const s of pending.splice(0)) for (const l of listeners) l(s);
  };
  const pushStale = (s: AltoState) => {
    for (const l of listeners) l(s);
  };
  return { transport, flushPushes, pushStale };
}

describe('createAltoClient', () => {
  it('resolves a call only once the state it caused has arrived', async () => {
    const { transport, flushPushes } = racyTransport();
    const client = createAltoClient(transport);
    let resolved = false;
    const call = client.syncNow().then(() => (resolved = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    flushPushes();
    await call;
    expect(client.store.getState().ready).toBe(true);
    client.dispose();
  });

  it('ignores snapshots older than the one it has', async () => {
    const { transport, flushPushes, pushStale } = racyTransport();
    const client = createAltoClient(transport);
    const call = client.syncNow();
    flushPushes();
    await call;
    pushStale(initialState());
    expect(client.store.getState().ready).toBe(true);
    client.dispose();
  });
});

describe('dispatchAltoCall', () => {
  it('returns the value with the revision after the call', async () => {
    const store = createStore<AltoState>(() => initialState());
    const alto = {
      store,
      async syncNow() {
        store.setState({ revision: 7 });
      },
    } as unknown as AltoClient;
    await expect(dispatchAltoCall(alto, 'syncNow', [])).resolves.toEqual({ value: undefined, revision: 7 });
    await expect(dispatchAltoCall(alto, 'constructor', [])).rejects.toThrow(/Unknown Alto method/);
  });
});

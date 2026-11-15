import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * Whether this is drawn in the browser (true), rather than to HTML when the
 * site is built (false). For what can only be drawn in a page.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

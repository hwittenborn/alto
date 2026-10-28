import { AdwToastOverlay, type AdwToast, type AdwToastOverlayRef } from '@gtk-js/adwaita';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext<(toast: AdwToast | string) => void>(() => {});

/** Show transient in-app notifications (AdwToast). */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const ref = useRef<AdwToastOverlayRef>(null);
  const show = useCallback((toast: AdwToast | string) => {
    ref.current?.addToast(typeof toast === 'string' ? { title: toast } : toast);
  }, []);
  // Failures of fire-and-forget actions (a button whose action failed) are
  // shown instead of disappearing into the console.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      show(reason instanceof Error ? reason.message : String(reason));
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [show]);

  return (
    <ToastContext.Provider value={show}>
      <AdwToastOverlay toastRef={ref} style={{ height: '100%' }}>
        {children}
      </AdwToastOverlay>
    </ToastContext.Provider>
  );
}

/** The current time, updated every `interval` ms: for relative times like "2 minutes ago". */
export function useNow(interval = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

/** `value`, or its last non-null value once it becomes null (e.g. while a dialog or page animates away). */
export function useRetained<T>(value: T | null): T | null {
  const last = useRef(value);
  if (value !== null) last.current = value;
  return value ?? last.current;
}

export const host = {
  selectFolder: (defaultPath?: string) => window.electronAPI.invoke('dialog:select-folder', defaultPath),
  openPath: (path: string) => window.electronAPI.invoke('shell:open-path', path),
  openUrl: (url: string) => window.electronAPI.invoke('shell:open-url', url),
  quit: () => window.electronAPI.send('app:quit'),
  info: () => window.electronAPI.invoke('app:get-info'),
  setAutostart: (enabled: boolean) => window.electronAPI.invoke('app:set-autostart', enabled),
};

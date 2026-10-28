import { AdwAlertDialog, GtkScrolledWindow, GtkTextView } from '@gtk-js/adwaita';
import { useRetained } from '../ui';

export interface ErrorDialogContent {
  /** Headline. */
  message: string;
  /** Explanation below the headline. */
  body?: string;
  /** Technical details, shown in a code block. */
  detail?: string;
}

/**
 * An error alert, shown while `error` is set. Keep it mounted: it animates
 * out (with its last content) when `error` becomes null.
 */
export function ErrorDialog({
  error,
  onClose,
  onHidden,
}: {
  error: ErrorDialogContent | null;
  onClose(): void;
  onHidden?(): void;
}) {
  const shown = useRetained(error);
  const detail = shown?.detail;
  return (
    <AdwAlertDialog
      visible={error !== null}
      heading={shown?.message ?? ''}
      body={shown?.body}
      preferWideLayout={Boolean(detail && detail.length > 80)}
      extraChild={
        detail ? (
          // A code block: at least 100px tall, in the monospace font.
          <GtkScrolledWindow hasFrame minContentHeight={100} maxContentHeight={200}>
            <GtkTextView
              value={detail}
              readOnly
              editable={false}
              monospace
              wrapMode="word-char"
              cursorVisible={false}
            />
          </GtkScrolledWindow>
        ) : undefined
      }
      responses={[{ id: 'ok', label: 'OK', appearance: 'suggested' }]}
      defaultResponse="ok"
      closeResponse="ok"
      onResponse={onClose}
      onHidden={onHidden}
    />
  );
}

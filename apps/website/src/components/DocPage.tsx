/**
 * A page of writing (the changelog, the privacy policy): its title and a line
 * under it, then the text, set for reading.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './DocPage.module.css';

interface Props {
  title: string;
  /** The line under the title. */
  lede?: string;
  /** Under the title and lede, before the text. */
  meta?: ReactNode;
  /** Shown as it is, without the entrance (the title rising, the text fading up). */
  still?: boolean;
  children: ReactNode;
}

export default function DocPage({ title, lede, meta, still = false, children }: Props) {
  const fade = still ? {} : { 'data-enter-fade': '' };
  return (
    <main className={styles.doc}>
      <header>
        <h1 className={styles.title}>
          {still ? (
            title
          ) : (
            <span className="enter-line">
              <span>{title}</span>
            </span>
          )}
        </h1>
        {lede && (
          <p className={`lede ${styles.lede}`} {...fade}>
            {lede}
          </p>
        )}
        {meta}
      </header>
      <article className={styles.prose} {...fade} style={{ '--i': 1 } as CSSProperties}>
        {children}
      </article>
    </main>
  );
}

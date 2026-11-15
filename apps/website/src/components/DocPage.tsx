/**
 * A page of writing (the changelog, the privacy policy): its title and a line
 * under it, then the text, set for reading.
 */
import type { ReactNode } from 'react';
import { cssVars } from '../lib/css';

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
    <main className="max-w-[760px] mx-auto mt-14">
      <header>
        <h1 className="text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.05]">
          {still ? (
            title
          ) : (
            <span className="enter-line">
              <span>{title}</span>
            </span>
          )}
        </h1>
        {lede && (
          <p className={`lede text-[1.15rem] leading-[1.6] mt-[18px] mb-0 mx-0`} {...fade}>
            {lede}
          </p>
        )}
        {meta}
      </header>
      <article className="prose mt-12 leading-[1.7]" {...fade} style={cssVars({ '--i': 1 })}>
        {children}
      </article>
    </main>
  );
}

'use client';

/**
 * The header's bar: marked `data-scrolled` once the page has scrolled a way
 * down, which gathers it into a floating frosted pill (SiteHeader.module.css).
 */
import { type ReactNode, useEffect, useState } from 'react';

/** Whether the page has scrolled further down than `offset` px. */
function useScrolledPast(offset: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const update = () => setPast(scrollY > offset);
    update();
    addEventListener('scroll', update, { passive: true });
    return () => removeEventListener('scroll', update);
  }, [offset]);
  return past;
}

export function ScrollPill({ className, children }: { className?: string; children: ReactNode }) {
  const scrolled = useScrolledPast(160);
  return (
    <div className={className} data-scrolled={scrolled || undefined}>
      {children}
    </div>
  );
}

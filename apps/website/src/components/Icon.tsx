/**
 * An icon: SVG markup sized 1em square (icon() in src/lib/icons.ts), inline
 * with the text around it, in its color.
 */
import type { CSSProperties } from 'react';

export function Icon({ svg, className, style }: { svg: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

import type { CSSProperties } from 'react';

/** CSS custom properties ("--i", "--brand"), for `style`. */
export const cssVars = (values: Record<`--${string}`, string | number>) => values as CSSProperties;

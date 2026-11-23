/**
 * The media pages: pictures of Alto, drawn by the site and captured as PNGs
 * (scripts/capture-media.ts) for the README, the Snap Store and link
 * previews. Their own root layout: no header or footer, and a transparent
 * page, so the window's shadow falls on nothing.
 */
import '@fontsource-variable/geist';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './grounds.css';
import './media.css';

export const metadata: Metadata = { robots: { index: false } };

export default function MediaLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}

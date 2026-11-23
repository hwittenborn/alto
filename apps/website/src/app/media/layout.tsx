// Transparent and bare, so a window's shadow falls on nothing.
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

/**
 * Every page: the header, the page, the footer, and what's in <head>.
 */
import '@fontsource-variable/geist';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import { appIconUrl } from '../lib/app-icon';
import { SITE } from '../lib/providers';
import '../styles/site.css';

const description =
  'Alto keeps folders on your computer in two-way sync with Google Drive, Dropbox, OneDrive, Proton Drive, Nextcloud and more.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Alto',
  description,
  icons: { icon: { url: appIconUrl, type: 'image/svg+xml' } },
  openGraph: { title: 'Alto', description },
};

/**
 * Before the page is drawn: the page's entrance plays as it shows (site.css).
 * The homepage stays hidden until its live Alto window is drawn
 * (`alto-demo:ready`, from DemoStage), so it shows all at once: not without
 * the window, nor with what's around it out of place (or after a few seconds,
 * whatever happens).
 */
const ENTRANCE = `(() => {
  const html = document.documentElement;
  const show = () => {
    delete html.dataset.waiting;
    html.dataset.entered = '';
  };
  if (location.pathname !== '/' || window.altoDemoReady) return show();
  html.dataset.waiting = '';
  addEventListener('alto-demo:ready', show, { once: true });
  setTimeout(show, 4000);
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The entrance script sets attributes on <html> before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: ENTRANCE }} />
        <noscript>
          <style>{'html[data-waiting] body { opacity: 1 !important; }'}</style>
        </noscript>
      </head>
      <body>
        <div className="page">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

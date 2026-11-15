/**
 * Every page: the header, the page, the footer, and what's in <head>.
 */
import '@fontsource-variable/geist';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import { appIconUrl } from '../lib/app-icon';
import { SITE } from '../lib/site';
import '../styles/site.css';

const description =
  'Alto keeps folders on your computer in two-way sync with Google Drive, Dropbox, OneDrive, Proton Drive, Nextcloud and more.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  // A page's own title, then the site's ("Changelog · Alto").
  title: { default: 'Alto', template: '%s · Alto' },
  description,
  icons: { icon: { url: appIconUrl, type: 'image/svg+xml' } },
  openGraph: { title: 'Alto', description },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
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

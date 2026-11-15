/**
 * The privacy policy, for the Alto app and this website. Laid out after
 * rclone's (rclone.org/privacy), whose engine Alto runs on.
 *
 * "Last updated" is the date of the last commit that changed this file, read
 * from git when the site is built (the build date before its first commit).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Metadata } from 'next';
import DocPage from '../../components/DocPage';
import { Link } from '../../components/Link';
import { formatDate } from '../../lib/dates';
import { LINKS, SITE } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What Alto, the cloud sync app, and its website do with your data: it stays between your computer and your cloud provider.',
  alternates: { canonical: '/privacy' },
};

function lastUpdated(): Date {
  try {
    const file = path.resolve(process.cwd(), 'src/app/privacy/page.tsx');
    const date = execFileSync('git', ['log', '-1', '--follow', '--format=%cI', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (date) return new Date(date);
  } catch {
    // Not in a git checkout: the build date, then.
  }
  return new Date();
}

export default function PrivacyPage() {
  const updated = lastUpdated();
  const host = new URL(SITE).host;
  return (
    <DocPage
      still
      title="Privacy policy"
      meta={
        <>
          <p className="text-muted text-[0.9rem] mt-3.5 mb-0 mx-0">
            Last updated <time dateTime={updated.toISOString()}>{formatDate(updated)}</time>
          </p>
          {/* The policy in short, before the detail: the chip on its own line, the summary under it. */}
          <aside
            className={`glass-panel flex flex-col items-start gap-2 mt-6 py-3.5 px-[18px] rounded-2xl [&_p]:m-0 [&_p]:leading-[1.5]`}
            aria-label="In short"
          >
            <span className="chip">TL;DR</span>
            <p>
              Alto is free and open source, and runs on your computer. Your files and sign-ins stay between you and your
              cloud provider, and never pass through us.
            </p>
          </aside>
        </>
      }
    >
      <h2>What this policy covers</h2>
      <p>This policy covers:</p>
      <ul>
        <li>
          <strong>Alto,</strong> the desktop app that keeps folders on your computer in sync with your cloud storage.
        </li>
        <li>
          <strong>This website,</strong> {host}.
        </li>
      </ul>

      <h2>This website</h2>
      <ul>
        <li>It sets no cookies, and runs no analytics, ads or trackers.</li>
        <li>Its fonts, pictures and scripts are served by the site itself, not loaded from anyone else.</li>
        <li>
          The live demo on the homepage runs entirely in your browser. The accounts and folders in it are made up, and
          nothing you do in it is sent anywhere.
        </li>
        <li>
          The site is hosted on GitHub Pages. Like any web host, GitHub may log technical details of visits, such as IP
          addresses, as described in the{' '}
          <Link href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub General Privacy Statement
          </Link>
          .
        </li>
      </ul>

      <h2>What the app accesses</h2>
      <p>
        When you connect an account and choose folders to sync, Alto uses <Link href="https://rclone.org">rclone</Link>,
        on your computer, to access:
      </p>
      <ul>
        <li>
          <strong>Your files,</strong> in the folders you choose to sync: their names, sizes, modification times and
          contents, on your computer and in your cloud.
        </li>
        <li>
          <strong>Your account's details:</strong> its name or email address and how much storage it uses, to show you.
        </li>
        <li>
          <strong>Your sign-in:</strong> depending on the provider, either the access token it gives Alto when you sign
          in with your browser, or the username and password you enter (and a two-factor code, if your account asks for
          one).
        </li>
      </ul>

      <h2>How it uses it</h2>
      <p>
        Only to do what you ask: keep your folders in sync between your computer and your account, and show you how
        that's going. None of it is used for advertising, analytics, training AI models or anything else.
      </p>

      <h2>Where it's kept</h2>
      <ul>
        <li>
          Your sign-ins, Alto's settings and what it remembers about your last sync are kept on your computer, in Alto's
          folder in your home folder.
        </li>
        <li>
          They can be read by your user account on that computer, so anyone who can use your account there could read
          them too.
        </li>
        <li>
          Your files travel straight between your computer and your provider over the network, and are only held in
          memory while they do.
        </li>
      </ul>

      <h2>Who it's shared with</h2>
      <p>
        No one. Alto only talks to your cloud provider (and its sign-in page, when you sign in). The people who make
        Alto never see your files, sign-ins or account details, and Alto sends no telemetry, analytics or crash reports.
      </p>

      <h2>Signing in with your browser</h2>
      <p>
        When you sign in with your browser, Alto signs in through its own registered app with your provider, so the
        provider can show you who is asking for access before you allow it. That doesn't route anything through us: the
        access token comes back to Alto on your computer. You can sign in with your own app registration instead, under
        Advanced in Alto's sign-in form.
      </p>

      <h2>Google user data</h2>
      <p>
        Google Drive asks for access to all of your Drive files, so Alto can sync any folder you pick, wherever it is in
        your Drive.
      </p>
      <p>
        Alto's use and transfer of information received from Google APIs adheres to the{' '}
        <Link href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </Link>
        , including the Limited Use requirements.
      </p>

      <h2>Removing your data</h2>
      <ul>
        <li>
          Removing an account in Alto deletes its sign-in from Alto's configuration file. Your files stay where they
          are, on your computer and in your cloud.
        </li>
        <li>To remove everything Alto has kept, delete its folder (above).</li>
        <li>
          If you signed in with your browser, you can also take back Alto's access in your provider's account settings.
        </li>
      </ul>

      <h2>Other sites</h2>
      <p>Links from Alto and this site can lead to other sites, which have their own privacy policies.</p>
      <p>
        Alto is built on rclone, which runs on your computer as part of Alto. For rclone's own project and website, see{' '}
        <Link href="https://rclone.org/privacy/">rclone's privacy policy</Link>.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        Changes are published on this page, with the date above, and every change is in this site's history{' '}
        <Link href={LINKS.github}>on GitHub</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or about Alto's handling of your data are welcome as an{' '}
        <Link href={LINKS.issues}>issue on GitHub</Link>.
      </p>
    </DocPage>
  );
}

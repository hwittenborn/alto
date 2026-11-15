/**
 * The privacy policy, for the Alto app and this website. Laid out after
 * rclone's (rclone.org/privacy), whose engine Alto runs on. Its text is
 * policy.mdx.
 *
 * "Last updated" is the date of the last commit that changed the text, read
 * from git when the site is built (the build date before its first commit).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Metadata } from 'next';
import DocPage from '../../components/DocPage';
import { formatDate } from '../../lib/dates';
import { SITE } from '../../lib/site';
import Policy from './policy.mdx';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What Alto, the cloud sync app, and its website do with your data: it stays between your computer and your cloud provider.',
  alternates: { canonical: '/privacy' },
};

function lastUpdated(): Date {
  try {
    const file = path.resolve(process.cwd(), 'src/app/privacy/policy.mdx');
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
      <Policy host={host} />
    </DocPage>
  );
}

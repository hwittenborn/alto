/**
 * The homepage: the words centered over Alto, live in the page (DemoStage),
 * which stands in a soft pastel glow; then three reasons for Alto, and the
 * install band.
 */
import type { Metadata } from 'next';
import DemoStage from '../demo/DemoStageLoader';
import { appIconSvg } from '../lib/app-icon';
import { Icon } from '../components/Icon';
import { Link } from '../components/Link';
import { cssVars } from '../lib/css';
import { downloadIcon, providerLogos } from '../lib/icons';
import { LINKS } from '../lib/site';

export const metadata: Metadata = { alternates: { canonical: '/' } };

const order = (i: number) => cssVars({ '--i': i });

/** A reason's mark: a line drawing, in the accent color. */
function Mark({ path }: { path: string }) {
  return (
    <span
      className="grid place-items-center size-[2.25em] rounded-[0.65em] text-accent bg-[color-mix(in_srgb,var(--accent-ink)_12%,transparent)] mb-3.5 [&_svg]:size-[1.2em] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.5] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16">
        <path d={path} />
      </svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <main>
      <section className={`wrap min-h-[calc(100svh-80px)] flex flex-col justify-center gap-10 pt-10 pb-12`}>
        <div className="text-center max-w-[880px] mx-auto">
          <h1 className="text-[clamp(2.4rem,5.4vw,4.2rem)] leading-[1.03]">
            <span className="enter-line" style={order(0)}>
              <span>Sync all of your cloud storage</span>
            </span>
            <span className="enter-line" style={order(1)}>
              <span>in one place</span>
            </span>
          </h1>
          <p
            className={`lede text-[1.15rem] leading-[1.55] mt-5 mx-auto mb-0 max-w-[36rem]`}
            data-enter-fade=""
            style={order(0)}
          >
            Alto keeps folders on your computer in two-way sync with Google Drive, Dropbox, OneDrive, Proton Drive,
            Nextcloud and more.
          </p>
          <div className="flex justify-center mt-7" data-enter-fade="" style={order(1)}>
            <a className="button primary" href={LINKS.install}>
              <Icon svg={downloadIcon()} /> Install Alto
            </a>
          </div>
        </div>
        <div className="relative isolate w-full max-w-[1180px] mx-auto pt-7 pb-2 [--stage-gutter:56px] before:content-[''] before:absolute before:-inset-x-5 before:-inset-y-10 before:-z-1 before:pointer-events-none before:glow-pedestal">
          <DemoStage height="min(620px, 72vh)" assets={{ logos: providerLogos(), appIcon: appIconSvg() }} />
        </div>
      </section>

      <section className="wrap" aria-labelledby="points-title">
        <h2 id="points-title" className="visually-hidden">
          Why Alto
        </h2>
        <ul
          className={`glass-panel list-none mt-2 mb-0 p-0 grid grid-cols-3 rounded-[22px] [&_li]:py-[26px] [&_li]:px-7 [&_li+li]:[border-left:1px_solid_var(--line)] [&_p]:text-muted [&_p]:leading-[1.55] [&_p]:m-0 max-[760px]:grid-cols-1 max-[760px]:[&_li]:p-[22px] max-[760px]:[&_li+li]:[border-left:0] max-[760px]:[&_li+li]:[border-top:1px_solid_var(--line)]`}
        >
          <li>
            <Mark path="M3 2.75h10c.69 0 1.25.56 1.25 1.25v8c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25V4c0-.69.56-1.25 1.25-1.25zM1.75 6h12.5" />
            <h3 className="text-[1.1rem] font-medium tracking-[-0.01em] mt-0 mb-1.5">Native on your desktop</h3>
            <p>Made to look and feel at home on your desktop.</p>
          </li>
          <li>
            <Mark path="M8 1.75 2.75 3.75v4c0 3.1 2.2 5.5 5.25 6.5 3.05-1 5.25-3.4 5.25-6.5v-4zM5.75 8l1.6 1.6 2.9-3.1" />
            <h3 className="text-[1.1rem] font-medium tracking-[-0.01em] mt-0 mb-1.5">No tracking</h3>
            <p>
              There's no Alto account to make, and nothing about you is collected. Your sign-ins stay on your computer.
            </p>
          </li>
          <li>
            <Mark path="M5.25 4.5 1.75 8l3.5 3.5M10.75 4.5 14.25 8l-3.5 3.5" />
            <h3 className="text-[1.1rem] font-medium tracking-[-0.01em] mt-0 mb-1.5">Open source</h3>
            <p>
              Free under the GPL, with every line public. Find it <Link href={LINKS.github}>on GitHub</Link>.
            </p>
          </li>
        </ul>
      </section>

      <section className={`wrap pt-24 pb-[72px]`}>
        <div className="relative overflow-hidden rounded-[28px] p-[clamp(36px,5vw,64px)] text-center bg-card shadow-[inset_0_0_0_1px_var(--line)] flex flex-col items-center gap-4 before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none before:glow-band [&>*]:relative [&_p]:text-muted [&_p]:leading-[1.55] [&_p]:m-0 [&_p]:text-[1.15rem]">
          <h2 className="text-[clamp(2rem,4vw,3.1rem)] font-medium tracking-[-0.045em] leading-[1.08] m-0">Get Alto</h2>
          <p>Free and open source. Out now for Linux, with more platforms on the way.</p>
          <a className="button primary" href={LINKS.install}>
            Install Alto
          </a>
        </div>
      </section>
    </main>
  );
}

/**
 * The site's header. At the top of the page it spreads across the content
 * width, plain; once the page has scrolled a way down it gathers into a
 * floating frosted pill (ScrollPill), and spreads out again back at the top.
 */
import { appIconUrl } from '../lib/app-icon';
import { downloadIcon, icon } from '../lib/icons';
import { LINKS } from '../lib/site';
import { Icon } from './Icon';
import { Link } from './Link';
import { ScrollPill } from './ScrollPill';

export default function SiteHeader() {
  return (
    <header className="sticky top-3.5 z-(--z-header) flex justify-center pt-3.5">
      <ScrollPill className="flex items-center justify-between gap-10 w-[min(100%,var(--wrap))] py-2 rounded-full bg-transparent shadow-[inset_0_0_0_1px_transparent,0_10px_30px_-18px_transparent] [transition:width_650ms_cubic-bezier(0.65,0,0.35,1),padding_650ms_cubic-bezier(0.65,0,0.35,1),background-color_500ms_ease-in-out,box-shadow_500ms_ease-in-out] data-scrolled:w-[min(100%,760px)] data-scrolled:py-2 data-scrolled:pr-2 data-scrolled:pl-[18px] data-scrolled:bg-glass data-scrolled:backdrop-blur-[16px] data-scrolled:backdrop-saturate-140 data-scrolled:shadow-[inset_0_0_0_1px_var(--line),0_10px_30px_-18px_rgb(0_0_0/40%)] motion-reduce:transition-none max-[720px]:gap-3">
        <a
          className="flex items-center gap-[0.5em] text-[1.2rem] font-semibold tracking-[-0.02em] no-underline [&_img]:size-[1.65em]"
          href="/"
        >
          <img src={appIconUrl} alt="" width="32" height="32" /> Alto
        </a>
        <nav className="flex items-center gap-[22px]">
          <a className={`quiet-link max-[720px]:hidden`} href={LINKS.changelog}>
            Changelog
          </a>
          <Link
            className={`quiet-link inline-flex items-center gap-[7px]`}
            href={LINKS.github}
            aria-label="Alto on GitHub"
          >
            <Icon svg={icon('simple-icons:github')} className="text-[1.06em]" />
            <span className="max-[720px]:hidden">GitHub</span>
          </Link>
          <a className="button primary small" href={LINKS.install}>
            <Icon svg={downloadIcon()} />
            Install Alto
          </a>
        </nav>
      </ScrollPill>
    </header>
  );
}

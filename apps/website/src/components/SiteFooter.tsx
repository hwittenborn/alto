import { LINKS } from '../lib/site';
import { Link } from './Link';

/** This year, as of the build. */
const year = new Date().getFullYear();

export default function SiteFooter() {
  return (
    <footer
      className={`wrap flex justify-between flex-wrap gap-3 pt-7 pb-[90px] [border-top:1px_solid_var(--line)] text-muted text-[0.9rem]`}
    >
      <span>© {year} Hunter Wittenborn</span>
      <nav className="flex gap-[18px] flex-wrap">
        <a className="quiet-link" href={LINKS.privacy}>
          Privacy
        </a>
        <a className="quiet-link" href={LINKS.changelog}>
          Changelog
        </a>
        <Link className="quiet-link" href={LINKS.github}>
          Source
        </Link>
        <Link className="quiet-link" href={LINKS.issues}>
          Report an issue
        </Link>
      </nav>
    </footer>
  );
}

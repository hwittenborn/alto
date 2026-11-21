/**
 * Icons from icon sets, as SVG markup sized 1em square, read when the site is
 * built: the sets are read from disk as they're needed (they're megabytes
 * each, for a handful of icons), never bundled, and never reach the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { convertParsedSVG, getIconData, iconToHTML, iconToSVG, parseSVGContent } from '@iconify/utils';
import type { SiteProviderId } from './providers';
import { REPO_ROOT } from './repo';

/** An icon set, as the @iconify-json packages have it. */
type IconSet = Parameters<typeof getIconData>[0];

const sets = new Map<string, IconSet>();

/**
 * The logos kept in the repository (assets/providers), as a set named `alto`:
 * those no icon set has yet. The app has them as the same set
 * (vite.renderer.config.ts).
 */
function altoSet(): IconSet {
  const dir = path.join(REPO_ROOT, 'assets/providers');
  const icons: IconSet['icons'] = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const parsed = parseSVGContent(fs.readFileSync(path.join(dir, file), 'utf8'));
    const icon = parsed && convertParsedSVG(parsed);
    if (!icon) throw new Error(`Can't read assets/providers/${file}`);
    icons[file.slice(0, -'.svg'.length)] = icon;
  }
  return { prefix: 'alto', icons };
}

/** An installed set (@iconify-json/<name>), in the site's node_modules or the repository's; or `alto` (altoSet). */
function iconSet(name: string): IconSet {
  let set = sets.get(name);
  if (!set && name === 'alto') {
    set = altoSet();
    sets.set(name, set);
  }
  if (!set) {
    const file = [process.cwd(), REPO_ROOT]
      .map((dir) => path.join(dir, 'node_modules/@iconify-json', name, 'icons.json'))
      .find((candidate) => fs.existsSync(candidate));
    if (!file) throw new Error(`@iconify-json/${name} isn't installed`);
    set = JSON.parse(fs.readFileSync(file, 'utf8')) as IconSet;
    sets.set(name, set);
  }
  return set;
}

/** An icon by its set and name ("simple-icons:github"). */
export function icon(name: string): string {
  const [set, id] = name.split(':') as [string, string];
  const data = getIconData(iconSet(set), id);
  if (!data) throw new Error(`No icon ${name}`);
  const { attributes, body } = iconToSVG(data, { width: '1em', height: '1em' });
  return iconToHTML(body, attributes);
}

/** The site's download mark, in its buttons. */
export const downloadIcon = () => icon('ph:download-simple-bold');

/**
 * The providers' brand logos, from selfh.st/icons (CC BY 4.0), Nextcloud's
 * from Simple Icons (CC0) and Google Drive's current one from the repository
 * (altoSet), as in the app. The white ones (`-light`, Nextcloud's) are for
 * the brand color behind them; the others are full color, on white.
 */
const LOGOS: Record<SiteProviderId, string> = {
  gdrive: 'alto:google-drive',
  dropbox: 'selfhst:dropbox-light',
  onedrive: 'selfhst:microsoft-onedrive',
  protondrive: 'selfhst:proton-drive',
  nextcloud: 'simple-icons:nextcloud',
};

/** The logos of the providers the site shows. */
export function providerLogos(): Record<SiteProviderId, string> {
  return Object.fromEntries(Object.entries(LOGOS).map(([id, name]) => [id, icon(name)])) as Record<
    SiteProviderId,
    string
  >;
}

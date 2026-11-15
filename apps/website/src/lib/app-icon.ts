/**
 * Alto's icon, the desktop app's own (assets/icons in the repository): as a
 * URL (the favicon, the header's mark) and as SVG markup (the demo's welcome,
 * read when the site is built).
 */
import appIcon from '../../../../assets/icons/com.hunterwittenborn.Alto.svg';
import { repoFile } from './repo';

export const appIconUrl: string = appIcon.src;

export const appIconSvg = () => repoFile('assets/icons/com.hunterwittenborn.Alto.svg');

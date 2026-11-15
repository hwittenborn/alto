/**
 * Alto's icon, the desktop app's own (assets/icons in the repository): as a
 * URL (the favicon, the header's mark) and as SVG markup (the demo's welcome,
 * read when the site is built).
 */
import fs from 'node:fs';
import path from 'node:path';
import appIcon from '../../../../assets/icons/com.hunterwittenborn.Alto.svg';

export const appIconUrl: string = appIcon.src;

export const appIconSvg = () =>
  fs.readFileSync(path.resolve(process.cwd(), '../../assets/icons/com.hunterwittenborn.Alto.svg'), 'utf8');

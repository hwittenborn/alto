/** What the media pages' window draws, read when the site is built (as the homepage's). */
import type { DemoAssets } from '../demo/assets';
import { appIconSvg } from '../lib/app-icon';
import { providerLogos } from '../lib/icons';

export const mediaAssets = (): DemoAssets => ({ logos: providerLogos(), appIcon: appIconSvg() });

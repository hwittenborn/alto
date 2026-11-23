import type { DemoAssets } from '../demo/assets';
import { appIconSvg } from '../lib/app-icon';
import { providerLogos } from '../lib/icons';

export const mediaAssets = (): DemoAssets => ({ logos: providerLogos(), appIcon: appIconSvg() });

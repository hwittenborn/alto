// Screenshots a picture's page once every window on it is drawn.
import type { Browser } from 'playwright';
import type { Shot } from './shots';

export type Capturable = Pick<Shot, 'width' | 'height' | 'scale' | 'colorScheme'> & {
  noWindow?: boolean;
};

export async function capture(browser: Browser, url: string, shot: Capturable): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: Math.ceil(shot.width), height: Math.ceil(shot.height) },
    deviceScaleFactor: shot.scale,
    colorScheme: shot.colorScheme,
    reducedMotion: 'reduce',
  });
  try {
    await page.goto(url);
    // Windows may be in iframes (FrameWindow).
    await page.waitForLoadState('load');
    if (!shot.noWindow) {
      const drawn = () => {
        const windows = document.querySelectorAll('[data-media-window]');
        return windows.length > 0 && [...windows].every((w) => w.hasAttribute('data-ready'));
      };
      const framed = (await page.locator('iframe').count()) > 0;
      const frames = framed ? page.frames().filter((f) => f !== page.mainFrame()) : [page.mainFrame()];
      for (const frame of frames) {
        await frame.waitForFunction(drawn, undefined, { timeout: 30_000 });
        await frame.evaluate(() => document.fonts.ready);
      }
    }
    await page.evaluate(() => document.fonts.ready);
    // The size can be fractional (1920×640 at 1.5x).
    return await page.screenshot({
      omitBackground: true,
      animations: 'disabled',
      caret: 'hide',
      clip: { x: 0, y: 0, width: shot.width, height: shot.height },
    });
  } finally {
    await page.close();
  }
}

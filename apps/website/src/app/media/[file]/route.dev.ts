/**
 * In `next dev` only (next.config.ts), each picture at /media/<id>.png,
 * captured from its page as it is now: edit a picture (src/media/shots.tsx)
 * and reload its PNG. The build writes the same files (scripts/capture-media.ts).
 */
import { type Browser, chromium } from 'playwright';
import { capture } from '../../../media/capture';
import { SHOTS } from '../../../media/shots';

/** One browser for the dev server's life. */
let browser: Promise<Browser> | undefined;

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const shot = SHOTS.find((s) => `${s.id}.png` === file);
  if (!shot) return new Response('No such picture', { status: 404 });
  browser ??= chromium.launch();
  const png = await capture(await browser, new URL(`/media/shot/${shot.id}`, request.url).href, shot);
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
}

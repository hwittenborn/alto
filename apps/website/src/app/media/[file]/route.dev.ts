// Dev only: serves each picture live at /media/<id>.png.
import { type Browser, chromium } from 'playwright';
import { capture } from '../../../media/capture';
import { SHOTS } from '../../../media/shots';

let browser: Promise<Browser> | undefined;

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const shot = SHOTS.find((s) => `${s.id}.png` === file);
  if (!shot) return new Response('No such picture', { status: 404 });
  browser ??= chromium.launch();
  const png = await capture(await browser, new URL(`/media/shot/${shot.id}`, request.url).href, shot);
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
}

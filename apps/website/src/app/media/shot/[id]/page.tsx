/** A picture of Alto (src/media/shots.tsx), at its size. */
import { notFound } from 'next/navigation';
import { SHOTS } from '../../../../media/shots';

export const generateStaticParams = () => SHOTS.map(({ id }) => ({ id }));

export default async function ShotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shot = SHOTS.find((s) => s.id === id);
  if (!shot) notFound();
  const { body, ...facts } = shot;
  return (
    <div
      className="shot"
      style={{ width: shot.width, height: shot.height }}
      // What the capture (scripts/capture-media.ts) needs, read from the built page.
      data-shot={JSON.stringify(facts)}
    >
      {body()}
    </div>
  );
}

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
      // Read by scripts/capture-media.ts.
      data-shot={JSON.stringify(facts)}
    >
      {body()}
    </div>
  );
}

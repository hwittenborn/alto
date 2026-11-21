/**
 * The homepage's list of every provider Alto connects to, from @alto/core's
 * list, so a new provider shows up here as soon as the app has it: a row of
 * chips, each with the provider's logo on its brand color, as in the app's
 * sidebar.
 */
import { PROVIDERS, type ProviderDefinition, type ProviderId } from '@alto/core';
import { Icon } from './Icon';
import { Link } from './Link';
import { isLightTile } from '../lib/providers';
import { LINKS } from '../lib/site';

const MARK_SIZE = 30;

/** A provider's logo, in a circle of its brand color. */
function Mark({ def, logo }: { def: ProviderDefinition; logo: string }) {
  return (
    <span
      className="grid place-items-center flex-none rounded-full text-white"
      style={{
        width: MARK_SIZE,
        height: MARK_SIZE,
        background: `#${def.color}`,
        // A white tile keeps its edge on light and dark backgrounds alike.
        boxShadow: isLightTile(def) ? 'inset 0 0 0 1px rgb(0 0 0 / 12%)' : undefined,
        fontSize: Math.round(MARK_SIZE * 0.6),
      }}
    >
      <Icon svg={logo} className="flex" />
    </span>
  );
}

export function ProvidersSection({ logos }: { logos: Record<ProviderId, string> }) {
  return (
    <section className="wrap pt-24" aria-labelledby="providers-title">
      <div className="text-center max-w-[40rem] mx-auto mb-8">
        <h2
          id="providers-title"
          className="text-[clamp(2rem,4vw,3.1rem)] font-medium tracking-[-0.045em] leading-[1.08] m-0"
        >
          Works with your cloud
        </h2>
      </div>
      <ul className="list-none m-0 p-0 flex flex-wrap justify-center gap-2.5">
        {PROVIDERS.map((def) => (
          <li
            key={def.id}
            className="glass-panel flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 font-medium"
          >
            <Mark def={def} logo={logos[def.id]} />
            {def.label}
          </li>
        ))}
      </ul>
      <p className="text-muted text-center mt-6 mb-0">
        Want one that isn&apos;t here? <Link href={LINKS.issues}>Open an issue</Link>.
      </p>
    </section>
  );
}

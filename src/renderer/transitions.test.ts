import { afterEach, expect, test } from 'vitest';
import { withoutTransitions } from './transitions';

const computedStyle = globalThis.getComputedStyle;
afterEach(() => {
  globalThis.getComputedStyle = computedStyle;
});

test('withoutTransitions changes elements with transitions off until the change is applied', () => {
  const events: string[] = [];
  const element = (name: string) => ({ name, style: { transition: '' }, dataset: { altoMoving: '' } });
  const rows = [element('a'), element('b')];
  // The browser applies pending style changes when it computes the style.
  globalThis.getComputedStyle = ((row: (typeof rows)[number]) => {
    events.push(`applied ${row.name}, transition: ${row.style.transition}`);
    return { getPropertyValue: () => '' };
  }) as unknown as typeof getComputedStyle;

  withoutTransitions(rows as unknown as HTMLElement[], (row) => {
    events.push(`changed ${(row as unknown as (typeof rows)[number]).name}, transition: ${row.style.transition}`);
    delete row.dataset.altoMoving;
  });

  expect(events).toEqual([
    'changed a, transition: none',
    'changed b, transition: none',
    'applied a, transition: none',
    'applied b, transition: none',
  ]);
  expect(rows.map((row) => [row.style.transition, 'altoMoving' in row.dataset])).toEqual([
    ['', false],
    ['', false],
  ]);
});

import { describe, expect, it } from 'vitest';
import {
  type Baseline,
  type BaselineEntry,
  Exclusions,
  type ItemState,
  type Listing,
  type PlanAction,
  planSync,
} from '../src/index.ts';

const file = (size: number, mtime: number): ItemState => ({ isDir: false, size, mtime });
const dir = (mtime = 0): ItemState => ({ isDir: true, size: -1, mtime });
const base = (l: ItemState, r: ItemState): BaselineEntry => ({
  isDir: l.isDir,
  local: { size: l.size, mtime: l.mtime },
  remote: { size: r.size, mtime: r.mtime },
});

function plan(
  local: Record<string, ItemState>,
  remote: Record<string, ItemState>,
  baseline: Record<string, BaselineEntry> = {},
  extra: { exclusions?: string[]; tolerance?: number | null; caseInsensitive?: boolean } = {},
): PlanAction[] {
  return planSync({
    local: new Map(Object.entries(local)) as Listing,
    remote: new Map(Object.entries(remote)) as Listing,
    baseline: new Map(Object.entries(baseline)) as Baseline,
    exclusions: extra.exclusions ? new Exclusions(extra.exclusions) : undefined,
    mtimeTolerance: extra.tolerance === undefined ? 1000 : extra.tolerance,
    remoteCaseInsensitive: extra.caseInsensitive,
  }).actions;
}

const kinds = (actions: PlanAction[]) =>
  actions.map((a) => {
    switch (a.type) {
      case 'copy':
        return `copy:${a.from}:${a.path}`;
      case 'delete':
      case 'mkdir':
        return `${a.type}:${a.side}:${a.path}`;
      case 'conflict':
        return `conflict:${a.reason}:${a.path}`;
      case 'verify':
        return `verify:${a.reason}:${a.path}`;
      default:
        return `${a.type}:${a.path}`;
    }
  });

describe('planSync', () => {
  const L = file(10, 1000);
  const R = file(10, 2000);

  it('does nothing when both sides match the baseline', () => {
    expect(plan({ a: L }, { a: R }, { a: base(L, R) })).toEqual([]);
  });

  it('uploads local edits and downloads remote edits', () => {
    expect(kinds(plan({ a: file(11, 5000) }, { a: R }, { a: base(L, R) }))).toEqual(['copy:local:a']);
    expect(kinds(plan({ a: L }, { a: file(12, 6000) }, { a: base(L, R) }))).toEqual(['copy:remote:a']);
  });

  it('detects a change in mtime alone', () => {
    expect(kinds(plan({ a: file(10, 1001) }, { a: R }, { a: base(L, R) }))).toEqual(['copy:local:a']);
  });

  it('raises a conflict when both sides were edited to different sizes', () => {
    expect(kinds(plan({ a: file(11, 5000) }, { a: file(12, 6000) }, { a: base(L, R) }))).toEqual([
      'conflict:both-modified:a',
    ]);
  });

  it('verifies contents when both sides were edited to the same size', () => {
    expect(kinds(plan({ a: file(20, 5000) }, { a: file(20, 9000) }, { a: base(L, R) }))).toEqual([
      'verify:both-modified:a',
    ]);
  });

  it('propagates deletions of unchanged items', () => {
    expect(kinds(plan({ a: L }, {}, { a: base(L, R) }))).toEqual(['delete:local:a']);
    expect(kinds(plan({}, { a: R }, { a: base(L, R) }))).toEqual(['delete:remote:a']);
  });

  it('lets an edit win over a deletion', () => {
    expect(kinds(plan({ a: file(99, 7000) }, {}, { a: base(L, R) }))).toEqual(['copy:local:a']);
    expect(kinds(plan({}, { a: file(99, 7000) }, { a: base(L, R) }))).toEqual(['copy:remote:a']);
  });

  it('forgets items deleted on both sides', () => {
    expect(kinds(plan({}, {}, { a: base(L, R) }))).toEqual(['forget:a']);
  });

  it('copies new items to the side that lacks them', () => {
    expect(kinds(plan({ n: L }, {}))).toEqual(['copy:local:n']);
    expect(kinds(plan({}, { n: R }))).toEqual(['copy:remote:n']);
    expect(kinds(plan({ d: dir() }, {}))).toEqual(['mkdir:remote:d']);
  });

  it('records identical new files instead of copying', () => {
    expect(kinds(plan({ n: file(5, 1000) }, { n: file(5, 1500) }))).toEqual(['record:n']);
  });

  it('never picks a winner for different new files with the same name', () => {
    expect(kinds(plan({ n: file(5, 1000) }, { n: file(6, 99_000) }))).toEqual(['conflict:both-created:n']);
    expect(kinds(plan({ n: file(5, 1000) }, { n: file(5, 99_000) }))).toEqual(['verify:both-created:n']);
  });

  it("verifies by hash when the remote can't keep modification times", () => {
    expect(kinds(plan({ n: file(5, 1000) }, { n: file(5, 1000) }, {}, { tolerance: null }))).toEqual([
      'verify:both-created:n',
    ]);
  });

  it('blocks the whole subtree on a file/folder type mismatch', () => {
    const actions = plan({ x: dir(), 'x/child': L }, { x: R });
    expect(kinds(actions)).toEqual(['conflict:type-mismatch:x']);
  });

  it('deletes a folder deleted with everything in it in one action', () => {
    const b = { d: base(dir(), dir()), 'd/f': base(L, R) };
    const actions = plan({ d: dir(), 'd/f': L }, {}, b);
    expect(kinds(actions)).toEqual(['delete:local:d']);
    expect(actions[0]).toMatchObject({ expected: { isDir: true }, contents: [{ path: 'd/f', expected: L }] });
  });

  it('folds nested deleted folders into the outermost one', () => {
    const b = {
      d: base(dir(), dir()),
      'd/f': base(L, R),
      'd/sub': base(dir(), dir()),
      'd/sub/g': base(L, R),
      top: base(L, R),
    };
    const actions = plan({}, { d: dir(), 'd/f': R, 'd/sub': dir(), 'd/sub/g': R, top: R }, b);
    expect(kinds(actions).sort()).toEqual(['delete:remote:d', 'delete:remote:top']);
    const folder = actions.find((a) => a.type === 'delete' && a.path === 'd');
    expect(folder?.type === 'delete' && folder.contents?.map((c) => c.path).sort()).toEqual([
      'd/f',
      'd/sub',
      'd/sub/g',
    ]);
    expect(
      planSync({
        local: new Map(),
        remote: new Map(Object.entries({ d: dir(), 'd/f': R, 'd/sub': dir(), 'd/sub/g': R, top: R })),
        baseline: new Map(Object.entries(b)),
        mtimeTolerance: 1000,
      }).summary.remoteDeletes,
    ).toBe(5);
  });

  it('deletes only the wholly deleted part of a folder whose other part is kept', () => {
    const b = {
      d: base(dir(), dir()),
      'd/a': base(dir(), dir()),
      'd/a/f': base(L, R),
      'd/b': base(dir(), dir()),
      'd/b/g': base(L, R),
    };
    // d/b/g was edited here, so d and d/b stay (and are recreated on the server); d/a goes as a whole.
    const actions = kinds(plan({ d: dir(), 'd/a': dir(), 'd/a/f': L, 'd/b': dir(), 'd/b/g': file(50, 8000) }, {}, b));
    expect(actions).toContain('delete:local:d/a');
    expect(actions).not.toContain('delete:local:d/a/f');
    expect(actions).toContain('copy:local:d/b/g');
    expect(actions).not.toContain('delete:local:d');
  });

  it('keeps a deleted folder when something inside it was edited', () => {
    const b = { d: base(dir(), dir()), 'd/f': base(L, R), 'd/g': base(L, R) };
    const actions = kinds(plan({ d: dir(), 'd/f': file(50, 8000), 'd/g': L }, {}, b));
    expect(actions).toContain('copy:local:d/f');
    expect(actions).toContain('delete:local:d/g');
    expect(actions).toContain('mkdir:remote:d');
    expect(actions).not.toContain('delete:local:d');
  });

  it('keeps a deleted folder that still holds excluded files', () => {
    const b = { d: base(dir(), dir()), 'd/f': base(L, R) };
    const actions = kinds(plan({ d: dir(), 'd/f': L, 'd/cache.tmp': L }, {}, b, { exclusions: ['*.tmp'] }));
    expect(actions).toEqual(['delete:local:d/f', 'mkdir:remote:d']);
  });

  it('ignores excluded paths entirely and forgets their baseline', () => {
    const actions = kinds(
      plan(
        { 'build/out.o': L, 'a.tmp': L, keep: L },
        { 'other.tmp': R },
        { 'a.tmp': base(L, R) },
        { exclusions: ['*.tmp', 'build/'] },
      ),
    );
    expect(actions).toEqual(['forget:a.tmp', 'copy:local:keep']);
  });

  it('supports negated exclusions', () => {
    const actions = kinds(plan({ 'a.log': L, 'keep.log': L }, {}, {}, { exclusions: ['*.log', '!keep.log'] }));
    expect(actions).toEqual(['copy:local:keep.log']);
  });

  it('reports names that collide on case-insensitive remotes', () => {
    const actions = kinds(plan({ 'A.txt': L, 'a.txt': L }, {}, {}, { caseInsensitive: true }));
    expect(actions.filter((a) => a.startsWith('error'))).toHaveLength(2);
    expect(actions.some((a) => a.startsWith('copy'))).toBe(false);
  });

  it('propagates a file replaced by a folder on one side', () => {
    const actions = kinds(plan({ x: L }, { x: dir(), 'x/c': R }, { x: base(L, R) }));
    expect(actions).toEqual(['replace:x', 'copy:remote:x/c']);
  });

  it('propagates a folder replaced by a file when the folder is untouched', () => {
    const b = { x: base(dir(), dir()), 'x/c': base(L, R) };
    expect(kinds(plan({ x: dir(), 'x/c': L }, { x: R }, b))).toEqual(['delete:local:x/c', 'replace:x']);
    // An edit inside the folder turns it into a conflict instead.
    expect(kinds(plan({ x: dir(), 'x/c': file(77, 9) }, { x: R }, b))).toEqual(['conflict:type-mismatch:x']);
  });

  it('ignores folder timestamp changes', () => {
    expect(plan({ d: dir(1) }, { d: dir(2) }, { d: base(dir(5), dir(6)) })).toEqual([]);
  });
});

describe('Exclusions', () => {
  it('matches folders and their contents', () => {
    const ex = new Exclusions(['node_modules/', '*.tmp', '/build']);
    expect(ex.isExcluded('node_modules', true)).toBe(true);
    expect(ex.isExcluded('app/node_modules/x.js')).toBe(true);
    expect(ex.isExcluded('a/b.tmp')).toBe(true);
    expect(ex.isExcluded('build', true)).toBe(true);
    expect(ex.isExcluded('src/build', true)).toBe(false);
    expect(ex.isExcluded('src/main.ts')).toBe(false);
  });

  it('never excludes the exclusion file itself and always skips rclone partial files', () => {
    const ex = new Exclusions(['*']);
    expect(ex.isExcluded('.altoignore')).toBe(false);
    expect(new Exclusions([]).isExcluded('big.iso.3f9a1c2b.partial')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { RcloneError } from '../src/rclone/client.ts';

describe('RcloneError', () => {
  it('tells a missing directory from other things that are not found', () => {
    expect(new RcloneError('operations/list', 'error in ListJSON: directory not found', 404).isDirNotFound).toBe(true);
    expect(new RcloneError('operations/list', 'File not found: 0ABC', 404).isDirNotFound).toBe(false);
  });
});

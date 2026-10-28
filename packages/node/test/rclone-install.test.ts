import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installedRclone, installRclone, type RcloneInstallProgress } from '../src/rclone-install.ts';

/** A zip archive of `files`, stored uncompressed. */
function zip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const fileName = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(fileName.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(0x0314, 4); // made by Unix, so the mode below counts
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(fileName.length, 28);
    entry.writeUInt32LE((0o100755 << 16) >>> 0, 38);
    entry.writeUInt32LE(offset, 42);
    local.push(header, fileName, data);
    central.push(entry, fileName);
    offset += header.length + fileName.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

const release = 'rclone-v9.9.9-linux-amd64';
const archive = zip({ [`${release}/rclone`]: '#!/bin/sh\necho "rclone v9.9.9"\n', [`${release}/README.txt`]: 'docs' });
let served: Record<string, Buffer> = {};
let server: Server;
let baseUrl = '';
let dir = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = served[req.url ?? ''];
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-length': body.length }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function serveRelease(content = archive): void {
  const sum = createHash('sha256').update(archive).digest('hex');
  served = {
    '/SHA256SUMS': Buffer.from(`0000  rclone-v9.9.9-linux-arm64.zip\n${sum}  ${release}.zip\n`),
    [`/${release}.zip`]: content,
  };
}

const options = () => ({ dir, version: 'v9.9.9', arch: 'x64' as const, baseUrl });

describe('installRclone', () => {
  it('installs the release, checked against its checksums', async () => {
    dir = mkdtempSync(join(tmpdir(), 'alto-rclone-'));
    serveRelease();
    expect(await installedRclone(options())).toBeNull();
    const progress: RcloneInstallProgress[] = [];
    const binary = await installRclone({ ...options(), onProgress: (p) => progress.push(p) });

    expect(binary).toBe(join(dir, 'rclone'));
    expect(readFileSync(binary, 'utf8')).toContain('rclone v9.9.9');
    expect(statSync(binary).mode & 0o111).toBeTruthy();
    expect(readFileSync(join(dir, 'VERSION'), 'utf8')).toBe(`${release}\n`);
    expect(await installedRclone(options())).toBe(binary);
    expect(progress.at(-1)).toEqual({ received: archive.length, total: archive.length });
    // Nothing else is left behind.
    expect(readdirSync(dir).sort()).toEqual(['VERSION', 'rclone']);
  });

  it('replaces another release', async () => {
    dir = mkdtempSync(join(tmpdir(), 'alto-rclone-'));
    writeFileSync(join(dir, 'rclone'), 'old', { mode: 0o755 });
    writeFileSync(join(dir, 'VERSION'), 'rclone-v1.0.0-linux-amd64\n');
    serveRelease();
    expect(await installedRclone(options())).toBeNull();
    await installRclone(options());
    expect(readFileSync(join(dir, 'rclone'), 'utf8')).toContain('rclone v9.9.9');
    expect(await installedRclone(options())).toBe(join(dir, 'rclone'));
  });

  it('keeps the installed release when the download is damaged', async () => {
    dir = mkdtempSync(join(tmpdir(), 'alto-rclone-'));
    writeFileSync(join(dir, 'rclone'), 'old', { mode: 0o755 });
    writeFileSync(join(dir, 'VERSION'), 'rclone-v1.0.0-linux-amd64\n');
    serveRelease(Buffer.concat([archive.subarray(0, 100), Buffer.alloc(archive.length - 100)]));
    await expect(installRclone(options())).rejects.toThrow(/damaged/);
    expect(readFileSync(join(dir, 'rclone'), 'utf8')).toBe('old');
    expect(readdirSync(dir).sort()).toEqual(['VERSION', 'rclone']);
  });
});

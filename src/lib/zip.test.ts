import { describe, it, expect } from 'vitest';
import { crc32, zipStore } from './zip.ts';

/** Read the archive back the way a real unzipper does: walk the central
 *  directory, then follow each offset to its local header. */
function readZip(buf: Uint8Array): { name: string; text: string; crc: number }[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // ignoreBOM: a decoder that eats the leading BOM would hide whether the
  // archive preserved it — and VituixCAD needs that BOM (UTF-8 detection).
  const dec = new TextDecoder('utf-8', { ignoreBOM: true });
  // End of central directory: fixed 22 bytes here (no archive comment).
  const eocd = buf.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralStart = view.getUint32(eocd + 16, true);
  expect(centralStart + centralSize).toBe(eocd);

  const out: { name: string; text: string; crc: number }[] = [];
  let at = centralStart;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = dec.decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen;

    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0); // stored, not deflated
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const ln = view.getUint16(offset + 26, true);
    const xl = view.getUint16(offset + 28, true);
    const start = offset + 30 + ln + xl;
    out.push({ name, text: dec.decode(buf.subarray(start, start + size)), crc });
  }
  expect(at).toBe(eocd);
  return out;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    // The CRC-32 check value every implementation is measured against.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is empty-safe', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zipStore', () => {
  it('round-trips names, contents and checksums', () => {
    const files = [
      { name: 'design/design.vxp', data: '﻿<VituixCAD>\r\n</VituixCAD>\r\n' },
      { name: 'design/tweeter 0deg.txt', data: '20 80.1 -12.0\n' },
      { name: 'design/mid.zma', data: '20 6.51 12.3\n' },
    ];
    const back = readZip(zipStore(files));
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(back.map((f) => f.text)).toEqual(files.map((f) => f.data));
    for (const f of back)
      expect(f.crc).toBe(crc32(new TextEncoder().encode(files.find((x) => x.name === f.name)!.data)));
  });

  it('keeps non-ASCII names and contents byte-exact through UTF-8', () => {
    // The .vxp carries Ω in its units and starts with a BOM; a name can carry
    // any character fileSafeName allows.
    const [back] = readZip(zipStore([{ name: 'mètre/6,8 Ω.txt', data: '﻿Ω 6,8\r\n' }]));
    expect(back.name).toBe('mètre/6,8 Ω.txt');
    expect(back.text).toBe('﻿Ω 6,8\r\n');
  });

  it('is deterministic — same input, same bytes', () => {
    const f = [{ name: 'a.txt', data: 'x' }];
    expect(Array.from(zipStore(f))).toEqual(Array.from(zipStore(f)));
  });

  it('writes a valid empty archive', () => {
    const z = zipStore([]);
    expect(z.length).toBe(22);
    expect(readZip(z)).toEqual([]);
  });
});

/**
 * A minimal ZIP writer — enough to hand a browser one download that unpacks
 * into a folder.
 *
 * Why this exists: the VituixCAD export has to deliver the .vxp AND every
 * measurement file it references, or VituixCAD opens with "N/N frequency
 * response files not found". The folder export (showDirectoryPicker) does that
 * on Chromium, but that API does not exist in Safari or Firefox — and Sander
 * works on macOS. There the export used to fall back to the bare .vxp plus a
 * note listing the files to place by hand, which is exactly the chore the
 * folder export was built to remove. A ZIP is the one container every browser
 * can download and every OS can unpack.
 *
 * STORE only (no compression): FRD/ZMA text compresses well, but deflate would
 * mean shipping a compressor for a handful of files that are a few hundred kB
 * at most — and a stored ZIP is byte-verifiable in a test. The format is the
 * documented one (PKWARE APPNOTE 6.3.2), so macOS Archive Utility, Windows
 * Explorer and `unzip` all read it.
 *
 * DETERMINISTIC: no wall clock. Every entry carries the same fixed DOS
 * timestamp (1980-01-01), so the same files always produce the same bytes —
 * the same rule the rest of src/lib follows, and it keeps the test exact.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE 802.3), the checksum every ZIP entry carries. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path inside the archive; forward slashes make folders. */
  name: string;
  /** File contents. Text is encoded as UTF-8. */
  data: string | Uint8Array;
}

/** DOS date/time for 1980-01-01 00:00 — the epoch of the format itself. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // year 1980, month 1, day 1

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const prepared = entries.map((e) => {
    const name = enc.encode(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    return { name, data, crc: crc32(data) };
  });

  const LOCAL = 30;
  const CENTRAL = 46;
  const EOCD = 22;
  let size = EOCD;
  for (const p of prepared) size += LOCAL + p.name.length + p.data.length + CENTRAL + p.name.length;

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(at, v >>> 0, true);
    at += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, at);
    at += b.length;
  };

  const offsets: number[] = [];
  for (const p of prepared) {
    offsets.push(at);
    u32(0x04034b50); // local file header
    u16(20); // version needed (2.0 — store)
    u16(0x0800); // flags: filename is UTF-8
    u16(0); // method: store
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(p.crc);
    u32(p.data.length); // compressed size == uncompressed
    u32(p.data.length);
    u16(p.name.length);
    u16(0); // extra field length
    bytes(p.name);
    bytes(p.data);
  }

  const centralStart = at;
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    u32(0x02014b50); // central directory header
    u16(20); // version made by
    u16(20); // version needed
    u16(0x0800);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(p.crc);
    u32(p.data.length);
    u32(p.data.length);
    u16(p.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    bytes(p.name);
  }

  const centralEnd = at;
  u32(0x06054b50); // end of central directory
  u16(0); // this disk
  u16(0); // disk with central directory
  u16(prepared.length);
  u16(prepared.length);
  u32(centralEnd - centralStart);
  u32(centralStart);
  u16(0); // comment length
  return out;
}

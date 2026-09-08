/** Height 0..1 → 8-bit / 16-bit PNG or raw Float32 for export and cheap import. */

export const HEIGHT_RAW_MAGIC = "SFH1";

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

export function inferGridSize(count: number): number | null {
  if (!Number.isFinite(count) || count < 4) return null;
  const s = Math.round(Math.sqrt(count));
  return s * s === count && s >= 2 ? s : null;
}

export function heightToU8(terrain: Float32Array): Uint8Array {
  const out = new Uint8Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) out[i] = Math.round(clamp01(terrain[i]) * 255);
  return out;
}

export function heightToU16(terrain: Float32Array): Uint16Array {
  const out = new Uint16Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) out[i] = Math.round(clamp01(terrain[i]) * 65535);
  return out;
}

export function u8ToHeight(data: Uint8Array): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = (data[i] ?? 0) / 255;
  return out;
}

export function u16ToHeight(data: Uint16Array): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = (data[i] ?? 0) / 65535;
  return out;
}

export function lumaToHeight(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const n = Math.max(0, width) * Math.max(0, height);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = rgba[o] ?? 0;
    const g = rgba[o + 1] ?? 0;
    const b = rgba[o + 2] ?? 0;
    out[i] = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
  }
  return out;
}

export function heightmapFilename(
  size: number,
  kind: "png16" | "png8" | "raw" = "png16",
  now = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const grid = Number.isFinite(size) ? Math.max(2, Math.round(size)) : 0;
  if (kind === "raw") return `sandflow-height-${grid}-${stamp}.r32`;
  if (kind === "png8") return `sandflow-height-${grid}-8bit-${stamp}.png`;
  return `sandflow-height-${grid}-${stamp}.png`;
}

export function encodeHeightRaw(terrain: Float32Array, size: number): Uint8Array {
  const n = size * size;
  const buf = new ArrayBuffer(8 + n * 4);
  const out = new Uint8Array(buf);
  out[0] = 0x53;
  out[1] = 0x46;
  out[2] = 0x48;
  out[3] = 0x31;
  const view = new DataView(buf);
  view.setUint32(4, size, true);
  new Float32Array(buf, 8, n).set(terrain.subarray(0, n));
  return out;
}

export function decodeHeightRaw(bytes: Uint8Array): { size: number; terrain: Float32Array } | null {
  if (bytes.length < 8) return null;
  const magic =
    bytes[0] === 0x53 && bytes[1] === 0x46 && bytes[2] === 0x48 && bytes[3] === 0x31;
  if (magic) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = view.getUint32(4, true);
    const n = size * size;
    if (!Number.isFinite(size) || size < 2 || bytes.byteLength < 8 + n * 4) return null;
    const terrain = new Float32Array(n);
    for (let i = 0; i < n; i++) terrain[i] = view.getFloat32(8 + i * 4, true);
    return { size, terrain };
  }
  if (bytes.byteLength % 4 !== 0) return null;
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const size = inferGridSize(floats.length);
  if (!size) return null;
  return { size, terrain: floats.slice() };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** zlib stored blocks — no third-party codec. */
function zlibStore(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const MAX = 65535;
  if (data.length === 0) {
    parts.push(new Uint8Array([1, 0, 0, 0xff, 0xff]));
  } else {
    for (let off = 0; off < data.length; off += MAX) {
      const n = Math.min(MAX, data.length - off);
      const last = off + n >= data.length;
      const block = new Uint8Array(5 + n);
      block[0] = last ? 1 : 0;
      block[1] = n & 0xff;
      block[2] = (n >>> 8) & 0xff;
      const inv = ~n & 0xffff;
      block[3] = inv & 0xff;
      block[4] = (inv >>> 8) & 0xff;
      block.set(data.subarray(off, off + n), 5);
      parts.push(block);
    }
  }
  const sum = adler32(data);
  const tail = new Uint8Array(4);
  tail[0] = (sum >>> 24) & 0xff;
  tail[1] = (sum >>> 16) & 0xff;
  tail[2] = (sum >>> 8) & 0xff;
  tail[3] = sum & 0xff;
  parts.push(tail);
  return concatBytes(parts);
}

function inflateStoredZlib(z: Uint8Array): Uint8Array | null {
  if (z.length < 6) return null;
  if (z[0] !== 0x78) return null;
  const parts: Uint8Array[] = [];
  let i = 2;
  for (;;) {
    if (i + 5 > z.length) return null;
    const last = (z[i]! & 1) === 1;
    const n = z[i + 1]! | (z[i + 2]! << 8);
    const ninv = z[i + 3]! | (z[i + 4]! << 8);
    if ((n ^ 0xffff) !== ninv) return null;
    i += 5;
    if (i + n + 4 > z.length) return null;
    parts.push(z.subarray(i, i + n));
    i += n;
    if (last) {
      if (i + 4 > z.length) return null;
      return concatBytes(parts);
    }
  }
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcSrc = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcSrc));
  return out;
}

function grayScanlines(samples: Uint8Array | Uint16Array, size: number, bitDepth: 8 | 16): Uint8Array {
  const bpp = bitDepth === 16 ? 2 : 1;
  const row = 1 + size * bpp;
  const out = new Uint8Array(size * row);
  for (let y = 0; y < size; y++) {
    const o = y * row;
    out[o] = 0;
    for (let x = 0; x < size; x++) {
      const v = samples[y * size + x] ?? 0;
      if (bitDepth === 16) {
        out[o + 1 + x * 2] = (v >>> 8) & 0xff;
        out[o + 2 + x * 2] = v & 0xff;
      } else {
        out[o + 1 + x] = v & 0xff;
      }
    }
  }
  return out;
}

function encodeGrayPng(samples: Uint8Array | Uint16Array, size: number, bitDepth: 8 | 16): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = bitDepth;
  ihdr[9] = 0;
  const idat = zlibStore(grayScanlines(samples, size, bitDepth));
  return concatBytes([sig, writeChunk("IHDR", ihdr), writeChunk("IDAT", idat), writeChunk("IEND", new Uint8Array(0))]);
}

export function encodeGrayPng8(data: Uint8Array, size: number): Uint8Array {
  return encodeGrayPng(data, size, 8);
}

export function encodeGrayPng16(data: Uint16Array, size: number): Uint8Array {
  return encodeGrayPng(data, size, 16);
}

export function encodeHeightPng8(terrain: Float32Array, size: number): Uint8Array {
  return encodeGrayPng8(heightToU8(terrain), size);
}

export function encodeHeightPng16(terrain: Float32Array, size: number): Uint8Array {
  return encodeGrayPng16(heightToU16(terrain), size);
}

function readU32(bytes: Uint8Array, o: number): number {
  return ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0;
}

export function isPngBuffer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  );
}

/** Decode grayscale 8/16 PNG we encode (filter 0, stored zlib). */
export function decodeGrayPng(bytes: Uint8Array): { size: number; bitDepth: 8 | 16; samples: Uint8Array | Uint16Array } | null {
  if (!isPngBuffer(bytes)) return null;
  let size = 0;
  let bitDepth: 8 | 16 | 0 = 0;
  const idats: Uint8Array[] = [];
  let o = 8;
  while (o + 12 <= bytes.length) {
    const len = readU32(bytes, o);
    const type = String.fromCharCode(bytes[o + 4]!, bytes[o + 5]!, bytes[o + 6]!, bytes[o + 7]!);
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (data.length !== len) return null;
    if (type === "IHDR") {
      if (len < 13) return null;
      size = readU32(data, 0);
      const h = readU32(data, 4);
      if (size !== h || size < 2 || size > 4096) return null;
      const depth = data[8];
      const color = data[9];
      if ((depth !== 8 && depth !== 16) || color !== 0) return null;
      bitDepth = depth as 8 | 16;
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
    o += 12 + len;
  }
  if (!size || !bitDepth || idats.length === 0) return null;
  const inflated = inflateStoredZlib(concatBytes(idats));
  if (!inflated) return null;
  const bpp = bitDepth === 16 ? 2 : 1;
  const row = 1 + size * bpp;
  if (inflated.length < size * row) return null;
  if (bitDepth === 8) {
    const samples = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      if (inflated[y * row] !== 0) return null;
      samples.set(inflated.subarray(y * row + 1, y * row + 1 + size), y * size);
    }
    return { size, bitDepth, samples };
  }
  const samples = new Uint16Array(size * size);
  for (let y = 0; y < size; y++) {
    if (inflated[y * row] !== 0) return null;
    for (let x = 0; x < size; x++) {
      const p = y * row + 1 + x * 2;
      samples[y * size + x] = (inflated[p]! << 8) | inflated[p + 1]!;
    }
  }
  return { size, bitDepth, samples };
}

export function decodeHeightPng(bytes: Uint8Array): { size: number; terrain: Float32Array } | null {
  const decoded = decodeGrayPng(bytes);
  if (!decoded) return null;
  const terrain =
    decoded.bitDepth === 16
      ? u16ToHeight(decoded.samples as Uint16Array)
      : u8ToHeight(decoded.samples as Uint8Array);
  return { size: decoded.size, terrain };
}

export function decodeHeightBytes(bytes: Uint8Array): { size: number; terrain: Float32Array } | null {
  if (isPngBuffer(bytes)) return decodeHeightPng(bytes);
  return decodeHeightRaw(bytes);
}

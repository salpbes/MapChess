// WHAT: Terrarium PNG → metres.
// HOW:  Each pixel encodes height as (R·256 + G + B/256) − 32768. Given RGBA
//       bytes of a decoded tile, produce a Float32Array of metres, row-major,
//       top-left first. Pure: takes bytes, returns numbers.
// WHY:  Kept separate from the fetch/decode plumbing so the formula — the one
//       thing that would silently produce a board of nonsense if wrong — is
//       unit-tested against hand-built pixels.

const OFFSET = 32768;

/** RGBA → metres. `rgba.length` must be 4 × pixelCount. */
export function decodeTerrarium(
  rgba: Uint8ClampedArray | Uint8Array,
  pixelCount: number,
): Float32Array {
  if (rgba.length < pixelCount * 4) {
    throw new RangeError(
      `Terrarium decode: need ${String(pixelCount * 4)} bytes, got ${String(rgba.length)}.`,
    );
  }
  const out = new Float32Array(pixelCount);
  for (let i = 0, p = 0; p < pixelCount; i += 4, p += 1) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    out[p] = r * 256 + g + b / 256 - OFFSET;
  }
  return out;
}

/** Inverse, for building test fixtures: metres → [R, G, B]. */
export function encodeTerrarium(meters: number): [number, number, number] {
  const v = meters + OFFSET;
  const r = Math.floor(v / 256);
  const g = Math.floor(v - r * 256);
  const b = Math.round((v - r * 256 - g) * 256);
  return [r, g, Math.min(b, 255)];
}

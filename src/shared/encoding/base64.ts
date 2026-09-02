// WHAT: Base64 for byte arrays in browsers (and any runtime with atob/btoa).
// HOW:  Encodes in chunks so `String.fromCharCode.apply` never hits the
//       argument-count limit on large buffers; decodes via atob.
// WHY:  Fixture height fields are ~116 KB of Int16 data. Node has Buffer;
//       the browser does not, and this keeps the fixture codec runtime-agnostic.

import type { Base64Codec } from '@mapdata/elevation/heightFieldFixture';

const CHUNK = 0x8000;

export const browserBase64: Base64Codec = {
  encode(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  },
  decode(text: string): Uint8Array {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  },
};

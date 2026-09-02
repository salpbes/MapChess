// WHAT: Toolchain smoke test.
// HOW:  Imports a real project module through a path alias and asserts on it.
// WHY:  Proves Vitest starts, resolves `@app/*` the same way Vite does, and
//       type-checks under the strict tsconfig. Phase 2 adds the real tests.

import { describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@app/config';

describe('toolchain', () => {
  it('resolves path aliases and reads project config', () => {
    expect(APP_CONFIG.filesAndRanks).toBe(8);
    expect(APP_CONFIG.boardSizeMeters).toBe(2000);
  });

  it('keeps config immutable', () => {
    expect(Object.isFrozen(APP_CONFIG)).toBe(true);
  });
});

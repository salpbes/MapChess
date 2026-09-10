// WHAT: Vite build/dev-server configuration, shared with Vitest.
// HOW:  Declares the `@layer/*` path aliases (mirroring tsconfig `paths`) so
//       imports work identically in the browser bundle and in tests. Vitest
//       reads the `test` block from this same file.
// WHY:  One source of truth for aliases; if tsconfig and Vite disagree, code
//       that type-checks fails at runtime, which is the worst kind of bug.

import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = (layer: string): string => fileURLToPath(new URL(`./src/${layer}`, import.meta.url));

export default defineConfig({
  /*
    Relative asset URLs, so the built folder runs wherever it is dropped: a
    domain root, a GitHub Pages project subpath, or a file:// directory. The
    app is one page with no client-side routing, so nothing needs a real base
    path — and `import.meta.env.BASE_URL` still resolves the engine correctly.
  */
  base: './',
  resolve: {
    alias: {
      '@app': alias('app'),
      '@domain': alias('domain'),
      '@mapdata': alias('mapdata'),
      '@world': alias('world'),
      '@game': alias('game'),
      '@ai': alias('ai'),
      '@ui': alias('ui'),
      '@shared': alias('shared'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Domain layer only (see BUILD_PLAN §3); the 3D scene is not unit-tested.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

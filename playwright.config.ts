// WHAT: Playwright configuration for the journeys that drive the built site.
// HOW:  `webServer` builds the project and serves `dist/` with `vite preview`;
//       every project points at that one origin. Two viewports run the same
//       specs: a desktop window and a 390 px phone with touch.
// WHY:  Phase 12 shipped four CSS regressions, a resume bug and an icon row
//       that ran off the paper, past 399 passing unit tests. What actually
//       caught them was driving the real page in a headless browser, and those
//       scripts were thrown away. This is that, kept.
//
//       Against `preview` rather than `dev` deliberately: the thing shipped is
//       the thing tested, including the relative asset paths `base: './'`
//       produces and the MIME type the engine's .wasm is served with. A dev
//       server papers over both.

import { defineConfig, devices } from '@playwright/test';

const PORT = '4173';
const ORIGIN = `http://localhost:${PORT}`;

/*
  GitHub's runners are two cores with no GPU, so WebGL falls back to software
  rendering — and every test here boots a three.js board on real terrain. The
  same suite that takes under four minutes on a laptop takes seventeen there.

  So the clocks are generous on CI and tight locally. Tight locally is the
  point: a test that has genuinely become slow should be visible on the machine
  where it can be investigated, rather than hidden under a limit set for the
  slowest hardware it will ever meet.
*/
const ON_CI = process.env.CI !== undefined;

export default defineConfig({
  testDir: './tests/e2e',
  // Vitest owns `tests/**/*.test.ts`; the two suites never see each other.
  testMatch: '**/*.spec.ts',

  // A board build is WebGL and a worker booting Stockfish: slower than a DOM test.
  timeout: ON_CI ? 150_000 : 60_000,
  expect: { timeout: ON_CI ? 25_000 : 10_000 },

  // A journey that only passes sometimes is worse than no journey: it trains
  // you to re-run. Retries stay off locally so flake is visible immediately.
  retries: ON_CI ? 1 : 0,
  forbidOnly: ON_CI,
  /*
    Three at most. Every test boots a WebGL context and a Stockfish worker, so
    the usual "half the cores" default starves them: clicks arrive late enough
    that a four-second confirm window can lapse between two presses. One on CI,
    where the machine is smaller again.
  */
  workers: ON_CI ? 1 : 3,

  reporter: ON_CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // 390x844 is the iPhone 13/14/15 logical viewport — the width BUILD_PLAN
      // §13.3 names, and the narrowest screen worth supporting.
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],

  webServer: {
    // `npm run build` runs tsc and the prebuild engine copy, so a broken type
    // or a missing Stockfish binary fails here rather than halfway through a
    // journey with a confusing error.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: ORIGIN,
    /*
      Never reuse. A preview server left running from an earlier run serves the
      build that was current when it started, so `reuseExistingServer` silently
      tests stale code — which it did, during this phase's own development, and
      the failure looked like a broken app rather than a stale one. Rebuilding
      costs a few seconds and is the entire point of testing `preview`.
    */
    reuseExistingServer: false,
    // The server has to build the site first, which is also slower there.
    timeout: ON_CI ? 300_000 : 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

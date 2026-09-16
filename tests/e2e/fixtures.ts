// WHAT: The `test` every journey imports: the same Playwright test, plus a
//       fence that stops the page reaching anything but its own origin.
// HOW:  One route handler over `**/*`. Same-origin, `data:` and `blob:` go
//       through; everything else is aborted and recorded on `offline`, which a
//       test can read to assert what it tried.
// WHY:  BUILD_PLAN §13.1: the run must not touch Overpass, Terrarium,
//       Nominatim or Wikidata, so that it is honest about what it proves and
//       cannot be broken by someone else's outage. Blocking rather than
//       trusting is the only version of that claim which stays true — the
//       default area is a fixture today, but nothing stops a later change
//       quietly reintroducing a fetch, and a fence fails loudly when it does.

import { test as base } from '@playwright/test';

/** The preview server, and the two URL schemes the page serves itself from. */
const SAME_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

export interface FenceFixtures {
  /** Every off-origin URL the page tried to reach, in order. */
  readonly blockedRequests: string[];
}

export const test = base.extend<FenceFixtures>({
  blockedRequests: [
    async ({ page }, use) => {
      const attempts: string[] = [];

      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (SAME_ORIGIN.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
          await route.continue();
          return;
        }
        attempts.push(url);
        // The same failure a plane-mode phone gives, so the app's own error
        // states are what the journeys exercise.
        await route.abort('blockedbyclient');
      });

      await use(attempts);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';

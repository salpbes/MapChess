// WHAT: The harness proving itself: the built site loads, boots and draws,
//       with nothing reaching the network.
// HOW:  Opens the preview server's page, waits for the menu the app opens on,
//       and checks the WebGL canvas exists and has been sized.
// WHY:  BUILD_PLAN §13.1. Before any journey is worth writing, `test:e2e` has
//       to build, serve, drive and tear down on a clean checkout. This is the
//       test that fails first, and most usefully, when it cannot.

import { test, expect } from './fixtures';

test('the built site boots to the menu with no console errors', async ({
  page,
  blockedRequests,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  // Scoped to the dialog: the control dock's menu button carries "new game" in
  // its own label, so an unscoped name matches two things.
  const menu = page.getByRole('dialog', { name: 'MapChess menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'New game', exact: true })).toBeVisible();

  // The renderer is alive: a canvas exists and has been given real pixels.
  const canvas = page.locator('#world canvas');
  await expect(canvas).toBeAttached();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  // Aborted third-party requests surface as console noise; anything else is a
  // real fault in the built bundle.
  const unexpected = errors.filter((text) => !/ERR_BLOCKED_BY_CLIENT|Failed to fetch/i.test(text));
  expect(unexpected, unexpected.join('\n')).toEqual([]);

  // Says out loud what the fence stopped, so a new dependency is visible in
  // the run rather than silently tolerated.
  test
    .info()
    .annotations.push({ type: 'blocked', description: blockedRequests.join(', ') || 'nothing' });
});

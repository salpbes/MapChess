// WHAT: The weather over the board.
// HOW:  Glencoe, which ships with its data and opens in a storm, read off the
//       live stage; the weather button stepped through every mood.
// WHY:  A board opens in its own weather, the player can change it, and a
//       choice made on one board does not follow them onto the next — that
//       last is the difference between per-battle weather and a preference.

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

import { bootBoard, startGame, tapControl } from './board';

const mood = (page: Page) => page.evaluate(() => window.__mapchess?.stage.mood);

async function choose(page: Page, place: string): Promise<void> {
  await tapControl(page, 'Famous fields');
  await page.locator('.area-bar__list-item', { hasText: place }).click();
  await page.locator('.place-title').waitFor({ state: 'visible', timeout: 30_000 });
}

/** The weather button's name changes with the weather, so find it by its prefix. */
async function stepWeather(page: Page): Promise<void> {
  const name = await page
    .locator('button[aria-label^="Weather:"]')
    .first()
    .getAttribute('aria-label');
  await tapControl(page, name ?? 'Weather');
}

test.describe('weather', () => {
  /*
    Every test here runs at Glencoe in a storm — rain, trees and lightning
    over the steepest board — which is the heaviest scene in the game for a
    software renderer, at about six frames a second here and slower on CI.
    Measured, the storm costs a frame no more than midday does: these tests
    are long, not slow, and the default minute is for one board and a few
    clicks.
  */
  test.describe.configure({ timeout: 150_000 });

  test('opens a board in the weather its battle had', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    // Holy Island, the default board: a clear day.
    expect(await mood(page)).toBe('midday');
    // Glencoe: the massacre was in a February blizzard.
    await choose(page, 'Glencoe');
    expect(await mood(page)).toBe('storm');
  });

  test('lets the player change it, and the next board brings its own', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await choose(page, 'Glencoe');

    // Storm, then round through every mood and back.
    await stepWeather(page);
    expect(await mood(page)).toBe('midday');
    await stepWeather(page);
    expect(await mood(page)).toBe('mist');
    await stepWeather(page);
    expect(await mood(page)).toBe('storm');

    // Mist chosen at Glencoe is not carried to Rievaulx, which opens at midday.
    await stepWeather(page);
    await stepWeather(page);
    expect(await mood(page)).toBe('mist');
    await choose(page, 'Rievaulx');
    expect(await mood(page)).toBe('midday');
  });

  test('rains and blows in a storm, and only in a storm', async ({ page }) => {
    // Anything the GPU refuses to compile shows up here; the test network fence's
    // own blocked requests are expected and are not the weather's.
    const failures: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('ERR_BLOCKED_BY_CLIENT'))
        failures.push(m.text());
    });
    await bootBoard(page);
    await startGame(page);
    await choose(page, 'Glencoe');
    await page.waitForTimeout(500);

    const weatherNow = () =>
      page.evaluate(() => ({
        raining: window.__mapchess?.stage.raining,
        wind: window.__mapchess?.stage.wind,
      }));
    expect(await weatherNow()).toEqual({ raining: true, wind: 1 });
    await stepWeather(page); // midday: a breeze and no rain
    const midday = await weatherNow();
    expect(midday.raining).toBe(false);
    expect(midday.wind).toBeGreaterThan(0);
    expect(midday.wind).toBeLessThan(0.5);
    await stepWeather(page); // mist: still air
    expect(await weatherNow()).toEqual({ raining: false, wind: 0 });

    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('keeps the storm still for a player who has asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootBoard(page);
    await startGame(page);
    await choose(page, 'Glencoe');
    // Still a storm — its sky and light — without the falling rain or the bending trees.
    expect(await mood(page)).toBe('storm');
    expect(await page.evaluate(() => window.__mapchess?.stage.raining)).toBe(false);
    expect(await page.evaluate(() => window.__mapchess?.stage.wind)).toBe(0);
  });

  test('strikes lightning in a storm, and nowhere else', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    const strike = () =>
      page.evaluate(() => ({
        struck: window.__mapchess?.stage.flash(),
        strikes: window.__mapchess?.stage.lightningStrikes,
      }));
    // Holy Island at midday: no lightning, whatever is asked for.
    expect((await strike()).struck).toBe(false);
    await choose(page, 'Glencoe');
    const first = await strike();
    expect(first.struck).toBe(true);
    expect((await strike()).strikes).toBe((first.strikes ?? 0) + 1);
    // A close strike is the same kind of strike, lit harder.
    expect(await page.evaluate(() => window.__mapchess?.stage.flash(true))).toBe(true);
  });

  test('flashes no lightning for a player who has asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootBoard(page);
    await startGame(page);
    await choose(page, 'Glencoe');
    expect(await page.evaluate(() => window.__mapchess?.stage.flash())).toBe(false);
  });

  test('sounds like a storm while it storms and the sound is on', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    const heard = () => page.evaluate(() => window.__mapchess?.weatherSound() ?? null);
    await choose(page, 'Glencoe');
    // Silent until the player turns the sound on.
    expect(await heard()).toBeNull();
    await tapControl(page, 'Turn the sound on');
    await expect.poll(heard).toBe('storm');
    // Midday is quiet; the storm's sound fades away.
    await stepWeather(page);
    await expect.poll(heard).toBeNull();
    // And sound off silences a storm too.
    await stepWeather(page);
    await stepWeather(page);
    await expect.poll(heard).toBe('storm');
    await tapControl(page, 'Turn the sound off');
    await expect.poll(heard).toBeNull();
  });

  test('plays near and far thunder over a heavy or a steady rain without a fault', async ({
    page,
  }) => {
    // An audio graph that the browser refuses throws inside a timer, where the
    // game would carry on in silence; this is where it would show.
    const faults: string[] = [];
    page.on('pageerror', (e) => faults.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('ERR_BLOCKED_BY_CLIENT'))
        faults.push(m.text());
    });
    await bootBoard(page);
    await startGame(page);
    await choose(page, 'Glencoe');
    await tapControl(page, 'Turn the sound on');
    await expect
      .poll(() => page.evaluate(() => window.__mapchess?.weatherSound() ?? null))
      .toBe('storm');

    await page.evaluate(() => {
      window.__mapchess?.strike(true);
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      window.__mapchess?.strike(false);
    });
    await page.waitForTimeout(2500);

    // The rain is somewhere between a steady rain and a downpour.
    const rain = await page.evaluate(() => window.__mapchess?.stage.rainIntensity ?? 0);
    expect(rain).toBeGreaterThanOrEqual(0.55);
    expect(rain).toBeLessThanOrEqual(1);
    expect(faults, faults.join('\n')).toEqual([]);
  });
});

// WHAT: The promises §13.3 makes about the shape of the page, at both widths.
// HOW:  Boots a real game and measures: what the page scrolls, how much of the
//       screen the HUD takes at rest, and whether the two buttons a player
//       needs without asking are on screen.
// WHY:  The six journeys prove the game still works at 390px; they do not
//       prove it is usable, because a journey clicks through whatever is in
//       front of it. Every regression Phase 12 shipped was a layout fault that
//       a behaviour test would have walked straight past.

import { test, expect } from './fixtures';
import { bootBoard, notesTab, startGame, tapControl } from './board';

test.describe('the shape of the page', () => {
  test('never scrolls sideways', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test('keeps the board clear at rest, and the way out and the way in on screen', async ({
    page,
  }) => {
    await bootBoard(page);
    await startGame(page);

    const phone = test.info().project.name === 'phone';
    const sheetBody = page.locator('.sheet__body');
    const menu = page.getByRole('button', { name: 'Menu — new game, resume, change area' });

    if (!phone) {
      // Above the breakpoint the drawer does not exist: the panels are the
      // columns they always were, and its chrome never paints.
      await expect(page.locator('.sheet__chrome')).toBeHidden();
      await expect(page.locator('.column')).toBeVisible();
      await expect(page.locator('.briefing')).toBeVisible();
      return;
    }

    // The gazetteer is something you ask for, so at rest it is not on the board.
    await expect(sheetBody).toBeHidden();

    // What is on the board at rest is the bar, and it stays out of the way.
    const bar = page.locator('.sheet__chrome');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    const height = await page.evaluate(() => window.innerHeight);
    expect(box?.height ?? height).toBeLessThan(height * 0.2);

    // The way out of the game, and the reason a beginner can play it at all.
    await expect(menu).toBeVisible();
    await expect(page.getByRole('button', { name: /^Tips/ })).toBeVisible();
  });

  test('credits the data on one row, without shortening the licensed line', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const attribution = page.locator('.attribution');
    await expect(attribution).toBeVisible();

    // Every source still named — dropping a credit to save space is not a
    // layout decision, it is a licence one.
    await expect(attribution).toContainText('© OpenStreetMap contributors');
    await expect(attribution).toContainText('Stockfish');
    await expect(attribution).toContainText('Wikidata');
    await expect(attribution).toContainText('Mapzen');

    // One row: two was costing the board a bar's worth of height.
    const box = await attribution.boundingBox();
    const lineHeight = await attribution.evaluate(
      (el) => parseFloat(getComputedStyle(el).fontSize) * 1.6,
    );
    expect(box?.height ?? 0).toBeLessThanOrEqual(lineHeight);
  });

  test('says how the game stands without covering the credits', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', "the strip is the phone's answer to a drawer");

    await bootBoard(page);
    await startGame(page);

    /*
      There with no drawer opened and nothing switched on. That is the whole
      point of it: the reading used to sit behind a drawer, behind a tab, behind
      a button a new player had never met, which is a strange place to keep the
      answer to "am I winning".

      It appears a move-search late rather than empty, so this waits.
    */
    const standing = page.locator('.sheet__standing');
    await expect(standing).toBeVisible({ timeout: 30_000 });

    // Informative, not decorative: a verdict and the conventional number.
    const text = (await page.locator('.sheet__standing-text').textContent()) ?? '';
    expect(text).not.toBe('');

    /*
      The bar and the words have to agree, against a real engine on a real
      position. The bar is White's share drawn from the left, and the number is
      White-relative, so a plus means the fill passes halfway and a minus means
      it does not. This is the one check that runs the whole chain — Stockfish's
      UCI score, the turn it was spoken from, the maths, and the CSS — and it
      catches an inverted bar whatever the position happens to be, which a
      fixture cannot.
    */
    const share = await page.locator('.sheet__standing-fill').evaluate((fill) => {
      const groove = fill.parentElement;
      if (groove === null) return NaN;
      return fill.getBoundingClientRect().width / groove.getBoundingClientRect().width;
    });
    const signed = /([+\u2212-])(\d+\.\d+)/.exec(text);
    if (signed !== null) {
      const white = signed[1] === '+';
      // 0.0 sits on the line; anything else has to fall on the right side of it.
      if (signed[2] !== '0.0') {
        expect(
          white ? share : 1 - share,
          `"${text}" against a fill of ${String(share)}`,
        ).toBeGreaterThan(0.5);
      }
    }

    // One line. Two would push the six buttons off a phone lying on its side.
    const strip = await standing.boundingBox();
    expect(strip?.height ?? 0).toBeLessThanOrEqual(26);

    /*
      And the reserve grew with it. The drawer takes a fixed strip of the board
      and anything anchored to the bottom clears exactly that, so a line added
      here without widening the reserve draws the drawer's paper over the ODbL
      credit — which is a licence fault, not a layout one, and has happened
      once already.
    */
    const credits = await page.locator('.attribution').boundingBox();
    expect(credits).not.toBeNull();
    expect(credits?.y ?? 0).toBeLessThan(strip?.y ?? 0);

    // And it still goes away when it is not wanted, giving the board back the
    // height it borrowed. On by default is a default, not a fixture.
    await tapControl(page, 'Show how the game stands');
    await expect(standing).toBeHidden();
    const reserve = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--sheet-bar').trim(),
    );
    expect(reserve).toBe('104px');
  });

  test('the picker is mostly map', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Choose a place on the map');

    // The panel was a fixed 340px beside the map, so on a phone the one screen
    // whose whole job is choosing a place on a map showed 62px of map.
    const map = await page.locator('.area-picker__map').boundingBox();
    const panel = await page.locator('.area-picker__panel').boundingBox();
    const mapArea = (map?.width ?? 0) * (map?.height ?? 0);
    const panelArea = (panel?.width ?? 0) * (panel?.height ?? 0);

    expect(mapArea).toBeGreaterThan(panelArea);
    expect(map?.width ?? 0).toBeGreaterThan(280);
    expect(map?.height ?? 0).toBeGreaterThan(200);
  });

  test('every overlay fits a phone lying on its side', async ({ page }) => {
    // A landscape phone is not narrow, it is short — about 400px tall. The
    // menu ran past both edges there, putting "Back to the board", the one
    // control that gets you out, below the fold.
    await page.setViewportSize({ width: 844, height: 390 });
    await bootBoard(page);

    const menu = page.getByRole('dialog', { name: 'MapChess menu' });
    const exit = menu.getByRole('button', { name: 'Back to the board' });
    await expect(exit).toBeVisible();

    const box = await exit.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(390);

    // And it really does dismiss, rather than merely being on screen.
    await exit.click();
    await expect(menu).toBeHidden();
  });

  test('looks straight down when asked', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await tapControl(page, 'Look straight down at the board');

    const view = await page.evaluate(() => {
      const app = window.__mapchess;
      if (app === undefined) throw new Error('no handle');
      const b = app.layout().bounds;
      const p = app.stage.camera.position;
      const centreX = (b.minX + b.maxX) / 2;
      const centreZ = (b.minZ + b.maxZ) / 2;
      return {
        // How far off vertical the camera sits, as a fraction of its height.
        lean: Math.hypot(p.x - centreX, p.z - centreZ) / Math.max(p.y - b.maxY, 1),
        aboveBoard: p.y > b.maxY,
      };
    });

    expect(view.aboveBoard).toBe(true);
    // Effectively overhead: a tilted default sits at roughly 0.5 or more.
    expect(view.lean).toBeLessThan(0.05);
  });

  test('opens the gazetteer already unfolded', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'The drawer only exists below the breakpoint.');

    await bootBoard(page);
    await startGame(page);

    await notesTab(page, 'field').click();

    // Arriving at a collapsed panel would make the reader ask twice for one
    // thing: the tab IS the request to read it.
    await expect(page.locator('.briefing__body')).toBeVisible();
    await expect(page.locator('.briefing')).toContainText('Ground');
  });
});

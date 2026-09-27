// WHAT: Which pieces stand on the board: the original set, an era's set, or a
//       preview of one still being made.
// HOW:  Asks the running board which set each piece came from — every model
//       carries its set in userData — rather than guessing from a screenshot.
// WHY:  Two promises, both invisible until broken. A half-made set must never
//       reach a player: an ANZAC pawn beside a medieval knight is a work in
//       progress, not a board. And the person making the set must be able to
//       see it on real ground as each figure is finished, with the gaps filled
//       so the preview is still a game.

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

import { bootBoard, startGame, tapControl } from './board';

/** The set the first piece of this colour and type on the board came from. */
async function setOf(page: Page, color: 'white' | 'black', type: string): Promise<string | null> {
  return page.evaluate(
    ([c, t]) => {
      const app = window.__mapchess;
      if (app === undefined) return null;
      let found: string | null = null;
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
         @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
      (app.stage as any).scene.traverse((node: any) => {
        const piece = node.userData?.piece;
        if (found === null && piece?.color === c && piece?.type === t) {
          found = (node.userData.set as string | undefined) ?? 'procedural';
        }
      });
      /* eslint-enable */
      return found;
    },
    [color, type] as const,
  );
}

test.describe('piece sets', () => {
  test("dresses a finished set's battlefield in it, for every player", async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    // No preview in the address: this is what anybody choosing Anzac Cove sees.
    await tapControl(page, 'Famous fields');
    await page.locator('.area-bar__list-item', { hasText: 'Anzac Cove' }).click();

    expect(await page.evaluate(() => window.__mapchess?.pieceSet())).toBe('ww1');
    for (const type of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
      await expect.poll(() => setOf(page, 'white', type), { timeout: 30_000 }).toBe('ww1');
      expect(await setOf(page, 'black', type), `black ${type}`).toBe('ww1');
    }
  });

  test('keeps the original pieces everywhere that is not a named battle', async ({ page }) => {
    // Holy Island, the default board. A half-made set is kept from players by
    // choosePieceSet, which the unit tests pin; this pins the other promise —
    // that a finished era set stays on its own battlefields.
    await bootBoard(page);
    await startGame(page);
    expect(await page.evaluate(() => window.__mapchess?.pieceSet())).toBe('medieval');
    await expect.poll(() => setOf(page, 'white', 'knight'), { timeout: 30_000 }).toBe('medieval');
  });

  test('previews a set on any board', async ({ page }) => {
    await bootBoard(page, '/?pieces=ww1');
    await startGame(page);
    expect(await page.evaluate(() => window.__mapchess?.pieceSet())).toBe('ww1');
    await expect.poll(() => setOf(page, 'white', 'queen'), { timeout: 30_000 }).toBe('ww1');
    expect(await setOf(page, 'black', 'king')).toBe('ww1');
  });

  test('never squeezes a figure to make it fit', async ({ page }) => {
    await bootBoard(page, '/?pieces=ww1');
    await startGame(page);
    await expect.poll(() => setOf(page, 'white', 'rook'), { timeout: 30_000 }).toBe('ww1');

    /*
      The WW1 rooks are wider than a square allows at rook height, and their
      author chose their shape over their height. So they are scaled by one
      factor on every axis: a model squeezed on one axis is somebody's work
      quietly changed.
    */
    const scales = await page.evaluate(() => {
      const out: number[][] = [];
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
         @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
      (window.__mapchess?.stage as any).scene.traverse((node: any) => {
        const p = node.userData?.piece;
        if (p?.type === 'rook' && node.userData.set === 'ww1') {
          const s = node.children[0].scale as { x: number; y: number; z: number };
          out.push([s.x, s.y, s.z]);
        }
      });
      /* eslint-enable */
      return out;
    });
    expect(scales.length).toBeGreaterThan(0);
    for (const [x, y, z] of scales) {
      expect(x).toBeCloseTo(y ?? 0, 9);
      expect(z).toBeCloseTo(y ?? 0, 9);
    }
  });

  test('turns the field guns to fire at the enemy', async ({ page }) => {
    await bootBoard(page, '/?pieces=ww1');
    await startGame(page);
    await expect.poll(() => setOf(page, 'white', 'bishop'), { timeout: 30_000 }).toBe('ww1');

    /*
      Each gun's muzzle is its farthest point from the piece's own axis in the
      upper half of the model — the trail rests on the ground, the barrel does
      not. White stands at +Z and faces −Z, so a White barrel must point toward
      −Z and a Black one toward +Z. The guns were modelled barrel along −X, and
      before `turn` they fired straight down the rank at their own pieces.
    */
    const muzzles = await page.evaluate(() => {
      const out: { color: string; dx: number; dz: number }[] = [];
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
         @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
      (window.__mapchess?.stage as any).scene.traverse((root: any) => {
        const p = root.userData?.piece;
        if (p?.type !== 'bishop' || root.userData.set !== 'ww1') return;
        root.updateMatrixWorld(true);
        const o = root.matrixWorld.elements;
        const ox = o[12] as number,
          oz = o[14] as number;
        const pts: number[][] = [];
        root.traverse((n: any) => {
          const pos = n.geometry?.attributes?.position;
          if (pos === undefined) return;
          const e = n.matrixWorld.elements as number[];
          const at = (k: number): number => e[k] ?? 0;
          for (let i = 0; i < (pos.count as number); i += 3) {
            const x = pos.getX(i) as number;
            const y = pos.getY(i) as number;
            const z = pos.getZ(i) as number;
            pts.push([
              at(0) * x + at(4) * y + at(8) * z + at(12),
              at(1) * x + at(5) * y + at(9) * z + at(13),
              at(2) * x + at(6) * y + at(10) * z + at(14),
            ]);
          }
        });
        const ys = pts.map((q) => q[1] ?? 0);
        const lo = Math.min(...ys),
          hi = Math.max(...ys);
        let far = [0, 0, 0],
          d = -1;
        for (const q of pts) {
          if ((q[1] ?? 0) < lo + 0.45 * (hi - lo)) continue;
          const r = Math.hypot((q[0] ?? 0) - ox, (q[2] ?? 0) - oz);
          if (r > d) {
            d = r;
            far = q;
          }
        }
        out.push({ color: p.color as string, dx: (far[0] ?? 0) - ox, dz: (far[2] ?? 0) - oz });
      });
      /* eslint-enable */
      return out;
    });

    expect(muzzles).toHaveLength(4);
    for (const { color, dx, dz } of muzzles) {
      // Mostly along the file, and toward the other army.
      expect(Math.abs(dz), `${color} gun aims along the rank`).toBeGreaterThan(Math.abs(dx));
      expect(Math.sign(dz), `${color} gun faces its own side`).toBe(color === 'white' ? -1 : 1);
      // Long, and allowed the length of its own square along the file — but
      // no further, or the barrel would run into the piece ahead.
      expect(Math.hypot(dx, dz), `${color} gun reaches past its square`).toBeLessThanOrEqual(
        0.5 * (2000 / 8) + 1,
      );
    }
  });
});

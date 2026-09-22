// WHAT: The Content-Security-Policy in index.html, and the two things it broke.
// HOW:  Records every `securitypolicyviolation` the page fires while it boots
//       and a game starts, then looks at a piece to see it still has its
//       texture.
// WHY:  A CSP fails silently and late. Both of these were real: `connect-src`
//       without `blob:` stopped GLTFLoader fetching a model's KTX2 texture back
//       out of its Blob URL, and refusing `unsafe-eval` stopped the basis
//       transcoder registering itself, because Emscripten embind builds its
//       invokers with `new Function`. Neither raised a failing test — the
//       pieces simply arrived grey — and the second could not even be seen from
//       the policy, only from a board.
//
//       So the guard is the texture, not the policy text. Tightening a
//       directive is meant to fail here rather than in somebody's browser.

import { test, expect } from './fixtures';

import { bootBoard, startGame } from './board';

/** Reads a piece's material back off the running board. */
const PIECE_TEXTURE = () => {
  const app = window.__mapchess;
  if (app === undefined) return 'no app';
  const found: string[] = [];
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
     @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
  (app.stage as any).scene.traverse((root: any) => {
    if (root.userData?.piece === undefined || found.length > 0) return;
    root.traverse((node: any) => {
      if (node.isMesh !== true || found.length > 0) return;
      const map = node.material?.map;
      found.push(
        map === null || map === undefined
          ? 'none'
          : `${String(map.image?.width)}x${String(map.image?.height)}`,
      );
    });
  });
  /* eslint-enable */
  return found[0] ?? 'no pieces';
};

test.describe('the content security policy', () => {
  test('lets the game boot and play without violating itself', async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.warn(`CSPVIOLATION ${e.violatedDirective} blocked ${e.blockedURI}`);
      });
    });
    page.on('console', (m) => {
      if (m.text().startsWith('CSPVIOLATION')) violations.push(m.text());
    });

    await bootBoard(page);
    await startGame(page);

    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('leaves the pieces their textures', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    // The models load after first paint, so the board is playable before they
    // arrive and the texture appears a moment later than the piece does.
    await expect
      .poll(async () => page.evaluate(PIECE_TEXTURE), { timeout: 30_000 })
      .toBe('2048x2048');
  });
});

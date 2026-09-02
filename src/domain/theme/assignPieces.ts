// WHAT: Chooses which cell each piece of each colour takes its identity from.
// HOW:  For a colour, the candidate cells are its own half of the board
//       (ranks 1–4 White, 5–8 Black). Each piece type has a scoring function
//       over CellFacts + CellIdentity; pieces are filled in a fixed order
//       (king, queen, rooks, bishops, knights, pawns) taking the best unused
//       cell each time, so a cell lends its name to at most one piece. Every
//       scorer has a terrain-only floor, so a board with no OSM names still
//       fills all sixteen identities sensibly (BUILD_PLAN §8, sparse naming).
//       The reason string is built from whichever criterion won.
// WHY:  BUILD_PLAN Phase 10's identity rules, made deterministic and total.

import { ALL_SQUARES, rankIndex } from '@domain/board/Square';
import type { Square } from '@domain/board/Square';
import type { Color, PieceType } from '@domain/chess/types';

import type { CellFacts, CellIdentity, PieceIdentity, ThemeFeature } from './types';
import { hasStem, KNIGHT_STEMS, RELIGIOUS_STEMS } from './wordlists';

/** Home squares per colour, in the order pieces are assigned: knights before bishops because a ford is more knight than bishop. */
const HOMES: Readonly<Record<Color, readonly { type: PieceType; square: Square }[]>> = {
  white: [
    { type: 'king', square: 'e1' },
    { type: 'queen', square: 'd1' },
    { type: 'rook', square: 'a1' },
    { type: 'rook', square: 'h1' },
    { type: 'knight', square: 'b1' },
    { type: 'knight', square: 'g1' },
    { type: 'bishop', square: 'c1' },
    { type: 'bishop', square: 'f1' },
    ...(['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'] as const).map((square) => ({
      type: 'pawn' as const,
      square,
    })),
  ],
  black: [
    { type: 'king', square: 'e8' },
    { type: 'queen', square: 'd8' },
    { type: 'rook', square: 'a8' },
    { type: 'rook', square: 'h8' },
    { type: 'knight', square: 'b8' },
    { type: 'knight', square: 'g8' },
    { type: 'bishop', square: 'c8' },
    { type: 'bishop', square: 'f8' },
    ...(['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7'] as const).map((square) => ({
      type: 'pawn' as const,
      square,
    })),
  ],
};

const PLACE_RANK: Readonly<Record<string, number>> = {
  city: 100,
  town: 90,
  village: 80,
  suburb: 60,
  hamlet: 55,
  neighbourhood: 45,
  locality: 35,
  isolated_dwelling: 25,
  farm: 20,
};

interface Scored {
  readonly score: number;
  readonly reason: string;
}

interface Context {
  readonly lo: number;
  readonly hi: number;
}

/** Scores at or above this come from a piece's primary rule (a peak, a church, a ford, a settlement). */
const STRONG = 600;

export function assignPieces(
  cells: readonly CellFacts[],
  identities: ReadonlyMap<Square, CellIdentity>,
): PieceIdentity[] {
  const heights = cells.map((c) => c.heightMeters);
  const ctx: Context = { lo: Math.min(...heights), hi: Math.max(...heights) };
  const bySquare = new Map(cells.map((c) => [c.square, c]));
  const out: PieceIdentity[] = [];

  for (const color of ['white', 'black'] as const) {
    const half = ALL_SQUARES.filter((sq) =>
      color === 'white' ? rankIndex(sq) < 4 : rankIndex(sq) >= 4,
    );
    const used = new Set<Square>();
    const chosen = new Map<Square, { square: Square; reason: string }>();

    // Pass 1: every piece that has a strong match takes it, so a knight's fallback
    // ("any named cell") can never steal the bishop's church. Pass 2: fill the rest.
    const deferred: { type: PieceType; square: Square }[] = [];
    for (const home of HOMES[color]) {
      const best = pickBest(home.type, half, used, bySquare, identities, ctx);
      if (best.score >= STRONG) {
        used.add(best.square);
        chosen.set(home.square, best);
      } else {
        deferred.push(home);
      }
    }
    for (const home of deferred) {
      const best = pickBest(home.type, half, used, bySquare, identities, ctx);
      used.add(best.square);
      chosen.set(home.square, best);
    }

    for (const home of HOMES[color]) {
      const best = chosen.get(home.square);
      const cell = best === undefined ? undefined : identities.get(best.square);
      if (best === undefined || cell === undefined)
        throw new Error(`No identity for ${home.square}`);
      out.push({ color, type: home.type, homeSquare: home.square, cell, reason: best.reason });
    }
  }
  return out;
}

function pickBest(
  type: PieceType,
  half: readonly Square[],
  used: ReadonlySet<Square>,
  facts: ReadonlyMap<Square, CellFacts>,
  identities: ReadonlyMap<Square, CellIdentity>,
  ctx: Context,
): { square: Square; score: number; reason: string } {
  let best: { square: Square; score: number; reason: string } | null = null;
  for (const square of half) {
    if (used.has(square)) continue;
    const f = facts.get(square);
    const id = identities.get(square);
    if (f === undefined || id === undefined) continue;
    const s = SCORERS[type](f, id, ctx);
    // Ties break toward the square listed first, so results are stable.
    if (best === null || s.score > best.score) best = { square, score: s.score, reason: s.reason };
  }
  if (best === null) throw new Error(`No cell left for ${type}`);
  return best;
}

// ------------------------------------------------------------------ scorers

type Scorer = (cell: CellFacts, id: CellIdentity, ctx: Context) => Scored;

const inside = (cell: CellFacts, kind: ThemeFeature['kind']): ThemeFeature | undefined =>
  cell.features.find((f) => f.kind === kind && f.distanceMeters === 0);

const relHeight = (cell: CellFacts, ctx: Context): number =>
  ctx.hi - ctx.lo < 1e-6 ? 0.5 : (cell.heightMeters - ctx.lo) / (ctx.hi - ctx.lo);

const named = (id: CellIdentity): boolean => id.source !== 'generated' && id.source !== 'nearby';
/** " at Rievaulx" for a real name; nothing for borrowed or generated ones, which read badly in a sentence. */
const at = (id: CellIdentity): string => (named(id) ? ` at ${id.name}` : '');
const of = (id: CellIdentity): string => (named(id) ? ` of ${id.name}` : '');

const settlement: Scorer = (cell, id) => {
  const place = cell.features.filter((f) => f.kind === 'place' && f.distanceMeters === 0);
  const top = place.map((p) => PLACE_RANK[p.subtype ?? ''] ?? 30).sort((a, b) => b - a)[0];
  if (top !== undefined) {
    const kind = place.find((p) => (PLACE_RANK[p.subtype ?? ''] ?? 30) === top)?.subtype ?? 'place';
    const old = id.source === 'old_name' ? ' — an old name still remembered' : '';
    return {
      score: 1000 + top * 10 + (id.source === 'old_name' ? 50 : 0),
      reason: `the ${kind.replace('_', ' ')}${of(id)}${old}`,
    };
  }
  const hist = inside(cell, 'historic');
  if (hist !== undefined)
    return {
      score: 600 + (named(id) ? 50 : 0),
      reason: `the ${hist.subtype ?? 'historic site'}${at(id)}`,
    };
  if (named(id)) return { score: 300, reason: `the named ground of ${id.name}` };
  return { score: 100, reason: `the heart of its half of the board` };
};

const rook: Scorer = (cell, id, ctx) => {
  const rh = relHeight(cell, ctx);
  const h = `${String(Math.round(cell.heightMeters))} m`;
  if (inside(cell, 'peak')) return { score: 1000 + rh * 100, reason: `the summit${of(id)}, ${h}` };
  if (inside(cell, 'ridge')) return { score: 800 + rh * 100, reason: `the ridge${at(id)}, ${h}` };
  if (cell.coastal && cell.cover !== 'water' && cell.cover !== 'sand')
    return { score: 700 + rh * 100, reason: `the headland${at(id)}` };
  return { score: rh * 500, reason: `the highest ground on this side, ${h}${at(id)}` };
};

const bishop: Scorer = (cell, id) => {
  const worship = inside(cell, 'worship');
  if (worship !== undefined)
    return {
      score: 1000,
      reason: `the ${worship.subtype ?? ''} place of worship${at(id)}`.replace('  ', ' '),
    };
  const hist = inside(cell, 'historic');
  if (hist !== undefined && hasStem(id.name, RELIGIOUS_STEMS))
    return { score: 950, reason: `the ${hist.subtype ?? 'ruins'}${of(id)}` };
  if (hasStem(id.name, RELIGIOUS_STEMS))
    return { score: 900, reason: `the holy name of ${id.name}` };
  if (hist !== undefined)
    return { score: 700, reason: `the ${hist.subtype ?? 'historic site'}${at(id)}` };
  if (id.source === 'old_name' || id.source === 'historic')
    return { score: 500, reason: `the old name ${id.name}` };
  if (cell.cover === 'wood')
    return { score: 300 + (named(id) ? 50 : 0), reason: `the quiet of the woods${at(id)}` };
  if (inside(cell, 'ford')) return { score: 250, reason: `the ford${at(id)}` };
  return { score: named(id) ? 200 : 50, reason: `the ground${of(id)}` };
};

const knight: Scorer = (cell, id) => {
  if (inside(cell, 'ford')) return { score: 1000, reason: `the river crossing${at(id)}` };
  if (inside(cell, 'saddle')) return { score: 950, reason: `the pass${at(id)}` };
  if (hasStem(id.name, KNIGHT_STEMS)) return { score: 900, reason: `the name of ${id.name}` };
  const river = inside(cell, 'waterway');
  if (river !== undefined && inside(cell, 'place'))
    return { score: 700, reason: `the crossing where ${id.name} meets the water` };
  if (river !== undefined)
    return {
      score: 400 + (named(id) ? 50 : 0),
      reason: `the ${river.subtype ?? 'stream'}${at(id)}`,
    };
  if (cell.cover === 'scrub')
    return { score: 300 + (named(id) ? 50 : 0), reason: `the open riding ground${of(id)}` };
  return { score: named(id) ? 200 : 50, reason: `the ground${of(id)}` };
};

const pawn: Scorer = (cell, id, ctx) => {
  // Named minor places first, then anything with a feature, then plain ground; low ground before high.
  const place = inside(cell, 'place');
  if (place !== undefined)
    return {
      score: 500 + (PLACE_RANK[place.subtype ?? ''] ?? 30),
      reason: `the ${(place.subtype ?? 'place').replace('_', ' ')}${of(id)}`,
    };
  const ground = `from the ${id.ground.replace(/, \d+ m$/, '')}`;
  if (named(id)) return { score: 400, reason: ground };
  if (id.source === 'nearby') return { score: 300, reason: ground };
  return { score: 100 - relHeight(cell, ctx) * 50, reason: ground };
};

const SCORERS: Readonly<Record<PieceType, Scorer>> = {
  king: settlement,
  queen: settlement,
  rook,
  bishop,
  knight,
  pawn,
};

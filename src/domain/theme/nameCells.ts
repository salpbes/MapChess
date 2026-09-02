// WHAT: Gives every cell a display name and a one-line description of its ground.
// HOW:  The fallback chain from BUILD_PLAN §1, in order: a feature inside the
//       cell with an old_name → a historic name → a modern name → the nearest
//       named feature outside the cell ("below Ashberry Hill", "by the River
//       Rye") → a name generated from height and land cover ("High Moor",
//       "Nether Meadow"). Generated names are made unique across the board
//       with compass words, then ordinals. Deterministic.
// WHY:  A board must never render with a blank cell (BUILD_PLAN §1). The
//       chain is built alongside the happy path, not after (§8).

import { fileIndex, rankIndex } from '@domain/board/Square';

import type { CellFacts, CellIdentity, NameSource, ThemeFeature } from './types';
import { COMPASS_WORDS, COVER_NOUNS, HEIGHT_WORDS } from './wordlists';

/** Which feature kinds may lend a cell their name, most specific first. */
const NAME_PRIORITY: readonly ThemeFeature['kind'][] = [
  'place',
  'peak',
  'historic',
  'worship',
  'saddle',
  'ford',
  'water',
  'ridge',
  'wood',
  'waterway',
  'scrub',
  'coastline',
];

const NEARBY_MAX_METERS = 400;

export function nameCells(cells: readonly CellFacts[]): Map<CellFacts['square'], CellIdentity> {
  const heights = cells.map((c) => c.heightMeters);
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const used = new Set<string>();
  const out = new Map<CellFacts['square'], CellIdentity>();

  // Named cells first so generated names never collide with a real one.
  const pending: CellFacts[] = [];
  for (const cell of cells) {
    const own = ownName(cell);
    if (own !== null) {
      used.add(own.name.toLowerCase());
      out.set(cell.square, {
        square: cell.square,
        ...own,
        ground: describeGround(cell, lo, hi),
        heightMeters: cell.heightMeters,
      });
    } else {
      pending.push(cell);
    }
  }
  for (const cell of pending) {
    const chosen = nearbyName(cell) ?? {
      name: generatedName(cell, lo, hi, used),
      source: 'generated' as const,
    };
    used.add(chosen.name.toLowerCase());
    out.set(cell.square, {
      square: cell.square,
      ...chosen,
      ground: describeGround(cell, lo, hi),
      heightMeters: cell.heightMeters,
    });
  }
  disambiguate(out, cells);
  return out;
}

/** A wood or river crossing several cells names them all the same; keep one and vary the rest. */
function disambiguate(
  out: Map<CellFacts['square'], CellIdentity>,
  cells: readonly CellFacts[],
): void {
  const groups = new Map<string, CellIdentity[]>();
  for (const cell of cells) {
    const id = out.get(cell.square);
    if (id === undefined) continue;
    const key = id.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const taken = new Set(groups.keys());
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // The keeper: the cell holding a point feature with that name, else the first.
    const keeper =
      group.find((id) =>
        cells
          .find((c) => c.square === id.square)
          ?.features.some(
            (f) =>
              f.distanceMeters === 0 &&
              (f.kind === 'place' ||
                f.kind === 'peak' ||
                f.kind === 'historic' ||
                f.kind === 'worship'),
          ),
      ) ?? group[0];
    if (keeper === undefined) continue;
    for (const id of group) {
      if (id === keeper) continue;
      const variants =
        id.source === 'nearby' ? nearbyVariants(id, keeper) : ownVariants(id, keeper);
      const fresh = variants.find((v) => !taken.has(v.toLowerCase())) ?? `${id.name} ${id.square}`;
      taken.add(fresh.toLowerCase());
      out.set(id.square, { ...id, name: fresh });
    }
  }
}

function ownVariants(id: CellIdentity, keeper: CellIdentity): string[] {
  const base = id.name;
  const higher = id.heightMeters > keeper.heightMeters + 0.5;
  const lower = id.heightMeters < keeper.heightMeters - 0.5;
  const first = higher
    ? [`Upper ${base}`, `High ${base}`]
    : lower
      ? [`Lower ${base}`, `Nether ${base}`]
      : [];
  return [
    ...first,
    `${base} Edge`,
    `${base} Side`,
    `${base} End`,
    `Far ${base}`,
    `Little ${base}`,
    `Upper ${base}`,
    `Lower ${base}`,
  ];
}

function nearbyVariants(id: CellIdentity, keeper: CellIdentity): string[] {
  // "By River Rye" → "Above River Rye", "Under River Rye", "Beside River Rye"…
  const base = id.name.replace(/^(By|Near|Below) /, '');
  const higher = id.heightMeters > keeper.heightMeters + 0.5;
  const lower = id.heightMeters < keeper.heightMeters - 0.5;
  const first = higher
    ? [`Above ${base}`, `Over ${base}`]
    : lower
      ? [`Under ${base}`, `Beneath ${base}`]
      : [];
  return [
    ...first,
    `Beside ${base}`,
    `Beyond ${base}`,
    `Across from ${base}`,
    `Toward ${base}`,
    `Above ${base}`,
    `Under ${base}`,
  ];
}

function ownName(cell: CellFacts): { name: string; source: NameSource } | null {
  const inside = cell.features.filter((f) => f.distanceMeters === 0);
  for (const kind of NAME_PRIORITY) {
    for (const f of inside.filter((x) => x.kind === kind)) {
      if (f.names.oldName !== undefined) return { name: f.names.oldName, source: 'old_name' };
    }
  }
  for (const kind of NAME_PRIORITY) {
    for (const f of inside.filter((x) => x.kind === kind)) {
      if (f.names.historicName !== undefined)
        return { name: f.names.historicName, source: 'historic' };
    }
  }
  for (const kind of NAME_PRIORITY) {
    for (const f of inside.filter((x) => x.kind === kind)) {
      if (f.names.name !== undefined) return { name: f.names.name, source: 'name' };
    }
  }
  return null;
}

function nearbyName(cell: CellFacts): { name: string; source: NameSource } | null {
  const near = cell.features
    .filter((f) => f.distanceMeters > 0 && f.distanceMeters <= NEARBY_MAX_METERS)
    .map((f) => ({ f, name: f.names.oldName ?? f.names.historicName ?? f.names.name }))
    .filter((x): x is { f: ThemeFeature; name: string } => x.name !== undefined)
    .sort((a, b) => a.f.distanceMeters - b.f.distanceMeters)[0];
  if (near === undefined) return null;
  const prefix =
    near.f.kind === 'peak' || near.f.kind === 'ridge'
      ? 'Below'
      : near.f.kind === 'waterway' || near.f.kind === 'water' || near.f.kind === 'coastline'
        ? 'By'
        : 'Near';
  return { name: `${prefix} ${near.name}`, source: 'nearby' };
}

function generatedName(cell: CellFacts, lo: number, hi: number, used: Set<string>): string {
  const band = heightBand(cell.heightMeters, lo, hi);
  const nouns = COVER_NOUNS[cell.cover] ?? COVER_NOUNS.grass ?? ['Ground'];
  const heightWords = HEIGHT_WORDS[band];
  const f = fileIndex(cell.square);
  const r = rankIndex(cell.square);
  // Vary the noun by position so neighbours differ, then adjective, then compass, then ordinal.
  const noun = nouns[(f + r) % nouns.length] ?? 'Ground';
  const adj = heightWords[(f * 3 + r) % heightWords.length] ?? 'High';
  const candidates = [
    `${adj} ${noun}`,
    `${compass(f, r)} ${noun}`,
    `${adj} ${compass(f, r)} ${noun}`,
    ...nouns.map((n) => `${adj} ${n}`),
    ...nouns.map((n) => `${compass(f, r)} ${n}`),
  ];
  for (const c of candidates) if (!used.has(c.toLowerCase())) return c;
  for (let i = 2; ; i += 1) {
    const c = `${adj} ${noun} ${String(i)}`;
    if (!used.has(c.toLowerCase())) return c;
  }
}

function heightBand(h: number, lo: number, hi: number): keyof typeof HEIGHT_WORDS {
  if (hi - lo < 1e-6) return 'mid';
  const t = (h - lo) / (hi - lo);
  return t > 0.66 ? 'high' : t < 0.33 ? 'low' : 'mid';
}

function compass(file: number, rank: number): string {
  // Board centre is between d/e and ranks 4/5; angle from centre → 8 compass words.
  const dx = file - 3.5;
  const dz = -(rank - 3.5); // rank 8 is north
  const angle = Math.atan2(dx, dz); // 0 = north, clockwise
  const idx = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return COMPASS_WORDS[idx] ?? 'North';
}

export function describeGround(cell: CellFacts, lo: number, hi: number): string {
  const inside = cell.features.filter((f) => f.distanceMeters === 0);
  const h = `${String(Math.round(cell.heightMeters))} m`;
  const has = (k: ThemeFeature['kind']): ThemeFeature | undefined =>
    inside.find((f) => f.kind === k);
  if (has('peak')) return `summit, ${h}`;
  if (has('saddle')) return `pass, ${h}`;
  if (has('ford')) return `ford, ${h}`;
  if (cell.cover === 'water') return `open water, ${h}`;
  if (cell.cover === 'sand') return `tidal sands, ${h}`;
  const band = heightBand(cell.heightMeters, lo, hi);
  const relief = band === 'high' ? 'high ground' : band === 'low' ? 'low ground' : 'slope';
  const water = has('waterway')
    ? has('waterway')?.subtype === 'river'
      ? ', on the river'
      : ', by a stream'
    : '';
  const coast = cell.coastal ? ', on the shore' : '';
  const cover = cell.cover === 'wood' ? 'wooded ' : cell.cover === 'scrub' ? 'open moor, ' : '';
  return `${cover}${relief}${water}${coast}, ${h}`
    .replace('open moor, high ground', 'high moor')
    .replace('open moor, low ground', 'low moor')
    .replace('open moor, slope', 'moorland slope');
}

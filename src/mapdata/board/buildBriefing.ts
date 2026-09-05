// WHAT: A short gazetteer entry for the square of the world being played on:
//       its relief, its water, what grows on it, and what OpenStreetMap
//       remembers of it.
// HOW:  Counts and names things out of the features, the height field and the
//       land cover already fetched for the board. Every line is dropped when
//       there is nothing to say, so an empty moor gets a short entry rather
//       than a padded one, and the closing remark is picked from the numbers.
// WHY:  The board is a real place and the player is never told anything about
//       it beyond its name. This is the cheapest way to say more.
//
//       One hard rule: there is no history here, because there is no source
//       for one. OpenStreetMap records names, `old_name`, `historic=*` and
//       elevation — not dates, and not events. Everything below is counted or
//       quoted from that. The voice is a dry gazetteer's; the facts are the
//       map's. Inventing "founded in 1132" for a real abbey would be a lie
//       told confidently, which is worse than saying nothing.

import type { BoardBounds, BoardPoint } from '@domain/board/types';
import type { CellCover, CoverKind } from '@mapdata/board/classifyCellCover';
import { sampleStats } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import { describeFact, isWorthPrinting } from '@mapdata/history/historyFacts';
import type { HistoryFacts } from '@mapdata/history/WikidataProvider';
import type { MapFeature } from '@mapdata/model/MapFeature';
import { placesByImportance, primaryPlaceName } from '@mapdata/features/primaryPlace';

/** Enough to give a board a past; not so many that the panel becomes a list. */
const MAX_HISTORY_LINES = 4;

export interface BriefingLine {
  readonly label: string;
  readonly text: string;
}

export interface Briefing {
  readonly title: string;
  readonly lines: readonly BriefingLine[];
  /** One closing remark, chosen from the shape of the ground. */
  readonly remark: string;
}

export interface BriefingInputs {
  readonly features: readonly MapFeature[];
  readonly heights: HeightField;
  readonly cover: CellCover;
  readonly bounds: BoardBounds;
  /** What Wikidata records about the features OSM linked to it. Optional. */
  readonly history?: HistoryFacts;
}

export function buildBriefing(inputs: BriefingInputs): Briefing {
  const name = primaryPlaceName(inputs.features);
  const relief = sampleStats(inputs.heights, corners(inputs.bounds));
  const counts = coverCounts(inputs.cover);

  const lines: BriefingLine[] = [];
  const ground = describeRelief(relief.min, relief.max, inputs.features);
  if (ground !== null) lines.push({ label: 'Ground', text: ground });

  const water = describeWater(inputs.features, counts.water);
  if (water !== null) lines.push({ label: 'Water', text: water });

  const cover = describeCover(counts);
  if (cover !== null) lines.push({ label: 'Cover', text: cover });

  const settled = describeSettlement(inputs.features);
  if (settled !== null) lines.push({ label: 'Settled', text: settled });

  const remembered = describeRemembered(inputs.features);
  if (remembered !== null) lines.push({ label: 'Remembered', text: remembered });

  for (const text of describeHistory(inputs.features, inputs.history)) {
    lines.push({ label: 'On record', text });
  }

  return {
    title: name === null ? 'Unnamed ground' : `The field of ${name}`,
    lines,
    remark: remarkFor(relief.max - relief.min, counts, namedThings(inputs.features)),
  };
}

function corners(b: BoardBounds): readonly BoardPoint[] {
  return [
    { x: b.minX, z: b.minZ },
    { x: b.maxX, z: b.minZ },
    { x: b.maxX, z: b.maxZ },
    { x: b.minX, z: b.maxZ },
  ];
}

type Counts = Readonly<Record<CoverKind, number>>;

function coverCounts(cover: CellCover): Counts {
  const counts = { grass: 0, wood: 0, scrub: 0, water: 0, sand: 0 };
  for (const kind of cover.values()) counts[kind] += 1;
  return counts;
}

function describeRelief(min: number, max: number, features: readonly MapFeature[]): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  // Round first, then subtract: "0 m to 21 m, a rise of 22 m" is arithmetic
  // nobody will trust, and it is the sort of thing a reader checks.
  const low = Math.round(min);
  const high = Math.round(max);
  const rise = high - low;
  const top = highestNamedPeak(features);
  const summit = top === null ? '' : `, the top of it ${top.name}`;
  if (rise < 12) {
    return `Barely ${String(rise)} m between the lowest ground and the highest${summit}.`;
  }
  return `${String(low)} m to ${String(high)} m — a rise of ${String(rise)} m${summit}.`;
}

function highestNamedPeak(
  features: readonly MapFeature[],
): { name: string; height: number } | null {
  let best: { name: string; height: number } | null = null;
  for (const f of features) {
    if (f.kind !== 'peak') continue;
    const name = f.names.name ?? f.names.oldName;
    if (name === undefined) continue;
    const height = f.elevationMeters ?? 0;
    if (best === null || height > best.height) best = { name, height };
  }
  return best;
}

function describeWater(features: readonly MapFeature[], seaSquares: number): string | null {
  const named = unique(
    features.filter((f) => f.kind === 'waterway').map((f) => f.names.name ?? f.names.oldName),
  );
  const unnamed = features.filter(
    (f) => f.kind === 'waterway' && (f.names.name ?? f.names.oldName) === undefined,
  ).length;

  const parts: string[] = [];
  if (named.length > 0) parts.push(list(named));
  if (unnamed > 0) {
    parts.push(`${String(unnamed)} ${unnamed === 1 ? 'watercourse' : 'watercourses'} nobody named`);
  }
  if (seaSquares > 0) {
    parts.push(`and the sea over ${String(seaSquares)} ${squares(seaSquares)}`);
  }
  return parts.length === 0 ? null : `${capitalise(parts.join(', '))}.`;
}

function describeCover(counts: Counts): string | null {
  const parts: string[] = [];
  if (counts.wood > 0) parts.push(`${String(counts.wood)} under trees`);
  if (counts.scrub > 0) parts.push(`${String(counts.scrub)} of moor and rough`);
  if (counts.sand > 0) parts.push(`${String(counts.sand)} of tidal sand`);
  if (counts.grass > 0) parts.push(`${String(counts.grass)} of open ground`);
  return parts.length === 0 ? null : `${capitalise(list(parts))}.`;
}

function describeSettlement(features: readonly MapFeature[]): string | null {
  // Ordered by how big a place each one is, so a board is introduced by its
  // village rather than by whichever rock happens to sort first.
  const places = placesByImportance(features.filter((f) => f.kind === 'place'));
  if (places.length === 0) return 'Nobody lives here, as far as the map is aware.';
  if (places.length <= 3) return `${capitalise(list(places))}.`;
  return `${String(places.length)} named places, among them ${list(places.slice(0, 3))}.`;
}

/**
 * Only what the map actually recorded: historic sites, places of worship, and
 * anything still carrying an older name. No dates — nothing here knows any.
 */
function describeRemembered(features: readonly MapFeature[]): string | null {
  const old = unique(
    features
      .filter((f) => f.names.oldName !== undefined || f.names.historicName !== undefined)
      .map((f) => f.names.oldName ?? f.names.historicName),
  );
  const sites = unique(
    features.filter((f) => f.kind === 'historic' || f.kind === 'worship').map((f) => f.names.name),
  );

  const parts: string[] = [];
  if (sites.length > 0) parts.push(list(sites.slice(0, 3)));
  if (old.length > 0) {
    parts.push(`still called ${list(old.slice(0, 2))} by somebody who edited the map`);
  }
  return parts.length === 0 ? null : `${capitalise(parts.join('; '))}.`;
}

/** How many distinct named things the map recorded here — the measure of how much is known. */
function namedThings(features: readonly MapFeature[]): number {
  return unique(features.map((f) => f.names.name ?? f.names.oldName)).length;
}

/**
 * One line per feature Wikidata actually knows something about, newest lookup
 * order irrelevant — sorted by name so the entry is stable between visits.
 * Everything here is a date or a term straight out of a CC0 database; none of
 * it is generated, which is the entire reason this source was chosen.
 */
function describeHistory(
  features: readonly MapFeature[],
  history: HistoryFacts | undefined,
): readonly string[] {
  if (history === undefined || history.size === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const feature of features) {
    const id = feature.wikidata;
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const fact = history.get(id);
    if (fact === undefined || !isWorthPrinting(fact)) continue;
    const detail = describeFact(fact);
    if (detail === null) continue;
    // Wikidata's own label is the fallback; OSM's name is the one on the board.
    const name = feature.names.name ?? fact.label;
    out.push(name === null ? `${capitalise(detail)}.` : `${name} — ${detail}.`);
  }
  return out.sort((a, b) => a.localeCompare(b)).slice(0, MAX_HISTORY_LINES);
}

function remarkFor(rise: number, counts: Counts, named: number): string {
  // Ground, Cover and Settled always say something, so the length of the entry
  // is no guide to how much is actually known. The count of names is.
  if (named === 0) {
    return 'OpenStreetMap has almost nothing to say about this square of the world. The board named it anyway.';
  }
  if (counts.water >= 16) return 'More sea than land. Choose your squares carefully.';
  if (rise >= 400) return 'Whoever takes the high ground here will be very hard to shift.';
  if (rise < 12) return 'Flat as a board, which is convenient. Nowhere at all to hide.';
  if (counts.wood >= 32) return 'Half of it is trees. Knights will enjoy themselves.';
  return 'Good ground for an argument.';
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((v): v is string => v !== undefined && v.length > 0))].sort();
}

/** "a", "a and b", "a, b and c" — the last join is "and", not a comma. */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${String(items[items.length - 1])}`;
}

function squares(n: number): string {
  return n === 1 ? 'square' : 'squares';
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

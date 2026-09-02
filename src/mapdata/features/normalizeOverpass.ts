// WHAT: Raw Overpass JSON → MapFeature[] in board-local metres.
// HOW:  Validates the response shape defensively (Overpass output is not
//       trusted), classifies each element's tags into a FeatureKind, decides
//       point / line / polygon, projects every coordinate through the area's
//       AreaProjection, and collects name variants. Relations (multipolygons)
//       contribute one polygon per outer ring; inner rings are dropped — a
//       board does not need lakes-in-woods precision.
// WHY:  This is the wall between OSM's tagging zoo and the rest of MapChess.
//       Pure, so it is tested against captured real responses.

import type { BoardPoint } from '@domain/board/types';
import type { AreaProjection } from '@mapdata/model/AreaProjection';
import type {
  FeatureGeometry,
  FeatureKind,
  FeatureNames,
  MapFeature,
} from '@mapdata/model/MapFeature';

type Tags = Readonly<Record<string, string>>;

interface RawLatLon {
  readonly lat: number;
  readonly lon: number;
}

interface RawElement {
  readonly type: 'node' | 'way' | 'relation';
  readonly id: number;
  readonly tags?: Tags;
  readonly lat?: number;
  readonly lon?: number;
  readonly geometry?: readonly (RawLatLon | null)[];
  readonly members?: readonly {
    readonly role?: string;
    readonly geometry?: readonly (RawLatLon | null)[];
  }[];
}

export interface OverpassResponse {
  readonly elements: readonly RawElement[];
}

/** Throws TypeError unless `data` has the shape Overpass returns for `[out:json]`. */
export function parseOverpassResponse(data: unknown): OverpassResponse {
  if (typeof data !== 'object' || data === null)
    throw new TypeError('Overpass response is not an object');
  const rec = data as Record<string, unknown>;
  if (typeof rec.remark === 'string' && rec.remark.includes('runtime error')) {
    throw new TypeError(`Overpass: ${rec.remark}`);
  }
  if (!Array.isArray(rec.elements)) throw new TypeError('Overpass response has no elements array');
  const elements: RawElement[] = [];
  for (const e of rec.elements as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const el = e as Record<string, unknown>;
    if (
      (el.type !== 'node' && el.type !== 'way' && el.type !== 'relation') ||
      typeof el.id !== 'number'
    )
      continue;
    elements.push(el as unknown as RawElement);
  }
  return { elements };
}

export function normalizeFeatures(
  response: OverpassResponse,
  projection: AreaProjection,
): MapFeature[] {
  const out: MapFeature[] = [];
  for (const el of response.elements) {
    const tags = el.tags ?? {};
    const classified = classify(tags);
    if (classified === null) continue;
    const { kind, subtype } = classified;

    for (const geometry of geometriesOf(el, kind, projection)) {
      out.push({
        id: `${el.type}/${String(el.id)}`,
        kind,
        subtype,
        geometry,
        names: namesOf(tags),
        elevationMeters: parseElevation(tags.ele),
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------- classify

const WATERWAYS = new Set(['river', 'stream', 'canal', 'drain', 'ditch']);
const SCRUB = new Set(['scrub', 'heath', 'moor', 'wetland', 'grassland']);
const RIDGE = new Set(['ridge', 'arete', 'cliff']);

function classify(tags: Tags): { kind: FeatureKind; subtype: string | null } | null {
  const { waterway, natural, landuse, place, historic, amenity, ford } = tags;
  if (waterway !== undefined && WATERWAYS.has(waterway))
    return { kind: 'waterway', subtype: waterway };
  if (natural === 'water' || landuse === 'reservoir')
    return { kind: 'water', subtype: tags.water ?? landuse ?? null };
  if (natural === 'coastline') return { kind: 'coastline', subtype: null };
  if (natural === 'wood' || landuse === 'forest')
    return { kind: 'wood', subtype: tags.leaf_type ?? null };
  if (natural !== undefined && SCRUB.has(natural)) return { kind: 'scrub', subtype: natural };
  if (natural === 'peak') return { kind: 'peak', subtype: null };
  if (natural === 'saddle') return { kind: 'saddle', subtype: null };
  if (natural !== undefined && RIDGE.has(natural)) return { kind: 'ridge', subtype: natural };
  if (ford !== undefined && ford !== 'no') return { kind: 'ford', subtype: null };
  if (place !== undefined) return { kind: 'place', subtype: place };
  if (historic !== undefined && historic !== 'no') return { kind: 'historic', subtype: historic };
  if (amenity === 'place_of_worship') return { kind: 'worship', subtype: tags.religion ?? null };
  return null;
}

/** Kinds whose closed ways are areas; everything else closed is still a line (a ring road, a coastline loop). */
const AREA_KINDS = new Set<FeatureKind>(['water', 'wood', 'scrub', 'historic', 'worship']);
/** Kinds reported as a single point even when mapped as an area. */
const POINT_KINDS = new Set<FeatureKind>([
  'historic',
  'worship',
  'ford',
  'peak',
  'saddle',
  'place',
]);

// ----------------------------------------------------------------- geometry

function geometriesOf(
  el: RawElement,
  kind: FeatureKind,
  projection: AreaProjection,
): FeatureGeometry[] {
  if (el.type === 'node') {
    if (typeof el.lat !== 'number' || typeof el.lon !== 'number') return [];
    return [{ type: 'point', point: projection.toBoard({ lat: el.lat, lon: el.lon }) }];
  }

  const rings: BoardPoint[][] =
    el.type === 'way'
      ? [projectAll(el.geometry, projection)]
      : (el.members ?? [])
          .filter((m) => m.role === 'outer' || m.role === undefined || m.role === '')
          .map((m) => projectAll(m.geometry, projection));

  const out: FeatureGeometry[] = [];
  for (const pts of rings) {
    if (pts.length < 2) continue;
    const closed = pts.length >= 4 && samePoint(pts[0], pts[pts.length - 1]);
    if (POINT_KINDS.has(kind)) {
      out.push({ type: 'point', point: meanPoint(closed ? pts.slice(0, -1) : pts) });
    } else if (closed && (AREA_KINDS.has(kind) || el.type === 'relation')) {
      out.push({ type: 'polygon', ring: pts.slice(0, -1) });
    } else {
      out.push({ type: 'line', points: pts });
    }
  }
  return out;
}

function projectAll(
  geometry: readonly (RawLatLon | null)[] | undefined,
  projection: AreaProjection,
): BoardPoint[] {
  const out: BoardPoint[] = [];
  for (const g of geometry ?? []) {
    if (g === null || typeof g.lat !== 'number' || typeof g.lon !== 'number') continue;
    out.push(projection.toBoard(g));
  }
  return out;
}

function samePoint(a: BoardPoint | undefined, b: BoardPoint | undefined): boolean {
  return (
    a !== undefined && b !== undefined && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6
  );
}

function meanPoint(pts: readonly BoardPoint[]): BoardPoint {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    z += p.z;
  }
  return { x: x / pts.length, z: z / pts.length };
}

// -------------------------------------------------------------------- names

function namesOf(tags: Tags): FeatureNames {
  const names: { -readonly [K in keyof FeatureNames]?: string } = {};
  const put = (key: keyof FeatureNames, value: string | undefined): void => {
    const v = value?.trim();
    if (v !== undefined && v !== '') names[key] = v;
  };
  put('name', tags.name);
  put('oldName', tags.old_name ?? tags['old_name:en']);
  // Native-language names read as historic in areas where English is the newcomer.
  put(
    'historicName',
    tags['historic:name'] ?? tags['name:gd'] ?? tags['name:cy'] ?? tags['name:ga'],
  );
  put('altName', tags.alt_name ?? tags.loc_name);
  put('etymology', tags['name:etymology']);
  return names;
}

function parseElevation(ele: string | undefined): number | null {
  if (ele === undefined) return null;
  const n = Number.parseFloat(ele.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

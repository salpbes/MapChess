// WHAT: The selected area made concrete: its four corners on the map and the
//       projection that maps everything inside it to the board frame.
// HOW:  Corners are named by their board role, not their compass direction —
//       `sw` is the a1 corner (White's left), `ne` is the h8 corner — because
//       after rotation the board's "south-west" may point anywhere. This is
//       the board-orientation rule (D-007) written as code.
// WHY:  The picker, the elevation fetch (which tiles cover this?), the Overpass
//       bounding box and the debug logging all need the same four corners.

import type { BoardPoint } from '@domain/board/types';

import { AreaProjection } from './AreaProjection';
import { assertValidArea } from './SelectedArea';
import type { LatLon, SelectedArea } from './SelectedArea';

export interface BoardCorners {
  /** a1 corner — White's left. */
  readonly sw: LatLon;
  /** h1 corner — White's right. */
  readonly se: LatLon;
  /** h8 corner — Black's left. */
  readonly ne: LatLon;
  /** a8 corner — Black's right. */
  readonly nw: LatLon;
}

export interface GeoBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
}

export interface MapArea {
  readonly selection: SelectedArea;
  readonly projection: AreaProjection;
  readonly corners: BoardCorners;
  /** Axis-aligned lat/lon box enclosing the (possibly rotated) square. */
  readonly bounds: GeoBounds;
}

export function describeArea(selection: SelectedArea): MapArea {
  assertValidArea(selection);
  const projection = new AreaProjection(selection);
  const half = selection.sizeMeters / 2;

  // Board frame: +X east (files a→h), +Z south (White). SW = (−half, +half).
  const cornerPoints: Record<keyof BoardCorners, BoardPoint> = {
    sw: { x: -half, z: half },
    se: { x: half, z: half },
    ne: { x: half, z: -half },
    nw: { x: -half, z: -half },
  };
  const corners: BoardCorners = {
    sw: projection.fromBoard(cornerPoints.sw),
    se: projection.fromBoard(cornerPoints.se),
    ne: projection.fromBoard(cornerPoints.ne),
    nw: projection.fromBoard(cornerPoints.nw),
  };

  const all = [corners.sw, corners.se, corners.ne, corners.nw];
  const bounds: GeoBounds = {
    minLat: Math.min(...all.map((c) => c.lat)),
    maxLat: Math.max(...all.map((c) => c.lat)),
    minLon: Math.min(...all.map((c) => c.lon)),
    maxLon: Math.max(...all.map((c) => c.lon)),
  };

  return { selection, projection, corners, bounds };
}

/** Lat/lon box around the board grown by `marginMeters` on every side, so edge cells have context. */
export function paddedBounds(area: MapArea, marginMeters: number): GeoBounds {
  const half = area.selection.sizeMeters / 2 + marginMeters;
  const corners = [
    area.projection.fromBoard({ x: -half, z: half }),
    area.projection.fromBoard({ x: half, z: half }),
    area.projection.fromBoard({ x: half, z: -half }),
    area.projection.fromBoard({ x: -half, z: -half }),
  ];
  return {
    minLat: Math.min(...corners.map((c) => c.lat)),
    maxLat: Math.max(...corners.map((c) => c.lat)),
    minLon: Math.min(...corners.map((c) => c.lon)),
    maxLon: Math.max(...corners.map((c) => c.lon)),
  };
}

/** Corner ring in GeoJSON order (closed), starting at a1. */
export function cornerRing(corners: BoardCorners): [number, number][] {
  const first: [number, number] = [corners.sw.lon, corners.sw.lat];
  return [
    first,
    [corners.se.lon, corners.se.lat],
    [corners.ne.lon, corners.ne.lat],
    [corners.nw.lon, corners.nw.lat],
    first,
  ];
}

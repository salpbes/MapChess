// WHAT: Converts between geographic coordinates and board-local metres.
// HOW:  A local tangent-plane (equirectangular) projection centred on the
//       selected area: metres east/north of the centre, then rotated by the
//       area's bearing into the board frame. Board frame is three.js Y-up
//       (D-007/D-008): +X is the board's east (file h side), +Z is the board's
//       south (White's side), so z = −north. Accurate to well under a metre
//       over a few kilometres, which is all a board ever spans.
// WHY:  This is the one place the axis convention is applied. Elevation
//       samples, OSM features and cell polygons all pass through here and come
//       out in the same frame, so no other layer ever thinks about latitude.

import type { BoardPoint } from '@domain/board/types';

import type { LatLon, SelectedArea } from './SelectedArea';

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

export interface LocalMeters {
  readonly east: number;
  readonly north: number;
}

export class AreaProjection {
  private readonly lat0: number;
  private readonly lon0: number;
  private readonly metersPerDegLat: number;
  private readonly metersPerDegLon: number;
  private readonly cosBearing: number;
  private readonly sinBearing: number;

  public constructor(public readonly area: SelectedArea) {
    this.lat0 = area.centerLat;
    this.lon0 = area.centerLon;
    this.metersPerDegLat = EARTH_RADIUS_M * DEG;
    this.metersPerDegLon = EARTH_RADIUS_M * DEG * Math.cos(area.centerLat * DEG);
    const bearing = area.rotationDeg * DEG;
    this.cosBearing = Math.cos(bearing);
    this.sinBearing = Math.sin(bearing);
  }

  public toLocal(p: LatLon): LocalMeters {
    return {
      east: wrapLonDelta(p.lon - this.lon0) * this.metersPerDegLon,
      north: (p.lat - this.lat0) * this.metersPerDegLat,
    };
  }

  public fromLocal(m: LocalMeters): LatLon {
    return {
      lat: this.lat0 + m.north / this.metersPerDegLat,
      lon: this.lon0 + m.east / this.metersPerDegLon,
    };
  }

  /** Rotates ENU metres into the board frame: board-north points along the bearing. */
  public localToBoard(m: LocalMeters): BoardPoint {
    const boardEast = m.east * this.cosBearing - m.north * this.sinBearing;
    const boardNorth = m.east * this.sinBearing + m.north * this.cosBearing;
    return { x: boardEast, z: -boardNorth };
  }

  public boardToLocal(p: BoardPoint): LocalMeters {
    const boardEast = p.x;
    const boardNorth = -p.z;
    return {
      east: boardEast * this.cosBearing + boardNorth * this.sinBearing,
      north: -boardEast * this.sinBearing + boardNorth * this.cosBearing,
    };
  }

  public toBoard(p: LatLon): BoardPoint {
    return this.localToBoard(this.toLocal(p));
  }

  public fromBoard(p: BoardPoint): LatLon {
    return this.fromLocal(this.boardToLocal(p));
  }
}

/** Keeps longitude differences in (−180, 180] so areas near the antimeridian project sanely. */
function wrapLonDelta(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
}

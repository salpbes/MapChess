// WHAT: Place-name labels floating over the board.
// HOW:  Picks the most important named point features inside the board
//       (settlements, peaks, historic sites), at most one per cell, at most a
//       fixed total. Each becomes a flat plane lying on the cell's platform,
//       turned to face straight up and squared to the board so the text runs
//       along the ranks. Importance follows the same priority order the lattice
//       uses. Long names wrap so a label never outgrows the cell it names.
// WHY:  BUILD_PLAN Phase 9 — "place-name labels over their cells". Capping the
//       count keeps the board readable, and the text is haloed rather than set
//       on a filled pill: a pill blanks out a rectangle of landscape per label,
//       and ten rectangles is a lot of board to lose for ten short words. A
//       marker glyph and a colour per kind of place turn the set into a small
//       legend — a triangle on a summit, a dot on a village — which is both
//       easier to read at a glance and quicker to ignore when you are playing.
//       Each place is built twice — once as "▲ Ashberry Hill", once as a bare
//       "▲" — into two sibling groups, so the scene can show names, markers
//       alone, or nothing without rebuilding anything. Every label records the
//       square it belongs to, so the scene can reveal one name on hover and
//       hide the marker it duplicates — the name expands in place, exactly
//       where the marker was. Both draw over the scene rather than being
//       occluded by it.

import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { containsPoint } from '@domain/board/polygon';
import type { Square } from '@domain/board/Square';
import type { MapFeature } from '@mapdata/model/MapFeature';

import { makeTextTexture } from './textSprite';
import type { TextSpriteOptions } from './textSprite';

const PRIORITY: Readonly<Record<string, number>> = {
  peak: 100,
  city: 95,
  town: 90,
  village: 80,
  saddle: 70,
  hamlet: 60,
  historic: 50,
  locality: 40,
  isolated_dwelling: 30,
  farm: 25,
  worship: 20,
};

const MAX_LABELS = 10;
/** Haloed text covers little, so it can be near-solid and still stay out of the way. */
const LABEL_OPACITY = 0.94;
/** Clear of the platform top and its outline, well under piece height. */
const LIFT = 1.2;
/** Above everything else the scene draws. */
const LABEL_RENDER_ORDER = 10;
/** Wrap width in canvas pixels, at the default 56 px font. */
const WRAP_PX = 560;

/** What each kind of place looks like: a marker glyph and the colour of its name. */
interface Marker {
  readonly glyph: string;
  readonly color: string;
}
const HIGH_GROUND: Marker = { glyph: '▲', color: '#ffd9a0' };
const SETTLEMENT: Marker = { glyph: '●', color: '#f4efe4' };
const OLD_PLACE: Marker = { glyph: '◆', color: '#bcd8ff' };

// Geometric markers rather than pictograms: the boards these run on span
// countries and faiths, and a triangle means the same thing everywhere.
const MARKER: Readonly<Record<string, Marker>> = {
  peak: HIGH_GROUND,
  saddle: HIGH_GROUND,
  city: SETTLEMENT,
  town: SETTLEMENT,
  village: SETTLEMENT,
  hamlet: SETTLEMENT,
  locality: SETTLEMENT,
  isolated_dwelling: SETTLEMENT,
  farm: SETTLEMENT,
  historic: OLD_PLACE,
  worship: OLD_PLACE,
};

/** The three ways the board can be annotated, weakest first. */
export type LabelMode = 'off' | 'markers' | 'names';

export class LabelBuilder {
  public build(layout: IBoardLayout, features: readonly MapFeature[]): Group {
    const group = new Group();
    group.name = 'labels';
    const names = new Group();
    names.name = 'labels-names';
    const markers = new Group();
    markers.name = 'labels-markers';
    group.add(names, markers);
    const width = layout.bounds.maxX - layout.bounds.minX;
    const height = width * 0.022;

    const candidates: {
      name: string;
      marker: Marker;
      priority: number;
      square: Square;
      /** The feature's own position: both the marker and the name sit here. */
      x: number;
      z: number;
      y: number;
    }[] = [];
    for (const f of features) {
      if (f.geometry.type !== 'point') continue;
      const name = f.names.name ?? f.names.oldName;
      if (name === undefined) continue;
      const key = f.kind === 'place' ? (f.subtype ?? 'locality') : f.kind;
      const priority = PRIORITY[key];
      if (priority === undefined) continue;
      const cell = layout.cells.find((c) =>
        containsPoint(c.polygon, f.geometry.type === 'point' ? f.geometry.point : c.centroid),
      );
      if (cell === undefined) continue;
      candidates.push({
        name,
        marker: MARKER[key] ?? SETTLEMENT,
        priority,
        square: cell.square,
        x: f.geometry.point.x,
        z: f.geometry.point.z,
        y: cell.platformY,
      });
    }

    candidates.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
    const taken = new Set<Square>();
    for (const c of candidates) {
      if (taken.has(c.square)) continue;
      taken.add(c.square);
      const named = flatLabel(`${c.marker.glyph} ${c.name}`, height, {
        opacity: LABEL_OPACITY,
        outlined: true,
        color: c.marker.color,
        // Two-thirds of a cell: wide enough to read, narrow enough to belong.
        wrapPx: WRAP_PX,
      });
      // Same point as its marker: hovering expands the glyph into the full
      // name in place, rather than making the eye jump across the cell.
      named.position.set(c.x, c.y + LIFT, c.z);
      named.userData.square = c.square;
      names.add(named);

      // The marker alone says "something is here" without asking to be read,
      // so it can stay on while you play.
      const marker = flatLabel(c.marker.glyph, height * 0.9, {
        opacity: LABEL_OPACITY,
        outlined: true,
        color: c.marker.color,
      });
      marker.position.set(c.x, c.y + LIFT, c.z);
      marker.userData.square = c.square;
      markers.add(marker);

      if (taken.size >= MAX_LABELS) break;
    }
    return group;
  }
}

/**
 * A label lying on the ground: a plane turned face-up and squared to the board,
 * so the text reads along the ranks from White's side. Lifted a hair above the
 * platform to clear the cell's own top face and its outline.
 */
function flatLabel(text: string, heightMeters: number, options: LabelStyle): Mesh {
  const { texture, aspect } = makeTextTexture(text, { heightMeters, ...options });
  const geometry = new PlaneGeometry(heightMeters * aspect, heightMeters);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: options.opacity ?? 1,
      depthWrite: false,
      /*
        Drawn over the scene rather than into it. A label lies on the ground at
        the exact spot a piece stands, so honest depth means the label you most
        want to read is the one hidden — and these are annotations on the map,
        not objects in the world.
      */
      depthTest: false,
      // Visible from underneath too: the camera can drop near the horizon.
      side: DoubleSide,
    }),
  );
  // After the board and the pieces, so "over the scene" is over all of it.
  mesh.renderOrder = LABEL_RENDER_ORDER;
  return mesh;
}

type LabelStyle = Omit<TextSpriteOptions, 'heightMeters'>;

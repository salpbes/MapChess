// WHAT: Place-name labels floating over the board.
// HOW:  Picks the most important named point features inside the board
//       (settlements, peaks, historic sites), at most one per cell, at most a
//       fixed total, and places a text sprite over each at its platform height.
//       Importance follows the same priority order the lattice uses.
// WHY:  BUILD_PLAN Phase 9 — "place-name labels over their cells". Capping the
//       count keeps the board readable; Phase 10 will replace "one label per
//       feature" with "one identity per cell".

import { Group } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { containsPoint } from '@domain/board/polygon';
import type { Square } from '@domain/board/Square';
import type { MapFeature } from '@mapdata/model/MapFeature';

import { makeTextSprite } from './textSprite';

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

const MAX_LABELS = 16;

export class LabelBuilder {
  public build(layout: IBoardLayout, features: readonly MapFeature[]): Group {
    const group = new Group();
    group.name = 'labels';
    const width = layout.bounds.maxX - layout.bounds.minX;
    const height = width * 0.028;

    const candidates: {
      name: string;
      priority: number;
      square: Square;
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
      const sprite = makeTextSprite(c.name, { heightMeters: height });
      sprite.position.set(c.x, c.y + height * 2.2, c.z);
      group.add(sprite);
      if (taken.size >= MAX_LABELS) break;
    }
    return group;
  }
}

// WHAT: Debug overlay for the warped board: file/rank labels on every cell,
//       river/coast polylines and peak/place markers drawn in the same frame.
// HOW:  Labels are small canvas-texture sprites at each centroid; lines are
//       LineSegments lifted a hair above the platforms; points are small
//       spheres. Everything sits in one Group that can be toggled.
// WHY:  BUILD_PLAN Phase 8 "done when": a debug overlay shows the 64 cells
//       with labels, rivers running along cell edges, and hills sitting inside
//       cells. Seeing it is how the attraction weights get tuned.

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { containsPoint } from '@domain/board/polygon';
import type { TerrainInputs } from '@domain/board/TerrainInputs';
import type { BoardPoint } from '@domain/board/types';

import { makeTextSprite } from './textSprite';

export interface DebugOverlayOptions {
  readonly labels: boolean;
  readonly features: boolean;
}

export class DebugOverlayBuilder {
  public build(
    layout: IBoardLayout,
    terrain: TerrainInputs | null,
    options: DebugOverlayOptions,
  ): Group {
    const group = new Group();
    group.name = 'debug-overlay';
    const width = layout.bounds.maxX - layout.bounds.minX;
    const lift = width * 0.004;

    if (options.labels) group.add(this.labels(layout, width));
    if (options.features && terrain !== null) {
      group.add(this.lines(layout, terrain, lift));
      group.add(this.points(layout, terrain, width, lift));
    }
    return group;
  }

  private labels(layout: IBoardLayout, width: number): Group {
    const g = new Group();
    g.name = 'labels';
    const size = width * 0.03;
    for (const cell of layout.cells) {
      const sprite = makeTextSprite(cell.square, { heightMeters: size, depthTest: false });
      sprite.position.set(cell.centroid.x, cell.platformY + size * 0.8, cell.centroid.z);
      g.add(sprite);
    }
    return g;
  }

  private lines(layout: IBoardLayout, terrain: TerrainInputs, lift: number): LineSegments {
    const positions: number[] = [];
    const colors: number[] = [];
    const heightAt = heightLookup(layout);
    for (const line of terrain.lines) {
      const c = new Color().setHSL(0.58, 0.9, 0.35 + 0.35 * line.weight);
      for (let i = 0; i + 1 < line.points.length; i += 1) {
        const a = line.points[i];
        const b = line.points[i + 1];
        if (a === undefined || b === undefined) continue;
        positions.push(a.x, heightAt(a) + lift, a.z, b.x, heightAt(b) + lift, b.z);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const lines = new LineSegments(
      geometry,
      new LineBasicMaterial({ vertexColors: true, depthTest: false }),
    );
    lines.name = 'feature-lines';
    return lines;
  }

  private points(layout: IBoardLayout, terrain: TerrainInputs, width: number, lift: number): Group {
    const g = new Group();
    g.name = 'feature-points';
    const heightAt = heightLookup(layout);
    const geometry = new SphereGeometry(width * 0.006, 8, 6);
    const peak = new MeshBasicMaterial({ color: 0xff7a3d });
    const place = new MeshBasicMaterial({ color: 0xffd447 });
    for (const p of terrain.points) {
      const mesh = new Mesh(geometry, p.priority >= 100 ? peak : place);
      mesh.position.set(p.point.x, heightAt(p.point) + lift, p.point.z);
      g.add(mesh);
    }
    return g;
  }
}

/** Height of the platform under a point (cells are level), so overlays sit on the terraces. */
function heightLookup(layout: IBoardLayout): (p: BoardPoint) => number {
  return (p) => {
    for (const cell of layout.cells) {
      if (containsPoint(cell.polygon, p)) return cell.platformY;
    }
    return layout.bounds.maxY;
  };
}

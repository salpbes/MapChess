// WHAT: A one-line summary of the currently selected area with a button to
//       change it; owns the AreaPicker's lifecycle and logs the result.
// HOW:  Holds the current SelectedArea. "Choose area…" opens an AreaPicker;
//       confirm stores the new area, calls back, and prints a full report
//       (centre, rotation, four board corners) to the console.
// WHY:  BUILD_PLAN Phase 5 "done when": search, position, confirm, and see the
//       coordinates and derived corners logged. Phase 8 reads the same area
//       to build the warped board; Phase 11 saves it with the game.

import type { IGeocoder } from '@mapdata/geocode/NominatimGeocoder';
import { describeArea } from '@mapdata/model/MapArea';
import type { MapArea } from '@mapdata/model/MapArea';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

import { AreaPicker } from './AreaPicker';

export interface AreaBarDeps {
  readonly geocoder: IGeocoder;
  readonly styleUrl: string;
  readonly onAreaChanged: (area: SelectedArea) => void;
}

export class AreaBar {
  private readonly el: HTMLDivElement;
  private readonly summary: HTMLSpanElement;
  private picker: AreaPicker | null = null;

  public constructor(
    private readonly container: HTMLElement,
    private area: SelectedArea,
    private readonly deps: AreaBarDeps,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'area-bar';
    this.summary = document.createElement('span');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Choose area…';
    button.addEventListener('click', () => {
      this.open();
    });
    this.el.append(this.summary, button);
    container.appendChild(this.el);
    this.render();
  }

  public get current(): SelectedArea {
    return this.area;
  }

  public dispose(): void {
    this.picker?.dispose();
    this.el.remove();
  }

  private open(): void {
    if (this.picker !== null) return;
    this.picker = new AreaPicker(
      this.container,
      {
        geocoder: this.deps.geocoder,
        styleUrl: this.deps.styleUrl,
        sizeMeters: this.area.sizeMeters,
        onConfirm: (area) => {
          this.close();
          this.area = area;
          this.render();
          const described = describeArea(area);
          console.info(formatAreaReport(described));
          this.deps.onAreaChanged(area);
        },
        onCancel: () => {
          this.close();
        },
      },
      this.area,
    );
  }

  private close(): void {
    this.picker?.dispose();
    this.picker = null;
  }

  private render(): void {
    const a = this.area;
    this.summary.textContent = `Area ${a.centerLat.toFixed(4)}, ${a.centerLon.toFixed(4)} · ${String(
      a.sizeMeters / 1000,
    )} km · ${String(Math.round(a.rotationDeg))}°`;
  }
}

export function formatAreaReport(area: MapArea): string {
  const s = area.selection;
  const c = area.corners;
  const fmt = (p: { lat: number; lon: number }): string =>
    `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  return [
    `MapChess area selected`,
    `  centre    ${fmt({ lat: s.centerLat, lon: s.centerLon })}`,
    `  size      ${String(s.sizeMeters)} m per side`,
    `  rotation  ${String(s.rotationDeg)}° (bearing of the board's north edge)`,
    `  a1 corner ${fmt(c.sw)}   (White's left)`,
    `  h1 corner ${fmt(c.se)}   (White's right)`,
    `  h8 corner ${fmt(c.ne)}`,
    `  a8 corner ${fmt(c.nw)}`,
    `  bbox      lat ${area.bounds.minLat.toFixed(6)}…${area.bounds.maxLat.toFixed(6)}, lon ${area.bounds.minLon.toFixed(6)}…${area.bounds.maxLon.toFixed(6)}`,
  ].join('\n');
}

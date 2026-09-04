// WHAT: A one-line summary of the currently selected area with a button to
//       change it; owns the AreaPicker's lifecycle and logs the result.
// HOW:  Holds the current SelectedArea. "Choose area…" opens an AreaPicker;
//       confirm stores the new area, calls back, and prints a full report
//       (centre, rotation, four board corners) to the console.
// WHY:  BUILD_PLAN Phase 5 "done when": search, position, confirm, and see the
//       coordinates and derived corners logged. Phase 8 reads the same area
//       to build the warped board; Phase 11 saves it with the game, and
//       reopens the picker from the menu.

import type { IGeocoder } from '@mapdata/geocode/NominatimGeocoder';
import { describeArea } from '@mapdata/model/MapArea';
import type { MapArea } from '@mapdata/model/MapArea';
import type { FixtureAreaDef } from '@mapdata/model/fixtureAreas';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

import { AreaPicker } from './AreaPicker';

export interface AreaBarDeps {
  readonly geocoder: IGeocoder;
  readonly styleUrl: string;
  readonly onAreaChanged: (area: SelectedArea) => void;
  /** Offline areas offered in a dropdown for instant switching. */
  readonly presets?: readonly FixtureAreaDef[];
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
      this.openPicker();
    });
    this.el.append(this.summary);
    if (deps.presets !== undefined && deps.presets.length > 0) {
      this.el.appendChild(this.presetSelect(deps.presets));
    }
    this.el.appendChild(button);
    container.appendChild(this.el);
    this.render();
  }

  public get current(): SelectedArea {
    return this.area;
  }

  /** The one-line description shown in the bar, for the menu to echo. */
  public get label(): string {
    return describeSelection(this.area);
  }

  /**
   * Moves the bar to an area chosen elsewhere — resuming a saved game — without
   * announcing a change the caller is already handling.
   */
  public setArea(area: SelectedArea): void {
    this.area = area;
    this.render();
  }

  /** Opens the map picker, as the "Choose area…" button does. */
  public open(): void {
    this.openPicker();
  }

  public dispose(): void {
    this.picker?.dispose();
    this.el.remove();
  }

  private openPicker(): void {
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

  private presetSelect(presets: readonly FixtureAreaDef[]): HTMLSelectElement {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Offline example areas');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Example areas…';
    select.appendChild(placeholder);
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name.charAt(0).toUpperCase() + p.name.slice(1);
      opt.title = p.description;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const chosen = presets.find((p) => p.name === select.value);
      select.value = '';
      if (chosen === undefined) return;
      this.area = chosen.area;
      this.render();
      this.deps.onAreaChanged(chosen.area);
    });
    return select;
  }

  private render(): void {
    this.summary.textContent = `Area ${describeSelection(this.area)}`;
  }
}

function describeSelection(a: SelectedArea): string {
  return `${a.centerLat.toFixed(4)}, ${a.centerLon.toFixed(4)} · ${String(
    a.sizeMeters / 1000,
  )} km · ${String(Math.round(a.rotationDeg))}°`;
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

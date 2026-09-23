// WHAT: A one-line summary of the currently selected area with a button to
//       change it; owns the AreaPicker's lifecycle and logs the result.
// HOW:  Holds the current SelectedArea. A map button opens an AreaPicker; a
//       star button drops a short list of the offline example areas —
//       a list of its own rather than a `<select>`, because a native select is
//       obliged to show its text and these are icon buttons. Confirming a new
//       area stores it, calls back, and prints a full report (centre, rotation,
//       four board corners) to the console.
// WHY:  BUILD_PLAN Phase 5 "done when": search, position, confirm, and see the
//       coordinates and derived corners logged. Phase 8 reads the same area
//       to build the warped board; Phase 11 saves it with the game, and
//       reopens the picker from the menu.

import type { IGeocoder } from '@mapdata/geocode/NominatimGeocoder';
import { describeArea } from '@mapdata/model/MapArea';
import type { MapArea } from '@mapdata/model/MapArea';
import type { CuratedPlace, PlaceGroup } from '@app/curatedPlaces';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

// Type-only: the value import is deferred, so MapLibre stays out of the
// initial bundle. It is a third of the download and is needed only if the
// player opens the picker.
import type { AreaPicker } from './AreaPicker';

type AreaPickerConstructor = typeof AreaPicker;
import { iconButton } from './icons';

/**
 * The summary reads as part of the place, so it is printed on the briefing
 * paper; the buttons that change the place stay in the control dock.
 */
export interface AreaBarSlots {
  readonly summary: HTMLElement;
  readonly buttons: HTMLElement;
}

export interface AreaBarDeps {
  readonly geocoder: IGeocoder;
  readonly styleUrl: string;
  /**
   * Where the full-screen picker is mounted. Not this bar's own container: the
   * bar is a row inside the control dock, and a picker parented there would be
   * laid out inside the dock rather than over the whole window.
   */
  readonly pickerHost: HTMLElement;
  readonly onAreaChanged: (area: SelectedArea) => void;
  /** Places offered by name, in their sections, so a player never faces an empty map. */
  readonly presets?: readonly PlaceGroup[];
}

export class AreaBar {
  private readonly el: HTMLDivElement;
  private readonly summary: HTMLSpanElement;
  private picker: AreaPicker | null = null;
  private opening = false;
  private closePresets: (() => void) | null = null;
  private showPresets: (() => void) | null = null;

  public constructor(
    slots: AreaBarSlots,
    private area: SelectedArea,
    private readonly deps: AreaBarDeps,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'area-bar';
    this.summary = document.createElement('span');
    this.summary.className = 'area-bar__summary';
    slots.summary.appendChild(this.summary);
    if (deps.presets !== undefined && deps.presets.length > 0) {
      this.el.appendChild(this.presetPicker(deps.presets));
    }
    this.el.appendChild(
      iconButton('map', 'Choose a place on the map', 'area-bar__button', () => {
        void this.openPicker();
      }),
    );
    slots.buttons.appendChild(this.el);
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

  /** Opens the map picker, as the map button does. */
  /** True while the picker is up and owns the keyboard. */
  /**
   * Opens the list of places from somewhere else — the menu, which is where a
   * player who has never seen this game actually is.
   *
   * The same list, not a second copy of it: this app has already shipped a
   * phone layout that offered the same control twice, and one list with two
   * doors is the lesson from it.
   */
  public openPresets(): void {
    this.showPresets?.();
  }

  public get isPickerOpen(): boolean {
    return this.picker !== null;
  }

  public open(): void {
    void this.openPicker();
  }

  public dispose(): void {
    this.closePresets?.();
    this.picker?.dispose();
    this.summary.remove();
    this.el.remove();
  }

  private async openPicker(): Promise<void> {
    // `opening` as well as `picker`: the module takes a moment to arrive and a
    // second click in that moment would build two pickers.
    if (this.picker !== null || this.opening) return;
    this.opening = true;
    let build: AreaPickerConstructor;
    try {
      build = (await import('./AreaPicker')).AreaPicker;
    } catch (error: unknown) {
      console.error('Could not load the map picker.', error);
      return;
    } finally {
      this.opening = false;
    }

    this.picker = new build(
      this.deps.pickerHost,
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

  /**
   * A star button and a short list under it. Closes on a choice, on Escape, or
   * on a click anywhere else — the three ways anyone expects a menu to close.
   */
  private presetPicker(groups: readonly PlaceGroup[]): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'area-bar__presets';

    const list = document.createElement('div');
    list.className = 'area-bar__list';
    list.hidden = true;

    const close = (): void => {
      list.hidden = true;
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
    };
    const onOutside = (event: PointerEvent): void => {
      if (!wrap.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    this.closePresets = close;

    /*
      In sections, by era. Fifteen places in one run is a list you read; five
      short sections is one you scan — a player who wants the Somme looks for
      "First World War", not for a name they may not know yet. Each section is a
      labelled group so a screen reader announces where in the list it is.
    */
    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'area-bar__list-group';
      section.setAttribute('role', 'group');
      const heading = document.createElement('div');
      heading.className = 'area-bar__list-heading';
      heading.id = `area-bar-era-${group.era}`;
      heading.textContent = group.label;
      section.setAttribute('aria-labelledby', heading.id);
      section.appendChild(heading);
      for (const preset of group.places) section.appendChild(this.presetRow(preset, close));
      list.appendChild(section);
    }

    const show = (): void => {
      list.hidden = false;
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    };
    this.showPresets = show;

    const open = iconButton('star', 'Famous fields', 'area-bar__button', () => {
      if (!list.hidden) {
        close();
        return;
      }
      show();
    });

    wrap.append(open, list);
    return wrap;
  }

  /**
   * A name and the ground under it. This was one lowercase word per row, which
   * is fine for three test fixtures and useless for a list somebody is meant to
   * choose from: "morgarten" tells a player nothing, and the reason to go there
   * is the slope, not the spelling.
   */
  private presetRow(preset: CuratedPlace, close: () => void): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'area-bar__list-item';
    const name = document.createElement('span');
    name.className = 'area-bar__list-name';
    name.textContent = preset.name;
    const blurb = document.createElement('span');
    blurb.className = 'area-bar__list-blurb';
    blurb.textContent = preset.blurb;
    row.append(name, blurb);
    row.addEventListener('click', () => {
      close();
      this.area = preset.area;
      this.render();
      this.deps.onAreaChanged(preset.area);
    });
    return row;
  }

  private render(): void {
    this.summary.textContent = describeSelection(this.area);
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

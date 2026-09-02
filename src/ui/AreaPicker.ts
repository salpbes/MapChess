// WHAT: The 2D map picker: search a place, drag and rotate a fixed-size square,
//       confirm to produce a SelectedArea.
// HOW:  A full-screen overlay with a MapLibre map. The square is a GeoJSON
//       polygon rebuilt from `describeArea()` on every change, so what you see
//       is exactly the board footprint the rest of the app will use; its
//       south edge (White's back rank) is drawn heavier and lighter. Dragging
//       inside the square moves it; dragging outside pans the map; a slider
//       rotates it. Search goes through IGeocoder.
// WHY:  BUILD_PLAN Phase 5. Reusing describeArea() for the overlay guarantees
//       the picker and the game agree on where the board is — there is no
//       second copy of the geometry to drift.

import 'maplibre-gl/dist/maplibre-gl.css';

import type { FeatureCollection } from 'geojson';
import {
  MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl';
// Vite bundles the worker (and its shared chunk) and returns a stable URL. MapLibre's
// own `new URL('./maplibre-gl-worker.mjs', import.meta.url)` lookup breaks under both
// dev pre-bundling and production bundling (D-019).
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

import type { IGeocoder, PlaceResult } from '@mapdata/geocode/NominatimGeocoder';
import { cornerRing, describeArea } from '@mapdata/model/MapArea';
import { NetworkError } from '@mapdata/net/fetchJson';
import { normaliseBearing } from '@mapdata/model/SelectedArea';
import type { LatLon, SelectedArea } from '@mapdata/model/SelectedArea';

export interface AreaPickerDeps {
  readonly geocoder: IGeocoder;
  readonly styleUrl: string;
  readonly sizeMeters: number;
  readonly onConfirm: (area: SelectedArea) => void;
  readonly onCancel: () => void;
}

const SOURCE_ID = 'mapchess-area';
const FILL_LAYER = 'mapchess-area-fill';
const OUTLINE_LAYER = 'mapchess-area-outline';
const WHITE_EDGE_LAYER = 'mapchess-area-white-edge';

export class AreaPicker {
  private readonly root: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private readonly results: HTMLUListElement;
  private readonly rotation: HTMLInputElement;
  private readonly rotationLabel: HTMLSpanElement;
  private readonly searchInput: HTMLInputElement;
  private readonly map: MapLibreMap;

  private center: LatLon;
  private rotationDeg: number;
  private searchAbort: AbortController | null = null;
  private disposed = false;

  public constructor(
    container: HTMLElement,
    private readonly deps: AreaPickerDeps,
    initial: SelectedArea,
  ) {
    this.center = { lat: initial.centerLat, lon: initial.centerLon };
    this.rotationDeg = normaliseBearing(initial.rotationDeg);

    this.root = el('div', 'area-picker');
    const mapEl = el('div', 'area-picker__map');
    const panel = el('div', 'area-picker__panel');

    // --- search ---
    const searchRow = el('form', 'area-picker__row');
    this.searchInput = el('input', 'area-picker__search');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search a place…';
    this.searchInput.setAttribute('aria-label', 'Search a place');
    const searchButton = el('button', 'area-picker__button');
    searchButton.type = 'submit';
    searchButton.textContent = 'Search';
    searchRow.append(this.searchInput, searchButton);
    searchRow.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.search(this.searchInput.value);
    });
    this.results = el('ul', 'area-picker__results');

    // --- rotation ---
    const rotRow = el('div', 'area-picker__row');
    const rotLabel = el('label', 'area-picker__label');
    rotLabel.textContent = 'Rotate';
    this.rotation = el('input', 'area-picker__rotation');
    this.rotation.type = 'range';
    this.rotation.min = '0';
    this.rotation.max = '359';
    this.rotation.step = '1';
    this.rotation.value = String(Math.round(this.rotationDeg));
    this.rotation.setAttribute('aria-label', 'Board rotation in degrees');
    this.rotationLabel = el('span', 'area-picker__value');
    this.rotation.addEventListener('input', () => {
      this.rotationDeg = Number(this.rotation.value);
      this.redraw();
    });
    rotRow.append(rotLabel, this.rotation, this.rotationLabel);

    // --- readout + actions ---
    this.readout = el('div', 'area-picker__readout');
    const actions = el('div', 'area-picker__row area-picker__actions');
    const cancel = el('button', 'area-picker__button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      this.deps.onCancel();
    });
    const confirm = el('button', 'area-picker__button area-picker__button--primary');
    confirm.type = 'button';
    confirm.textContent = 'Use this area';
    confirm.addEventListener('click', () => {
      this.deps.onConfirm(this.currentArea());
    });
    actions.append(cancel, confirm);

    const hint = el('div', 'area-picker__hint');
    hint.textContent =
      'Drag the square to move it, drag the map to pan, scroll to zoom. The bright edge is White’s side.';

    panel.append(searchRow, this.results, rotRow, this.readout, hint, actions);
    this.root.append(mapEl, panel);
    container.appendChild(this.root);
    document.addEventListener('keydown', this.onKey);

    this.map = new MapLibreMap({
      container: mapEl,
      style: deps.styleUrl,
      center: [this.center.lon, this.center.lat],
      zoom: 13,
      attributionControl: { compact: false },
    });
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('load', () => {
      this.installLayers();
      this.fitToSquare();
    });
    this.map.on('error', (e) => {
      console.error('Map error:', e.error);
      this.showResults([], `Map problem: ${e.error.message}`);
    });

    this.redraw();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('keydown', this.onKey);
    this.searchAbort?.abort();
    this.map.remove();
    this.root.remove();
  }

  private currentArea(): SelectedArea {
    return {
      centerLat: this.center.lat,
      centerLon: this.center.lon,
      sizeMeters: this.deps.sizeMeters,
      rotationDeg: this.rotationDeg,
    };
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.deps.onCancel();
  };

  // ---------------------------------------------------------------- map layers

  private installLayers(): void {
    this.map.addSource(SOURCE_ID, { type: 'geojson', data: this.geojson() });
    this.map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'square'],
      paint: { 'fill-color': '#ffd447', 'fill-opacity': 0.18 },
    });
    this.map.addLayer({
      id: OUTLINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'square'],
      paint: { 'line-color': '#ffd447', 'line-width': 2 },
    });
    this.map.addLayer({
      id: WHITE_EDGE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'white-edge'],
      paint: { 'line-color': '#ffffff', 'line-width': 6 },
    });

    // Drag the square by its fill; pan the map everywhere else.
    let grabOffset: { dLon: number; dLat: number } | null = null;
    const onMove = (e: MapMouseEvent): void => {
      if (grabOffset === null) return;
      this.center = { lat: e.lngLat.lat + grabOffset.dLat, lon: e.lngLat.lng + grabOffset.dLon };
      this.redraw();
    };
    const onUp = (): void => {
      grabOffset = null;
      this.map.dragPan.enable();
      this.map.off('mousemove', onMove);
      this.map.getCanvas().style.cursor = '';
    };
    this.map.on('mousedown', FILL_LAYER, (e: MapLayerMouseEvent) => {
      e.preventDefault();
      grabOffset = { dLon: this.center.lon - e.lngLat.lng, dLat: this.center.lat - e.lngLat.lat };
      this.map.dragPan.disable();
      this.map.getCanvas().style.cursor = 'grabbing';
      this.map.on('mousemove', onMove);
      this.map.once('mouseup', onUp);
    });
    this.map.on('mouseenter', FILL_LAYER, () => {
      if (grabOffset === null) this.map.getCanvas().style.cursor = 'move';
    });
    this.map.on('mouseleave', FILL_LAYER, () => {
      if (grabOffset === null) this.map.getCanvas().style.cursor = '';
    });
  }

  private geojson(): FeatureCollection {
    const { corners } = describeArea(this.currentArea());
    const ring = cornerRing(corners);
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'square' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { kind: 'white-edge' },
          // a1 → h1: White's back rank.
          geometry: { type: 'LineString', coordinates: [ring[0] ?? [0, 0], ring[1] ?? [0, 0]] },
        },
      ],
    };
  }

  private redraw(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_ID);
    if (source !== undefined) void source.setData(this.geojson());
    this.rotationLabel.textContent = `${String(Math.round(this.rotationDeg))}°`;
    this.readout.textContent = `${this.center.lat.toFixed(5)}, ${this.center.lon.toFixed(5)} · ${String(
      this.deps.sizeMeters / 1000,
    )} km · ${String(Math.round(this.rotationDeg))}°`;
  }

  private fitToSquare(): void {
    const { bounds } = describeArea(this.currentArea());
    this.map.fitBounds(
      [
        [bounds.minLon, bounds.minLat],
        [bounds.maxLon, bounds.maxLat],
      ],
      { padding: 80, duration: 600 },
    );
  }

  // ------------------------------------------------------------------- search

  private async search(query: string): Promise<void> {
    this.searchAbort?.abort();
    const abort = new AbortController();
    this.searchAbort = abort;
    this.showResults([], 'Searching…');

    let places: readonly PlaceResult[];
    try {
      places = await this.deps.geocoder.search(query, abort.signal);
    } catch (error: unknown) {
      if (abort.signal.aborted || this.disposed) return;
      const detail =
        error instanceof NetworkError
          ? error.reason === 'timeout'
            ? 'the search service did not answer in time'
            : `search failed (${error.reason})`
          : 'search failed';
      this.showResults([], `${detail}. Try again.`);
      console.error('Geocoding failed:', error);
      return;
    }
    if (abort.signal.aborted || this.disposed) return;
    this.showResults(places, places.length === 0 ? 'No places found.' : null);
  }

  private showResults(places: readonly PlaceResult[], message: string | null): void {
    this.results.replaceChildren();
    if (message !== null) {
      const li = el('li', 'area-picker__message');
      li.textContent = message;
      this.results.appendChild(li);
    }
    for (const place of places) {
      const li = el('li', 'area-picker__result');
      const button = el('button', 'area-picker__result-button');
      button.type = 'button';
      button.textContent = place.displayName;
      button.title = place.displayName;
      button.addEventListener('click', () => {
        this.center = place.center;
        this.redraw();
        this.fitToSquare();
        this.results.replaceChildren();
        this.searchInput.value = place.name;
      });
      li.appendChild(button);
      this.results.appendChild(li);
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

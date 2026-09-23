// WHAT: The places offered by name, so a player has somewhere to start.
// HOW:  A list of SelectedAreas with a name and one line each, in the order
//       they happened. The three that ship with offline elevation fixtures are
//       derived from FIXTURE_AREAS rather than copied, so their coordinates
//       cannot drift from the data.
// WHY:  The hardest moment in this game is the first one: a map, a search box,
//       and no idea where to go. That is a blank page, and a poor introduction
//       to an app whose whole argument is the ground.
//
//       There is a second reason, less obvious. Most ground is flat, and a flat
//       board is indistinguishable from a chessboard — so a player picking at
//       random may never see the point at all. Worse, famous battlefields are
//       *especially* likely to be flat, because flat is what a general wanted.
//
//       So every place here was measured rather than remembered, by
//       scripts/survey-places.ts, which runs the real board build against real
//       terrain and real OpenStreetMap data and reports the relief across the
//       64 cells a player actually stands pieces on, and how many named places
//       the gazetteer will have. The figures in the comments below are that
//       script's output; re-running it is how to check them.
//
//       WHAT THE MEASUREMENT SETTLED. Waterloo is not here. It is the most
//       famous battlefield in Europe and it measured 22 m of relief across the
//       board — the same as Agincourt, which was in the survey as a control
//       *because* it is proverbially flat. Arnhem measured 22 m too, and
//       Isandlwana, for all its dramatic crag, gave the gazetteer three names
//       to work with. None of them would have made a good first board. They are
//       all still one search away on the map, which is rather the point: this
//       list is a door, not a fence.
//
//       WHAT IT GOT WRONG. Culloden went in as a second flat control and came
//       back at 67 m, above Hastings. The moor is flat; a 2 km box around it
//       catches the ground falling away to the Nairn. The measurement describes
//       the box, not the fighting, and is worth reading with that in mind.
//
//       THE TENSION TO BALANCE. Relief and named ground pull against each
//       other. Thermopylae gives 257 m and 14 names; Gettysburg gives 37 m and
//       290, so nearly every square there carries a real one. Both are good
//       boards for opposite reasons, and the list wants some of each.

import type { Briefing, BriefingLine } from '@mapdata/board/buildBriefing';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

/**
 * The sections the list is shown in. Offline is not an era, but it is how a
 * player on a train needs those three sorted, and it keeps the quiet places
 * apart from the battlefields rather than filed between them.
 */
export type PlaceEra = 'medieval' | 'early-modern' | 'ww1' | 'ww2' | 'offline';

/** Section headings, in the order the list shows them. */
export const ERA_LABEL: Readonly<Record<PlaceEra, string>> = {
  medieval: 'Ancient & medieval',
  'early-modern': '18th & 19th centuries',
  ww1: 'First World War',
  ww2: 'Second World War',
  offline: 'Ready offline',
};

export const ERA_ORDER: readonly PlaceEra[] = ['medieval', 'early-modern', 'ww1', 'ww2', 'offline'];

export interface CuratedPlace {
  /** What it is called, as a player would say it. */
  readonly name: string;
  /** One line: the ground first, then the year. Never more than fits a phone. */
  readonly blurb: string;
  readonly era: PlaceEra;
  readonly area: SelectedArea;
  /** True for the areas whose elevation ships in the bundle. */
  readonly offline?: true;
}

function at(lat: number, lon: number, sizeMeters = 2000, rotationDeg = 0): SelectedArea {
  return { centerLat: lat, centerLon: lon, sizeMeters, rotationDeg };
}

/** The three with elevation fixtures in the bundle; areas taken from the data itself. */
function fixture(name: string, blurb: string): CuratedPlace {
  const def = FIXTURE_AREAS.find((f) => f.name === name);
  if (def === undefined) throw new Error(`No fixture area called "${name}".`);
  const title = def.name.charAt(0).toUpperCase() + def.name.slice(1);
  return { name: title, blurb, era: 'offline', area: def.area, offline: true };
}

/**
 * In the order they happened, which turns scrolling the list into walking
 * forward through two and a half thousand years — Thermopylae at the top and
 * Stalingrad near the bottom. Ranking them by relief would read as a league
 * table of other people's worst days.
 *
 * On what is deliberately absent: this stops at battlefields. Sites of civilian
 * massacre and the camps are not places to play a game, and the line is easy
 * enough to hold — every place here is a field somebody has since put a
 * monument and a car park on, which is its own kind of answer.
 */
export const CURATED_PLACES: readonly CuratedPlace[] = [
  // 257 m · 14 named — and OSM names it in Greek, which the board will show
  {
    name: 'Thermopylae',
    era: 'medieval',
    blurb: 'The pass where the mountain meets the sea · 480 BC',
    area: at(38.7961, 22.5361),
  },
  // 64 m · 49 named · 4 kinds of ground · coast in the corner
  {
    name: 'Hastings',
    era: 'medieval',
    blurb: "Senlac ridge, where Harold's line stood · 1066",
    area: at(50.9116, 0.4874),
  },
  // 41 m · 51 named — the castle crag standing over the carse
  {
    name: 'Stirling',
    era: 'medieval',
    blurb: 'The crag and the causeway, the key to Scotland · 1297',
    area: at(56.1244, -3.947),
  },
  // 256 m · 19 named — the Morgartendenkmal stands in the middle of the board
  {
    name: 'Morgarten',
    era: 'medieval',
    blurb: 'The slope the ambush came down · 1315',
    area: at(47.0986, 8.6386),
  },
  // 97 m · 55 named — the cliff the army climbed in the dark
  {
    name: 'Plains of Abraham',
    era: 'early-modern',
    blurb: 'The cliffs above the St Lawrence · 1759',
    area: at(46.8009, -71.216),
  },
  // 37 m · 290 named — much the richest gazetteer of any board here
  {
    name: 'Gettysburg',
    era: 'early-modern',
    blurb: 'Cemetery Ridge and the Round Tops · 1863',
    area: at(39.8064, -77.235),
  },
  // 449 m · 9 named — the most vertical board in the list
  {
    name: 'Lookout Mountain',
    era: 'early-modern',
    blurb: 'The battle they fought above the clouds · 1863',
    area: at(35.0086, -85.3389),
  },
  // 74 m · 22 named · 3 kinds of ground · water
  {
    name: 'Anzac Cove',
    era: 'ww1',
    blurb: 'Ravines rising straight off the beach · 1915',
    area: at(40.2422, 26.2756),
  },
  // 105 m · 34 named — including Douaumont, the village that was never rebuilt
  {
    name: 'Verdun',
    era: 'ww1',
    blurb: 'Fort Douaumont, and a village left as it fell · 1916',
    area: at(49.2108, 5.4342),
  },
  // 307 m · 23 named — the Isonzo between the mountains
  {
    name: 'Kobarid',
    era: 'ww1',
    blurb: 'The river valley under the Julian Alps · 1917',
    area: at(46.2461, 13.5789),
  },
  // 77 m · 99 named — and the map names them in Russian
  {
    name: 'Mamayev Kurgan',
    era: 'ww2',
    blurb: 'The hill that overlooked Stalingrad · 1942',
    area: at(48.7422, 44.5372),
  },
  // 457 m · 32 named — the best board in the survey on both counts at once
  {
    name: 'Monte Cassino',
    era: 'ww2',
    blurb: 'The abbey on its mountain · 1944',
    area: at(41.4894, 13.8139),
  },

  fixture('lindisfarne', 'Tidal sands and a causeway that drowns twice a day'),
  fixture('rievaulx', 'An abbey in a wooded valley'),
  fixture('glencoe', 'A glen steep enough to lose an army in · 1692'),
];

/**
 * The curated place this exact area is, if it is one.
 *
 * Exact, deliberately. A player who drags the square fifty metres off Cemetery
 * Ridge has chosen their own ground, and the board should stop calling itself
 * Gettysburg — the name belongs to the place we measured, not to the region.
 * Deriving it from the area rather than remembering which button was pressed
 * also means a resumed game is named correctly with nothing extra saved.
 */
export function curatedPlaceAt(area: SelectedArea): CuratedPlace | null {
  return (
    CURATED_PLACES.find(
      (p) =>
        p.area.centerLat === area.centerLat &&
        p.area.centerLon === area.centerLon &&
        p.area.sizeMeters === area.sizeMeters &&
        p.area.rotationDeg === area.rotationDeg,
    ) ?? null
  );
}

/** The list in its sections, in ERA_ORDER, leaving out any section with nothing in it. */
export interface PlaceGroup {
  readonly era: PlaceEra;
  readonly label: string;
  readonly places: readonly CuratedPlace[];
}

export function curatedByEra(
  places: readonly CuratedPlace[] = CURATED_PLACES,
): readonly PlaceGroup[] {
  return ERA_ORDER.map((era) => ({
    era,
    label: ERA_LABEL[era],
    places: places.filter((p) => p.era === era),
  })).filter((group) => group.places.length > 0);
}

/** A battlefield, as against one of the quiet places kept for offline play. */
export function isBattlefield(place: CuratedPlace): boolean {
  return place.era !== 'offline';
}

/**
 * The gazetteer entry for a battlefield, headed with the battle rather than the
 * nearest village.
 *
 * The map's own name is kept, one line down, rather than overwritten. Monte
 * Cassino's board is centred on San Silvestro, and that is true and worth
 * knowing — the player chose the battle, and the ground still has its name.
 * Nothing else in the entry changes: the relief, the water and the cover are
 * the same facts whatever the place is called.
 */
export function namedBriefing(
  briefing: Briefing,
  place: CuratedPlace,
  fieldName: string | null,
): Briefing {
  const lines: BriefingLine[] = [{ label: 'History', text: place.blurb }];
  if (fieldName !== null && fieldName !== place.name)
    lines.push({ label: 'Field', text: fieldName });
  return { ...briefing, title: place.name, lines: [...lines, ...briefing.lines] };
}

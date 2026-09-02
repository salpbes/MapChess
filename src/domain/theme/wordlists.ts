// WHAT: The words the theming layer recognises and generates.
// HOW:  Lower-case stems tested against names with word boundaries; and the
//       vocabulary for generated cell names (height words × cover words).
// WHY:  BUILD_PLAN Phase 10 asks for bishops from religious names and knights
//       from horse/cattle names. Those are lists, and lists belong in one file
//       where they can be extended without touching the scoring logic.

/** Names that suggest a bishop: churches, saints, holy ground. */
export const RELIGIOUS_STEMS: readonly string[] = [
  'abbey',
  'priory',
  'minster',
  'church',
  'chapel',
  'kirk',
  'cathedral',
  'monastery',
  'nunnery',
  'convent',
  'friary',
  'hermitage',
  'cross',
  'holy',
  'saint',
  'st',
  'bishop',
  'abbot',
  'prior',
  'monk',
  'canon',
  'temple',
  'shrine',
];

/** Names that suggest a knight: horses, cattle, riding, crossings. */
export const KNIGHT_STEMS: readonly string[] = [
  'horse',
  'hors',
  'mare',
  'stud',
  'stable',
  'ox',
  'oxen',
  'cow',
  'kine',
  'cattle',
  'bull',
  'calf',
  'stirk',
  'herd',
  'ride',
  'riding',
  'rider',
  'knight',
  'ford',
  'wath', // Norse ford
  'bridge',
  'brig',
  'pass',
  'gap',
  'gate', // Norse gata, a road
  'stye',
  'sty',
];

export const HEIGHT_WORDS = {
  high: ['High', 'Upper', 'Top'],
  mid: ['Middle', 'Long', 'Broad'],
  low: ['Low', 'Nether', 'Bottom'],
} as const;

export const COVER_NOUNS: Readonly<Record<string, readonly string[]>> = {
  grass: ['Field', 'Meadow', 'Pasture', 'Close', 'Green'],
  wood: ['Wood', 'Copse', 'Grove', 'Holt', 'Spinney'],
  scrub: ['Moor', 'Heath', 'Common', 'Fell', 'Rough'],
  water: ['Water', 'Mere', 'Pool', 'Tarn', 'Lough'],
  sand: ['Sands', 'Strand', 'Flats', 'Slake', 'Shore'],
};

/** Second-level disambiguation, by compass bearing from the board centre. */
export const COMPASS_WORDS: readonly string[] = [
  'North',
  'North-east',
  'East',
  'South-east',
  'South',
  'South-west',
  'West',
  'North-west',
];

/** True if any stem appears as a whole word (letters only) in the name, case-insensitively. */
export function hasStem(name: string, stems: readonly string[]): boolean {
  const words = name
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/)
    .filter((w) => w !== '');
  return stems.some((s) => words.includes(s));
}

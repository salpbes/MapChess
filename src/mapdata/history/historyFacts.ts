// WHAT: What Wikidata knows about a place, reduced to the three things worth
//       printing: what it is, when it began, and whether anyone protects it.
// HOW:  Pure functions over the `wbgetentities` payload. `referencedIds` says
//       which further entities need looking up, because Wikidata answers
//       "instance of" with another Q-id rather than a word; `toFacts` folds the
//       claims and the resolved labels into one record per entity.
// WHY:  Wikidata is CC0 and structured, which is the whole reason to prefer it
//       over article prose: a date is a date. There is nothing here that can be
//       subtly misworded, nothing to attribute, and nothing generated — the
//       abbey was founded in 1132 because P571 says so, not because it sounded
//       plausible.

/** Claim properties worth reading. */
const INCEPTION = 'P571';
const INSTANCE_OF = 'P31';
const HERITAGE = 'P1435';

export interface HistoryFact {
  readonly id: string;
  readonly label: string | null;
  /** Year only. Wikidata gives full timestamps it does not always mean. */
  readonly year: number | null;
  /** "Cistercian abbey", "hill fort" — the label of the P31 target. */
  readonly kind: string | null;
  /** "scheduled monument", "Grade I listed building". */
  readonly heritage: string | null;
}

/** Minimal shape of the API answer; anything else in it is ignored. */
export interface WikidataResponse {
  readonly entities?: Readonly<Record<string, WikidataEntity>>;
}

interface WikidataEntity {
  readonly labels?: Readonly<Record<string, { readonly value?: unknown } | undefined>>;
  readonly claims?: Readonly<Record<string, readonly WikidataClaim[] | undefined>>;
}

interface WikidataClaim {
  readonly mainsnak?: {
    readonly datavalue?: { readonly value?: unknown };
  };
}

export function isWikidataResponse(value: unknown): value is WikidataResponse {
  return typeof value === 'object' && value !== null;
}

/**
 * The Q-ids these entities point at for "instance of" and heritage status, so
 * a second batched request can turn them into words.
 */
export function referencedIds(response: WikidataResponse): readonly string[] {
  const out = new Set<string>();
  for (const entity of Object.values(response.entities ?? {})) {
    for (const property of [INSTANCE_OF, HERITAGE]) {
      const id = claimId(entity, property);
      if (id !== null) out.add(id);
    }
  }
  return [...out];
}

export function toFacts(
  response: WikidataResponse,
  labels: ReadonlyMap<string, string>,
): ReadonlyMap<string, HistoryFact> {
  const out = new Map<string, HistoryFact>();
  for (const [id, entity] of Object.entries(response.entities ?? {})) {
    const kindId = claimId(entity, INSTANCE_OF);
    const heritageId = claimId(entity, HERITAGE);
    out.set(id, {
      id,
      label: englishLabel(entity),
      year: inceptionYear(entity),
      kind: kindId === null ? null : (labels.get(kindId) ?? null),
      heritage: heritageId === null ? null : (labels.get(heritageId) ?? null),
    });
  }
  return out;
}

/** Every English label in the payload, for resolving referenced ids. */
export function labelsOf(response: WikidataResponse): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [id, entity] of Object.entries(response.entities ?? {})) {
    const label = englishLabel(entity);
    if (label !== null) out.set(id, label);
  }
  return out;
}

/**
 * Worth a line only if it carries a date or a designation. "Aonach Dubh —
 * mountain" and "River Coe — river" are true, sourced, and tell the player
 * nothing they cannot see; the kind is flavour beside a fact, not a fact.
 */
export function isWorthPrinting(fact: HistoryFact): boolean {
  return fact.year !== null || fact.heritage !== null;
}

function englishLabel(entity: WikidataEntity): string | null {
  const value = entity.labels?.en?.value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function claimId(entity: WikidataEntity, property: string): string | null {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  if (typeof value !== 'object' || value === null) return null;
  const id: unknown = (value as { id?: unknown }).id;
  return typeof id === 'string' && /^Q[1-9][0-9]*$/.test(id) ? id : null;
}

/**
 * Wikidata times look like "+1132-03-05T00:00:00Z", and BCE dates lead with a
 * minus. Only the year is kept: the day is usually a precision artefact.
 */
function inceptionYear(entity: WikidataEntity): number | null {
  const value = entity.claims?.[INCEPTION]?.[0]?.mainsnak?.datavalue?.value;
  if (typeof value !== 'object' || value === null) return null;
  const time: unknown = (value as { time?: unknown }).time;
  if (typeof time !== 'string') return null;
  const match = /^([+-])(\d{1,11})-/.exec(time);
  if (match === null) return null;
  const digits = match[2];
  if (digits === undefined) return null;
  const year = Number.parseInt(digits, 10);
  if (!Number.isFinite(year) || year === 0) return null;
  return match[1] === '-' ? -year : year;
}

/** "Cistercian abbey, founded 1132, scheduled monument" — omitting what is missing. */
export function describeFact(fact: HistoryFact): string | null {
  const parts: string[] = [];
  if (fact.kind !== null) parts.push(fact.kind);
  if (fact.year !== null) {
    parts.push(fact.year < 0 ? `from ${String(-fact.year)} BC` : `founded ${String(fact.year)}`);
  }
  if (fact.heritage !== null) parts.push(fact.heritage);
  return parts.length === 0 ? null : parts.join(', ');
}

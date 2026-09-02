// WHAT: Counts and name lists for a set of features — the Phase 7 "done when".
// HOW:  Pure: MapFeature[] → { counts by kind, named entries with flags }.
//       `formatFeatureReport` renders it as text for the console.
// WHY:  BUILD_PLAN Phase 7: "picking an area prints feature counts by type and
//       lists every name found, old names flagged". Also the first honest look
//       at how patchy OSM naming is per area (BUILD_PLAN §1).

import { FEATURE_KINDS, hasAnyName } from '@mapdata/model/MapFeature';
import type { FeatureKind, MapFeature } from '@mapdata/model/MapFeature';

export interface NamedEntry {
  readonly kind: FeatureKind;
  readonly subtype: string | null;
  readonly name: string | null;
  readonly oldName: string | null;
  readonly historicName: string | null;
  readonly altName: string | null;
}

export interface FeatureSummary {
  readonly total: number;
  readonly counts: Readonly<Record<FeatureKind, number>>;
  readonly named: readonly NamedEntry[];
  readonly oldNameCount: number;
}

export function summarizeFeatures(features: readonly MapFeature[]): FeatureSummary {
  const counts = Object.fromEntries(FEATURE_KINDS.map((k) => [k, 0])) as Record<
    FeatureKind,
    number
  >;
  const seen = new Set<string>();
  const named: NamedEntry[] = [];
  let oldNameCount = 0;

  for (const f of features) {
    counts[f.kind] += 1;
    if (!hasAnyName(f)) continue;
    // A river split into several ways should list once.
    const key = `${f.kind}|${f.names.name ?? ''}|${f.names.oldName ?? ''}|${f.names.historicName ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (f.names.oldName !== undefined || f.names.historicName !== undefined) oldNameCount += 1;
    named.push({
      kind: f.kind,
      subtype: f.subtype,
      name: f.names.name ?? null,
      oldName: f.names.oldName ?? null,
      historicName: f.names.historicName ?? null,
      altName: f.names.altName ?? null,
    });
  }

  named.sort((a, b) => a.kind.localeCompare(b.kind) || (a.name ?? '').localeCompare(b.name ?? ''));
  return { total: features.length, counts, named, oldNameCount };
}

export function formatFeatureReport(summary: FeatureSummary, heading: string): string {
  const lines = [heading, `  ${String(summary.total)} features`];
  for (const kind of FEATURE_KINDS) {
    const n = summary.counts[kind];
    if (n > 0) lines.push(`    ${kind.padEnd(10)} ${String(n)}`);
  }
  lines.push(
    `  ${String(summary.named.length)} named, ${String(summary.oldNameCount)} with an old or historic name`,
  );
  for (const e of summary.named) {
    const flags: string[] = [];
    if (e.oldName !== null) flags.push(`OLD NAME: ${e.oldName}`);
    if (e.historicName !== null) flags.push(`historic: ${e.historicName}`);
    if (e.altName !== null) flags.push(`alt: ${e.altName}`);
    const sub = e.subtype === null ? '' : `/${e.subtype}`;
    lines.push(
      `    ${(e.kind + sub).padEnd(22)} ${e.name ?? '(unnamed)'}${flags.length > 0 ? `  [${flags.join('; ')}]` : ''}`,
    );
  }
  return lines.join('\n');
}

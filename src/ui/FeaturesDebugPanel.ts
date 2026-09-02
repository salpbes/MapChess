// WHAT: A panel listing feature counts by kind and every name found, with old
//       or historic names flagged; shows loading and error states.
// HOW:  Implements IFeaturesView. Counts as a compact line; names as a
//       scrollable list grouped by kind. Purely presentational.
// WHY:  BUILD_PLAN Phase 7 "done when" — visible in the page, not only in the
//       console — and an early honest look at how sparse naming is per area.

import type { IFeaturesView } from '@mapdata/features/FeatureLoader';
import type { FeatureResult } from '@mapdata/features/IFeatureProvider';
import type { FeatureSummary } from '@mapdata/features/summarizeFeatures';
import { FEATURE_KINDS } from '@mapdata/model/MapFeature';

export class FeaturesDebugPanel implements IFeaturesView {
  private readonly el: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private readonly counts: HTMLDivElement;
  private readonly list: HTMLUListElement;

  public constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'features-panel';
    this.caption = document.createElement('div');
    this.caption.className = 'features-panel__caption';
    this.counts = document.createElement('div');
    this.counts.className = 'features-panel__counts';
    this.list = document.createElement('ul');
    this.list.className = 'features-panel__list';
    this.el.append(this.caption, this.counts, this.list);
    container.appendChild(this.el);
    this.showLoading();
  }

  public showLoading(): void {
    this.caption.textContent = 'Features: loading…';
    this.counts.textContent = '';
    this.list.replaceChildren();
  }

  public showError(message: string): void {
    this.caption.textContent = `Features failed: ${message}`;
    this.counts.textContent = '';
    this.list.replaceChildren();
  }

  public showFeatures(summary: FeatureSummary, result: FeatureResult): void {
    this.caption.textContent = `Features: ${String(summary.total)} · ${String(summary.named.length)} named · ${String(
      summary.oldNameCount,
    )} old/historic · ${result.source} · ${String(Math.round(result.elapsedMs))} ms`;

    this.counts.textContent = FEATURE_KINDS.filter((k) => summary.counts[k] > 0)
      .map((k) => `${k} ${String(summary.counts[k])}`)
      .join(' · ');

    this.list.replaceChildren();
    for (const e of summary.named) {
      const li = document.createElement('li');
      li.className = 'features-panel__item';
      const kind = document.createElement('span');
      kind.className = 'features-panel__kind';
      kind.textContent = e.subtype === null ? e.kind : `${e.kind}/${e.subtype}`;
      const name = document.createElement('span');
      name.textContent = e.name ?? '(unnamed)';
      li.append(kind, name);
      if (e.oldName !== null || e.historicName !== null) {
        const old = document.createElement('span');
        old.className = 'features-panel__old';
        old.textContent =
          e.oldName !== null ? `old: ${e.oldName}` : `historic: ${e.historicName ?? ''}`;
        li.appendChild(old);
      }
      this.list.appendChild(li);
    }
  }

  public dispose(): void {
    this.el.remove();
  }
}

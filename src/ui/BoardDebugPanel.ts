// WHAT: Developer toggles: flat vs warped board, cell labels, feature overlay.
// HOW:  Three controls in one small panel; calls back on change.
// WHY:  Phase 8 is tuned by eye. Flipping between flat and warped on the same
//       terrain, and seeing rivers against edges, is the fastest feedback loop.
//       Shown only with `?debug`, like the FPS meter.

import type { BoardMode } from '@app/BoardComposer';

export interface BoardDebugState {
  readonly mode: BoardMode;
  readonly labels: boolean;
  readonly features: boolean;
}

export class BoardDebugPanel {
  private readonly el: HTMLDivElement;
  private state: BoardDebugState;

  public constructor(
    container: HTMLElement,
    initial: BoardDebugState,
    private readonly onChange: (state: BoardDebugState) => void,
  ) {
    this.state = initial;
    this.el = document.createElement('div');
    this.el.className = 'board-debug';

    const mode = document.createElement('label');
    const modeInput = document.createElement('input');
    modeInput.type = 'checkbox';
    modeInput.checked = initial.mode === 'warped';
    modeInput.addEventListener('change', () => {
      this.update({ mode: modeInput.checked ? 'warped' : 'flat' });
    });
    mode.append(modeInput, document.createTextNode(' warped board'));

    const labels = this.checkbox('cell labels', initial.labels, (v) => {
      this.update({ labels: v });
    });
    const features = this.checkbox('rivers & peaks', initial.features, (v) => {
      this.update({ features: v });
    });

    this.el.append(mode, labels, features);
    container.appendChild(this.el);
  }

  public dispose(): void {
    this.el.remove();
  }

  private checkbox(
    text: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ): HTMLLabelElement {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => {
      onChange(input.checked);
    });
    label.append(input, document.createTextNode(` ${text}`));
    return label;
  }

  private update(patch: Partial<BoardDebugState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}

// WHAT: One panel holding everything the player can press: where the board is,
//       what to do in the game, and what to look at.
// HOW:  Two slots on one sheet, ruled off from each other. The first is where
//       you are — the menu, the saved places, the map. The second is what you
//       do — hint, take back, resign, and what the board says. AreaBar,
//       GameControls and ViewControls mount into them and stop being panels in
//       their own right: this owns the paper, they contribute buttons.
// WHY:  They were three separate slabs pinned to three different corners, and
//       finding a button meant remembering which corner it lived in. One dock
//       reads top to bottom: settle where you are, then play.

export class ControlDock {
  private readonly root: HTMLDivElement;
  /** The menu, the example areas, the map. */
  public readonly placeSlot: HTMLDivElement;
  /** Hint, take back, resign, and the label switch. */
  public readonly actionSlot: HTMLDivElement;

  public constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dock';

    this.placeSlot = slot('dock__row dock__row--place');
    this.actionSlot = slot('dock__row dock__row--actions');

    this.root.append(this.placeSlot, this.actionSlot);
    parent.appendChild(this.root);
  }

  public dispose(): void {
    this.root.remove();
  }
}

function slot(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

// WHAT: The line icons the HUD buttons are drawn with.
// HOW:  A table of SVG path data on a 24×24 grid, and one builder that wraps a
//       set of paths in an `<svg>` stroked in `currentColor`, so an icon takes
//       the ink colour of whatever button holds it. Built with `createElementNS`
//       rather than an HTML string: these are markup, not text.
// WHY:  Icon buttons need to look like one family or they read as a ransom
//       note — same grid, same stroke weight, same joins. Keeping the paths in
//       one table is also the only way to be sure the map on the menu and the
//       map in the control dock are the same map.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Every icon is drawn inside 24×24, stroked, never filled. */
const PATHS: Readonly<Record<string, readonly string[]>> = {
  // A folded paper map — "where in the world is this board".
  map: ['M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4Z', 'M9 4v13.5', 'M15 6.5V20'],
  // A star: the handful of places kept ready to hand.
  star: ['M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z'],
  // Three rules: the menu.
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  // A lamp: the hint.
  hint: [
    'M12 3a6 6 0 0 0-3.4 10.9c.6.5 1 1.1 1.1 1.6h4.6c.1-.5.5-1.1 1.1-1.6A6 6 0 0 0 12 3Z',
    'M9.5 18h5',
    'M10.5 21h3',
  ],
  // An arrow turning back on itself: take the move back.
  undo: ['M7 4 3 8l4 4', 'M3 8h11a6 6 0 0 1 0 12H9'],
  // A flag: giving up the field.
  flag: ['M6 3v18', 'M6 4h11l-2 4 2 4H6'],
  // A luggage tag: the place names on the board.
  tag: ['M20 4h-7.2L4 12.8 11.2 20 20 11.2V4Z', 'M16.4 7.6h.01'],
  // A map pin: markers without their names.
  pin: ['M12 21s6-5.9 6-10.2A6 6 0 0 0 6 10.8C6 15.1 12 21 12 21Z', 'M12 11h.01'],
  // Two bars: hold the watched game.
  pause: ['M9 5v14', 'M15 5v14'],
  // A triangle: set it going again.
  play: ['M7 4.5v15l13-7.5Z'],
  // A speaker, with and without its sound.
  sound: ['M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z', 'M15.5 9.5a3.6 3.6 0 0 1 0 5', 'M18 7a7 7 0 0 1 0 10'],
  soundOff: ['M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z', 'M16 10l5 4', 'M21 10l-5 4'],
  // Four corners round a centre: put the board back where it was.
  recenter: ['M4 9V5h4', 'M20 9V5h-4', 'M4 15v4h4', 'M20 15v4h-4', 'M12 12h.01'],
  // A pair of scales: how the game stands.
  scales: ['M12 4v16', 'M7 20h10', 'M4 8h16', 'M4 8l-2.5 5h5Z', 'M20 8l-2.5 5h5Z'],
  // An open book: what the opening is called and what to do in it.
  book: [
    'M12 7.2S9.6 5.2 3.8 5.8v12.4c5.8-.6 8.2 1.4 8.2 1.4s2.4-2 8.2-1.4V5.8C14.4 5.2 12 7.2 12 7.2Z',
    'M12 7.2v12.4',
  ],
  // The tag, struck through: nothing on the board.
  tagOff: ['M20 4h-7.2L4 12.8 11.2 20 20 11.2V4Z', 'M3.5 3.5l17 17'],
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, sizePx = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(sizePx));
  svg.setAttribute('height', String(sizePx));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  // Decorative: every button carrying one also carries an aria-label.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of PATHS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * A button that is nothing but an icon. The label is what a screen reader
 * announces and what the tooltip says — an icon on its own is a guess. The
 * tooltip is `data-tip` rather than `title`: the native one waits a second,
 * arrives in the operating system's colours, and cannot be styled to match
 * paper. Setting both would show two.
 */
export function iconButton(
  name: IconName,
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.tip = label;
  button.setAttribute('aria-label', label);
  button.appendChild(icon(name));
  button.addEventListener('click', onClick);
  return button;
}

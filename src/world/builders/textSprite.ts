// WHAT: Text drawn once to a canvas texture, as a camera-facing sprite or as
//       the texture on its own for callers that place their own geometry.
// HOW:  Renders the text onto a canvas sized to it and wraps it in a
//       SpriteMaterial; the caller sets the scale in metres. Two treatments:
//       a rounded dark backing pill, or `outlined` text — a dark halo stroked
//       behind the glyphs with nothing filled behind them. Long text wraps on
//       word boundaries at `wrapPx`.
// WHY:  Labels (Phase 9) and the debug overlay (Phase 8) both need this; one
//       implementation keeps them looking alike and disposes the same way.
//       The outlined form exists because a filled pill blanks out a rectangle
//       of the landscape per label, and ten of those is a lot of board to lose
//       for ten short words.

import { CanvasTexture, Sprite, SpriteMaterial } from 'three';

import { LABEL_BACK, LABEL_HALO, LABEL_TEXT } from './palette';

export interface TextSpriteOptions {
  /** Height of the sprite in world metres; width follows the text. */
  readonly heightMeters: number;
  readonly fontPx?: number;
  readonly depthTest?: boolean;
  /** Below 1 the label sits back behind the board it names. Default 1. */
  readonly opacity?: number;
  /**
   * Draw a dark halo around the glyphs instead of a filled pill behind them.
   * Costs nothing in coverage and stays readable over grass, water or wood.
   */
  readonly outlined?: boolean;
  /** Text colour; defaults to the shared label colour. */
  readonly color?: string;
  /**
   * Wrap onto further lines past this width in canvas pixels. A long name on
   * one line makes a label wider than the cell it belongs to.
   */
  readonly wrapPx?: number;
}

export interface TextTexture {
  readonly texture: CanvasTexture;
  /** Width ÷ height of the drawn canvas, for sizing whatever carries it. */
  readonly aspect: number;
}

export function makeTextSprite(text: string, options: TextSpriteOptions): Sprite {
  const { texture, aspect } = makeTextTexture(text, options);
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: options.opacity ?? 1,
      depthTest: options.depthTest ?? true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(options.heightMeters * aspect, options.heightMeters, 1);
  return sprite;
}

export function makeTextTexture(text: string, options: TextSpriteOptions): TextTexture {
  const fontPx = options.fontPx ?? 56;
  const outlined = options.outlined ?? false;
  // Heavier when outlined: a halo eats into thin strokes.
  const weight = outlined ? '700' : '600';
  const font = `${weight} ${String(fontPx)}px system-ui, sans-serif`;
  // The halo needs room outside the glyphs; the pill needs room inside it.
  const halo = fontPx * 0.14;
  const pad = outlined ? halo * 2 : fontPx * 0.5;

  const measure = document.createElement('canvas').getContext('2d');
  if (measure === null) throw new Error('2D canvas unavailable');
  measure.font = font;
  const lines = wrap(text, measure, options.wrapPx);
  const textWidth = Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width)));
  const lineHeight = fontPx * 1.18;

  const canvas = document.createElement('canvas');
  canvas.width = textWidth + pad * 2;
  canvas.height = lineHeight * lines.length + pad * 1.2;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    if (!outlined) {
      ctx.fillStyle = LABEL_BACK;
      roundRect(ctx, 0, 0, canvas.width, canvas.height, Math.min(canvas.height, lineHeight) / 2);
      ctx.fill();
    }
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (outlined) {
      ctx.strokeStyle = LABEL_HALO;
      ctx.lineWidth = halo * 2;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
    }
    const x = canvas.width / 2;
    const top = (canvas.height - lineHeight * lines.length) / 2;
    lines.forEach((line, i) => {
      const y = top + lineHeight * (i + 0.5) + fontPx * 0.04;
      // Stroked first, then filled over it, so the halo never eats the glyph.
      if (outlined) ctx.strokeText(line, x, y);
      ctx.fillStyle = options.color ?? LABEL_TEXT;
      ctx.fillText(line, x, y);
    });
  }

  return { texture: new CanvasTexture(canvas), aspect: canvas.width / canvas.height };
}

/** Greedy word wrap. A single word longer than the limit is left to overflow. */
function wrap(text: string, ctx: CanvasRenderingContext2D, wrapPx: number | undefined): string[] {
  if (wrapPx === undefined || ctx.measureText(text).width <= wrapPx) return [text];
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && ctx.measureText(candidate).width > wrapPx) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

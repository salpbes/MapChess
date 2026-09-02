// WHAT: Text as a camera-facing sprite, drawn once to a canvas texture.
// HOW:  Renders the text with a rounded dark backing onto a canvas sized to
//       the text, wraps it in a SpriteMaterial. Caller sets scale in metres.
// WHY:  Labels (Phase 9) and the debug overlay (Phase 8) both need this; one
//       implementation keeps them looking alike and disposes the same way.

import { CanvasTexture, Sprite, SpriteMaterial } from 'three';

import { LABEL_BACK, LABEL_TEXT } from './palette';

export interface TextSpriteOptions {
  /** Height of the sprite in world metres; width follows the text. */
  readonly heightMeters: number;
  readonly fontPx?: number;
  readonly depthTest?: boolean;
}

export function makeTextSprite(text: string, options: TextSpriteOptions): Sprite {
  const fontPx = options.fontPx ?? 56;
  const pad = fontPx * 0.5;
  const measure = document.createElement('canvas').getContext('2d');
  if (measure === null) throw new Error('2D canvas unavailable');
  measure.font = `600 ${String(fontPx)}px system-ui, sans-serif`;
  const textWidth = Math.ceil(measure.measureText(text).width);

  const canvas = document.createElement('canvas');
  canvas.width = textWidth + pad * 2;
  canvas.height = fontPx + pad * 1.2;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.fillStyle = LABEL_BACK;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, canvas.height / 2);
    ctx.fill();
    ctx.fillStyle = LABEL_TEXT;
    ctx.font = `600 ${String(fontPx)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + fontPx * 0.04);
  }

  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: options.depthTest ?? true,
      depthWrite: false,
    }),
  );
  sprite.scale.set((options.heightMeters * canvas.width) / canvas.height, options.heightMeters, 1);
  return sprite;
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

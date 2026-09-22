// WHAT: The bounds on a map label's text.
// WHY:  A label is an OpenStreetMap `name` tag, which anyone on the internet
//       can edit, and it decides how big a canvas the label allocates. Without
//       a bound, a vandalised name is an allocation of that name's choosing in
//       the browser of whoever picked that square. These are the two caps that
//       stop it, kept as pure functions so they can be tested without a canvas.

import { describe, expect, it } from 'vitest';

import { clampLabelText, clampLines } from '@world/builders/textSprite';

describe('clampLabelText', () => {
  it('leaves a real place name alone', () => {
    // The longest in common use, at 58 characters.
    const welsh = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch';
    expect(clampLabelText(welsh)).toBe(welsh);
    expect(clampLabelText('Holy Island')).toBe('Holy Island');
    expect(clampLabelText('')).toBe('');
  });

  it('cuts a name past the limit and marks it', () => {
    const cut = clampLabelText('a'.repeat(5000));
    expect(cut.length).toBe(120);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('bounds a single unbroken word, which the wrap deliberately does not', () => {
    // `wrap` lets one long word overflow its limit, so this is the only thing
    // standing between a space-free name and the canvas width.
    expect(clampLabelText('x'.repeat(100_000)).length).toBe(120);
  });
});

describe('clampLines', () => {
  it('leaves a label that already fits', () => {
    expect(clampLines(['Chare', 'Ends'])).toEqual(['Chare', 'Ends']);
    expect(clampLines([])).toEqual([]);
  });

  it('keeps three lines and marks the last', () => {
    expect(clampLines(['one', 'two', 'three', 'four', 'five'])).toEqual(['one', 'two', 'three…']);
  });

  it('bounds the line count however many words arrive', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => `word${String(i)}`);
    expect(clampLines(many)).toHaveLength(3);
  });

  it('returns a copy, never the caller-s array', () => {
    const lines = ['one', 'two'];
    expect(clampLines(lines)).not.toBe(lines);
  });
});

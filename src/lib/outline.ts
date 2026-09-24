/**
 * The optional outline around text, which keeps it readable over images.
 *
 * Pebble's graphics have no text stroke, so the watch fakes one: the text is
 * drawn in the outline color at every pixel offset within the width, then once
 * more on top in its own color. The preview stacks hard-edged CSS shadows at
 * the same offsets.
 */

import type { Hex, WatchElement } from '../types';
import { luminance } from './platform';

export const OUTLINE_WIDTHS = [1, 2] as const;
export type OutlineWidth = (typeof OUTLINE_WIDTHS)[number];

/** Black and white exist on every watch, so an outline never needs converting. */
export const OUTLINE_COLORS: { value: Hex; label: string }[] = [
  { value: '#000000', label: 'Black' },
  { value: '#ffffff', label: 'White' },
];

export interface TextOutline {
  color: Hex;
  width: OutlineWidth;
}

/**
 * Whether an element puts text on screen, and so can have an outline. A
 * weather icon and the dot and bar Bluetooth styles share the text box fields
 * but draw shapes instead.
 */
export function drawsText(el: WatchElement): boolean {
  if (!('font' in el)) return false;
  if (el.type === 'weather') return el.field !== 'icon';
  if (el.type === 'bluetooth') return el.style === 'text';
  return true;
}

/** The outline an element draws with, or null when it has none. */
export function textOutline(el: WatchElement): TextOutline | null {
  if (!drawsText(el) || !('outline' in el) || !el.outline) return null;
  const width: OutlineWidth = el.outlineWidth === 2 ? 2 : 1;
  return { color: el.outlineColor ?? '#000000', width };
}

/**
 * Every offset the outline is drawn at. Width 1 is the full ring of eight
 * neighbors; width 2 leaves off the far corners, which would otherwise make
 * the outline visibly square. The generated C loops with the same test.
 */
export function outlineOffsets(width: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -width; dy <= width; dy++) {
    for (let dx = -width; dx <= width; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (dx * dx + dy * dy > width * width + width) continue;
      out.push([dx, dy]);
    }
  }
  return out;
}

/** The outline as a CSS text-shadow: one hard-edged copy per offset. */
export function outlineShadow(outline: TextOutline): string {
  return outlineOffsets(outline.width)
    .map(([dx, dy]) => `${dx}px ${dy}px 0 ${outline.color}`)
    .join(', ');
}

/** The outline that stands out most against a text color, for a new outline. */
export function contrastingOutline(color: Hex): Hex {
  return luminance(color) >= 0.5 ? '#000000' : '#ffffff';
}

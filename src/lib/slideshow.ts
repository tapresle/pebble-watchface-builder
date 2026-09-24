/**
 * Shared rules for the slideshow element: how many images a face may carry,
 * which one the preview shows, and what one costs to load.
 */

import type { SlideshowElement, WatchElement } from '../types';
import type { PlatformSpec } from './platform';

/**
 * Images allowed across every slideshow in the face, counted per frame slot.
 *
 * Kept low on purpose. Every image is its own bitmap resource, and all of them
 * share the app's resource space with the fonts and the other images, so a
 * handful of full-screen photos is already a real share of it. A repeated
 * image still counts, which overstates the cost slightly and never understates
 * it.
 */
export const MAX_SLIDESHOW_IMAGES = 6;

export const SLIDESHOW_DEFAULT_INTERVAL = 15;
/** The longest an image stays up, in minutes. */
export const SLIDESHOW_MAX_INTERVAL = 60;

/**
 * Past this combined size, the images might not fit in the app's resource
 * space. The SDK decides the stored format, so this is a cautious estimate from
 * the decoded size rather than a hard limit.
 */
export const SLIDESHOW_STORAGE_WARN_BYTES = 128 * 1024;

const isSlideshow = (el: WatchElement): el is SlideshowElement => el.type === 'slideshow';

/** Frame slots used by every slideshow in the face, hidden ones included. */
export function slideshowImageCount(elements: WatchElement[]): number {
  return elements.filter(isSlideshow).reduce((n, el) => n + el.assetIds.length, 0);
}

/**
 * How many of its frames each slideshow keeps once the face-wide cap is
 * applied, handed out bottom layer first.
 *
 * The editor stops the cap being reached by adding a frame, but a duplicate, a
 * paste, or an opened project can still go over, and then the export and the
 * preview drop the same frames rather than each guessing.
 */
export function slideshowAllowance(elements: WatchElement[]): Map<string, number> {
  const out = new Map<string, number>();
  let left = MAX_SLIDESHOW_IMAGES;
  for (const el of elements.filter(isSlideshow)) {
    const kept = Math.min(el.assetIds.length, left);
    out.set(el.id, kept);
    left -= kept;
  }
  return out;
}

export const clampInterval = (minutes: number): number =>
  Math.min(SLIDESHOW_MAX_INTERVAL, Math.max(1, Math.round(minutes)));

/**
 * Which frame the preview shows: the first, moved on by however many times the
 * Slide buttons were pressed. The watch picks by the clock instead, but the
 * first image is the one being designed around.
 */
export function previewFrame(count: number, step: number): number {
  if (count <= 0) return 0;
  return ((step % count) + count) % count;
}

/**
 * Decoded size of one bitmap at w x h on this watch. A 1-bit row is padded to a
 * whole word; a color pixel is a byte.
 */
export function bitmapBytes(w: number, h: number, colorMode: PlatformSpec['colorMode']): number {
  const rowBytes = colorMode === 'bw' ? Math.ceil(w / 32) * 4 : w;
  return rowBytes * h;
}

/** Bounding-box maths shared by the canvas, the selection UI, and the inspector. */

import type { WatchElement } from '../types';
import type { PlatformSpec } from './platform';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How wide a box occupying rows [top, top + height) can be and still fall
 * entirely on the part of the screen that lights up.
 *
 * A round panel hands the app the same square framebuffer as a rectangular one,
 * but only the inscribed circle is displayed, so the usable width is that
 * circle's chord at whichever edge of the box sits furthest from the center.
 */
export function visibleWidthAt(spec: PlatformSpec, top: number, height: number): number {
  if (spec.shape !== 'round') return spec.width;
  const radius = spec.width / 2;
  const centerY = spec.height / 2;
  const dy = Math.max(Math.abs(top - centerY), Math.abs(top + height - centerY));
  return 2 * Math.sqrt(Math.max(0, radius * radius - dy * dy));
}

/**
 * Where a line's far end lands, given its length and its angle in degrees
 * clockwise from horizontal. Screen coordinates run downwards, so a positive
 * angle sweeps down from pointing right, which is what reads as clockwise.
 */
export function lineDelta(length: number, angleDeg: number): { dx: number; dy: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    dx: Math.round(length * Math.cos(radians)),
    dy: Math.round(length * Math.sin(radians)),
  };
}

/** The length and angle that put a line's far end at this offset. */
export function lineFromDelta(dx: number, dy: number): { length: number; angle: number } {
  return {
    length: Math.round(Math.hypot(dx, dy)),
    angle: Math.round((((Math.atan2(dy, dx) * 180) / Math.PI) % 360 + 360) % 360),
  };
}

export const MIN_POLYGON_SIDES = 3;
export const MAX_POLYGON_SIDES = 24;

/**
 * Vertices of a regular polygon, normalized to exactly fill a w x h box.
 *
 * Filling the box (rather than inscribing in an ellipse) means the shape always
 * matches its selection handles, and it makes four sides at 45 degrees come out
 * as an axis-aligned rectangle - the shape this element starts life as.
 */
export function polygonPoints(
  sides: number,
  rotationDeg: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const n = Math.max(MIN_POLYGON_SIDES, Math.min(MAX_POLYGON_SIDES, Math.round(sides)));
  const rot = (rotationDeg * Math.PI) / 180 - Math.PI / 2;
  const unit = Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return { x: Math.cos(a), y: Math.sin(a) };
  });

  const xs = unit.map((p) => p.x);
  const ys = unit.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;

  return unit.map((p) => ({
    x: ((p.x - minX) / spanX) * w,
    y: ((p.y - minY) / spanY) * h,
  }));
}

/**
 * True when a polygon is a plain rectangle. Only then can the corner radius be
 * honored, since the SDK rounds GRects and not arbitrary paths.
 */
export function isAxisAlignedRect(sides: number, rotationDeg: number): boolean {
  const r = (((rotationDeg % 90) + 90) % 90);
  return Math.round(sides) === 4 && Math.abs(r - 45) < 0.01;
}

/** The on-screen rectangle an element occupies, used for hit-testing and handles. */
export function elementBox(el: WatchElement): Box {
  switch (el.type) {
    case 'batteryRing':
    case 'analog':
    case 'circle':
      return { x: el.x, y: el.y, w: el.size, h: el.size };
    case 'line': {
      // A stroke spreads half its thickness perpendicular to the segment, and
      // that spread is all a square end contributes: it stops dead at the
      // endpoint, adding nothing along the line. So a horizontal line grows
      // only in y and a vertical one only in x, with angles in between
      // splitting the difference. Rounded ends are the exception, being discs
      // of the same radius centered on the endpoints, which reach half a
      // thickness in every direction.
      const { dx, dy } = lineDelta(el.length, el.angle);
      const half = Math.max(1, el.width) / 2;
      const span = Math.hypot(dx, dy);
      const round = el.roundedEnds || span === 0;
      const growX = round ? half : (half * Math.abs(dy)) / span;
      const growY = round ? half : (half * Math.abs(dx)) / span;
      return {
        x: Math.min(el.x, el.x + dx) - growX,
        y: Math.min(el.y, el.y + dy) - growY,
        w: Math.abs(dx) + growX * 2,
        h: Math.abs(dy) + growY * 2,
      };
    }
    case 'bluetooth':
      return el.style === 'dot'
        ? { x: el.x, y: el.y, w: el.markSize, h: el.markSize }
        : { x: el.x, y: el.y, w: el.w, h: el.h };
    default:
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

/** Lines are moved by their endpoints instead of by corner handles. */
export function isResizable(el: WatchElement): boolean {
  return el.type !== 'line';
}

/** Whether resizing should be constrained to a square. */
export function isSquare(el: WatchElement): boolean {
  return (
    el.type === 'batteryRing' ||
    el.type === 'analog' ||
    el.type === 'circle' ||
    (el.type === 'bluetooth' && el.style === 'dot')
  );
}

/**
 * Which property the inspector's size field should write. Square elements keep
 * their dimension under different names, and writing the wrong one silently
 * does nothing.
 */
export function sizeProperty(el: WatchElement): 'size' | 'markSize' | 'w' {
  if (el.type === 'analog' || el.type === 'batteryRing' || el.type === 'circle') return 'size';
  if (el.type === 'bluetooth' && el.style === 'dot') return 'markSize';
  return 'w';
}

/** Convert a new bounding box back into element-specific properties. */
export function resizePatch(el: WatchElement, box: Box): Partial<WatchElement> {
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const x = Math.round(box.x);
  const y = Math.round(box.y);

  switch (el.type) {
    case 'batteryRing':
    case 'analog':
    case 'circle':
      return { x, y, size: Math.max(8, Math.max(w, h)) } as Partial<WatchElement>;
    case 'bluetooth':
      return el.style === 'dot'
        ? ({ x, y, markSize: Math.max(3, Math.max(w, h)) } as Partial<WatchElement>)
        : ({ x, y, w, h } as Partial<WatchElement>);
    case 'line':
      return { x, y } as Partial<WatchElement>;
    default:
      return { x, y, w, h } as Partial<WatchElement>;
  }
}

/** True when the element draws text and therefore has a font/alignment. */
export function hasFont(
  el: WatchElement,
): el is Extract<WatchElement, { font: unknown }> {
  return 'font' in el;
}

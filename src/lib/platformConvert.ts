/**
 * Moving an existing design between watches.
 *
 * The screens differ in size, shape, and in how many colors they can show, so a
 * conversion snaps every color to what the target panel supports and nudges
 * anything that would land where the target cannot show it back into view.
 * Geometry is otherwise left alone - rescaling a layout tends to produce
 * something worse than what the user would do by hand.
 */

import type { PlatformId, WatchElement, WatchfaceProject } from '../types';
import { elementBox } from './geometry';
import { platformSpec, quantizeToPlatform, type PlatformSpec } from './platform';
import { clamp } from './utils';

/** Keep at least this much of an element on screen so it stays draggable. */
const EDGE_MARGIN = 8;

/**
 * Where an element has to sit to be visible on the target watch.
 *
 * A rectangular screen only asks that a sliver of the element stay on it, so it
 * remains selectable. A round one is stricter: the corners of the framebuffer
 * are never displayed, so an element is pulled towards the center until its
 * whole box is inside the circle. How wide the element is decides how far from
 * the center row it can go, since past that point the chord is too short to
 * hold it. Anything too big to fit is centered, that being the closest thing to
 * where the user put it.
 */
function fitToScreen(el: WatchElement, spec: PlatformSpec): { x: number; y: number } {
  const box = elementBox(el);
  // x and y are the element's own anchor; the drawn box can sit elsewhere (a
  // line with a negative delta, say), so shifts are applied through the offset.
  const offsetX = el.x - box.x;
  const offsetY = el.y - box.y;

  if (spec.shape !== 'round') {
    return {
      x: clamp(el.x, EDGE_MARGIN - box.w, spec.width - EDGE_MARGIN),
      y: clamp(el.y, EDGE_MARGIN - box.h, spec.height - EDGE_MARGIN),
    };
  }

  const radius = spec.width / 2;
  const centerX = spec.width / 2;
  const centerY = spec.height / 2;

  /** Clamp into [lo, hi], or center on that axis when the box is too big. */
  const fitAxis = (value: number, size: number, center: number, half: number) => {
    const lo = Math.ceil(center - half);
    const hi = Math.floor(center + half - size);
    return lo > hi ? Math.round(center - size / 2) : clamp(value, lo, hi);
  };

  // The furthest from the center row a box this wide can have either edge.
  const reach = Math.sqrt(Math.max(0, radius * radius - (box.w * box.w) / 4));
  const top = fitAxis(box.y, box.h, centerY, reach);

  const dy = Math.max(Math.abs(top - centerY), Math.abs(top + box.h - centerY));
  const halfChord = Math.sqrt(Math.max(0, radius * radius - dy * dy));
  const left = fitAxis(box.x, box.w, centerX, halfChord);

  return { x: left + offsetX, y: top + offsetY };
}

const isColorKey = (key: string) => key === 'color' || key.endsWith('Color');
const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** Snap every color-valued property on an element to the target palette. */
export function quantizeElementColors<T extends WatchElement>(el: T, spec: PlatformSpec): T {
  const out: Record<string, unknown> = { ...el };
  let touched = false;
  for (const [key, value] of Object.entries(out)) {
    if (isColorKey(key) && isHex(value)) {
      const snapped = quantizeToPlatform(value, spec);
      if (snapped !== value) {
        out[key] = snapped;
        touched = true;
      }
    }
  }
  return touched ? (out as T) : el;
}

export interface ConversionSummary {
  /** Elements whose color changed because the target shows fewer colors. */
  recolored: number;
  /** Elements nudged back on screen because the target is smaller. */
  moved: number;
  /** Heart rate elements the target watch has no sensor to feed. */
  heartRateStranded: number;
}

export function summarizeConversion(
  project: WatchfaceProject,
  target: PlatformId,
): ConversionSummary {
  const spec = platformSpec(target);
  let recolored = 0;
  let moved = 0;
  let heartRateStranded = 0;
  for (const el of project.elements) {
    if (el.type === 'heartRate' && !spec.hasHeartRate) heartRateStranded += 1;
    if (quantizeElementColors(el, spec) !== el) recolored += 1;
    const fitted = fitToScreen(el, spec);
    if (fitted.x !== el.x || fitted.y !== el.y) moved += 1;
  }
  return { recolored, moved, heartRateStranded };
}

export function convertProjectToPlatform(
  project: WatchfaceProject,
  target: PlatformId,
): WatchfaceProject {
  const spec = platformSpec(target);
  const elements = project.elements.map((el) => {
    const next = quantizeElementColors(el, spec);
    return { ...next, ...fitToScreen(el, spec) } as WatchElement;
  });

  return {
    ...project,
    platform: spec.id,
    backgroundColor: quantizeToPlatform(project.backgroundColor, spec),
    elements,
  };
}

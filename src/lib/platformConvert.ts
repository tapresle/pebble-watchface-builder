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

/**
 * Elements sitting where the watch cannot show them - the same test the device
 * switch uses, so "off screen" means one thing across the app: somewhere
 * fitToScreen would have to move it.
 */
export function offScreenElements(
  project: WatchfaceProject,
  spec: PlatformSpec,
): WatchElement[] {
  return project.elements.filter((el) => {
    const fitted = fitToScreen(el, spec);
    return fitted.x !== el.x || fitted.y !== el.y;
  });
}

/**
 * Put a stray element back in the middle of the screen.
 *
 * Not the nearest legal spot: fitToScreen only guarantees EDGE_MARGIN of an
 * element stays on, which for something dragged a long way off returns it as a
 * sliver against the edge - technically rescued, still unusable. The centre is
 * somewhere you can always see the whole thing and drag it on from there.
 */
function centerOnScreen(el: WatchElement, spec: PlatformSpec): { x: number; y: number } {
  const box = elementBox(el);
  // x/y are the element's own anchor and the drawn box can sit elsewhere, so
  // the shift is applied through that offset rather than assigning directly.
  return {
    x: Math.round((spec.width - box.w) / 2) + (el.x - box.x),
    y: Math.round((spec.height - box.h) / 2) + (el.y - box.y),
  };
}

/**
 * Collect every stray element in the middle of the screen, leaving the rest
 * alone.
 *
 * A group moves as one: the shift that centres the group's bounding box is
 * applied to all of its members, so the group keeps its shape. Centring each
 * member separately would stack them on top of each other, which for the one
 * feature built to keep elements together would be a strange way to behave.
 */
export function bringOnScreen(
  project: WatchfaceProject,
  spec: PlatformSpec,
): WatchfaceProject {
  const stray = new Set(offScreenElements(project, spec).map((el) => el.id));
  if (stray.size === 0) return project;

  // One shift per group that has anything stray in it, from the group's box.
  const groupShifts = new Map<string, { dx: number; dy: number }>();
  const groupIds = new Set(
    project.elements
      .filter((el) => stray.has(el.id) && el.groupId)
      .map((el) => el.groupId as string),
  );
  for (const groupId of groupIds) {
    const members = project.elements.filter((el) => el.groupId === groupId);
    const boxes = members.map((el) => elementBox(el));
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    groupShifts.set(groupId, {
      dx: Math.round((spec.width - (right - left)) / 2) - left,
      dy: Math.round((spec.height - (bottom - top)) / 2) - top,
    });
  }

  return {
    ...project,
    elements: project.elements.map((el) => {
      const shift = el.groupId ? groupShifts.get(el.groupId) : undefined;
      // A whole group moves when any member of it is stray, so that a group
      // half off the screen arrives intact rather than torn in two.
      if (shift) return { ...el, x: el.x + shift.dx, y: el.y + shift.dy } as WatchElement;
      if (!stray.has(el.id)) return el;
      return { ...el, ...centerOnScreen(el, spec) } as WatchElement;
    }),
  };
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
  /** Compass elements the target watch has no magnetometer to feed. */
  compassStranded: number;
}

export function summarizeConversion(
  project: WatchfaceProject,
  target: PlatformId,
): ConversionSummary {
  const spec = platformSpec(target);
  let recolored = 0;
  let moved = 0;
  let heartRateStranded = 0;
  let compassStranded = 0;
  for (const el of project.elements) {
    if (el.type === 'heartRate' && !spec.hasHeartRate) heartRateStranded += 1;
    if (el.type === 'compass' && !spec.hasCompass) compassStranded += 1;
    if (quantizeElementColors(el, spec) !== el) recolored += 1;
    const fitted = fitToScreen(el, spec);
    if (fitted.x !== el.x || fitted.y !== el.y) moved += 1;
  }
  return { recolored, moved, heartRateStranded, compassStranded };
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

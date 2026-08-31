/** Factories for new elements and for the starter project. */

import type { ElementType, PlatformId, WatchElement, WatchfaceProject } from '../types';
import { elementBox, visibleWidthAt } from './geometry';
import { platformSpec, type PlatformSpec } from './platform';
import { uid, uuidv4 } from './utils';

/**
 * Default colors, per color mode. A 1-bit panel cannot lean on hue to signal
 * "low battery" or "charging", so those states start out the same white as
 * everything else and the user styles them some other way.
 */
const TOKENS = {
  // Amber and blue either side of white: complementary, legible on black, and
  // every value is on the 64-color palette so nothing gets snapped on export.
  color: {
    bg: '#000000',
    fg: '#ffffff',
    muted: '#ffaa00',
    track: '#555555',
    accent: '#00aaff',
    low: '#ff5500',
    charge: '#00ff55',
    shape: '#ffaa00',
  },
  bw: {
    bg: '#000000',
    fg: '#ffffff',
    muted: '#ffffff',
    track: '#000000',
    accent: '#ffffff',
    low: '#ffffff',
    charge: '#ffffff',
    shape: '#ffffff',
  },
} as const;

/** Exported so the device picker's preview can show the real starting colors. */
export const tokensFor = (spec: PlatformSpec) => TOKENS[spec.colorMode];

/** Descriptor used to build the "Add element" palette in the sidebar. */
export interface ElementKind {
  /** Unique palette entry id - several entries can map to the same element type. */
  paletteId: string;
  type: ElementType;
  label: string;
  hint: string;
  icon: string;
  group: 'Time & date' | 'Complications' | 'Shapes & art';
  /** Hides the entry on watches that lack the hardware to drive it. */
  requires?: (spec: PlatformSpec) => boolean;
}

/** The palette entries a given watch can actually offer. */
export function elementKindsFor(spec: PlatformSpec): ElementKind[] {
  return ELEMENT_KINDS.filter((kind) => !kind.requires || kind.requires(spec));
}

export const ELEMENT_KINDS: ElementKind[] = [
  { paletteId: 'time', type: 'time', label: 'Time', hint: 'Digital clock via strftime', icon: '🕘', group: 'Time & date' },
  { paletteId: 'date', type: 'time', label: 'Date', hint: 'Any strftime date format', icon: '📅', group: 'Time & date' },
  { paletteId: 'analog', type: 'analog', label: 'Analog dial', hint: 'Hour/minute/second hands', icon: '🧭', group: 'Time & date' },
  { paletteId: 'text', type: 'text', label: 'Static text', hint: 'A fixed label', icon: '🔤', group: 'Time & date' },
  { paletteId: 'batteryText', type: 'batteryText', label: 'Battery %', hint: 'Charge as text', icon: '🔋', group: 'Complications' },
  { paletteId: 'batteryBar', type: 'batteryBar', label: 'Battery bar', hint: 'Horizontal or vertical gauge', icon: '▭', group: 'Complications' },
  { paletteId: 'batteryRing', type: 'batteryRing', label: 'Battery ring', hint: 'Radial charge gauge', icon: '◯', group: 'Complications' },
  { paletteId: 'steps', type: 'steps', label: 'Step count', hint: 'Pebble Health steps today', icon: '👟', group: 'Complications' },
  { paletteId: 'heartRate', type: 'heartRate', label: 'Heart rate', hint: 'Live BPM from the sensor', icon: '❤️', group: 'Complications', requires: (spec) => spec.hasHeartRate },
  { paletteId: 'bluetooth', type: 'bluetooth', label: 'Bluetooth', hint: 'Connection indicator', icon: '📶', group: 'Complications' },
  { paletteId: 'weather', type: 'weather', label: 'Weather', hint: 'Temperature, rain, an icon', icon: '🌡️', group: 'Complications' },
  { paletteId: 'compass', type: 'compass', label: 'Compass', hint: 'Heading as N, NE, E…', icon: '🧭', group: 'Complications', requires: (spec) => spec.hasCompass },
  { paletteId: 'polygon', type: 'polygon', label: 'Polygon', hint: 'Rectangle, triangle, hexagon…', icon: '⬟', group: 'Shapes & art' },
  { paletteId: 'circle', type: 'circle', label: 'Circle', hint: 'Filled disc or ring', icon: '⬤', group: 'Shapes & art' },
  { paletteId: 'line', type: 'line', label: 'Line', hint: 'Straight rule or divider', icon: '➖', group: 'Shapes & art' },
  { paletteId: 'image', type: 'image', label: 'Image', hint: 'A PNG you upload', icon: '🖼️', group: 'Shapes & art' },
];

const nextName = (existing: WatchElement[], base: string): string => {
  const taken = new Set(existing.map((e) => e.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
};

export interface CreateOptions {
  paletteId: string;
  existing: WatchElement[];
  x: number;
  y: number;
  /** The watch being designed for; sizes and colors adapt to it. */
  spec: PlatformSpec;
  /** First uploaded image, used as the default for new image elements. */
  defaultImageAssetId?: string;
}

export function createElement({
  paletteId,
  existing,
  x,
  y,
  spec,
  defaultImageAssetId,
}: CreateOptions): WatchElement {
  const id = uid();
  const base = { id, x: Math.round(x), y: Math.round(y), visible: true, locked: false };
  const t = tokensFor(spec);
  // Keep new elements comfortably inside whichever screen is being targeted. On
  // a round panel that means the chord of the visible circle at the row the
  // element lands on rather than the full framebuffer width; measuring at the
  // tallest default height keeps every kind of element inside it.
  const usable = Math.floor(visibleWidthAt(spec, base.y, 46));
  const wide = Math.max(24, Math.min(spec.width, usable) - 20);
  const half = Math.max(24, Math.min(Math.round(spec.width * 0.6), usable - 20));
  const dial =
    spec.shape === 'round' ? spec.width - 24 : Math.min(spec.width - 24, spec.height - 60);

  switch (paletteId) {
    case 'time':
      return {
        ...base, type: 'time', mode: 'time', name: nextName(existing, 'Time'),
        w: wide, h: 46, align: 'center', color: t.fg,
        font: { kind: 'system', key: 'FONT_KEY_BITHAM_42_BOLD' },
        format: '%H:%M', stripLeadingZero: false, uppercase: false,
      };
    case 'date':
      return {
        ...base, type: 'time', mode: 'date', name: nextName(existing, 'Date'),
        w: wide, h: 24, align: 'center', color: t.muted,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_24_BOLD' },
        format: '%a %d %b', stripLeadingZero: false, uppercase: true,
      };
    case 'text':
      return {
        ...base, type: 'text', name: nextName(existing, 'Label'),
        w: half, h: 20, align: 'center', color: t.fg,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_18' },
        text: 'HELLO',
      };
    case 'steps':
      return {
        ...base, type: 'steps', name: nextName(existing, 'Steps'),
        w: half, h: 24, align: 'center', color: t.accent,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_24_BOLD' },
        prefix: '', suffix: ' steps', thousandsSeparator: true,
      };
    case 'heartRate':
      return {
        ...base, type: 'heartRate', name: nextName(existing, 'Heart rate'),
        w: half, h: 24, align: 'center', color: t.low,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_24_BOLD' },
        prefix: '', suffix: ' BPM', placeholder: '--',
      };
    case 'weather':
      return {
        ...base, type: 'weather', name: nextName(existing, 'Weather'),
        w: half, h: 24, align: 'center', color: t.accent,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_24_BOLD' },
        field: 'temperature', units: 'imperial', degreeSymbol: true,
        prefix: '', suffix: '', placeholder: '--',
      };
    case 'compass':
      return {
        ...base, type: 'compass', name: nextName(existing, 'Compass'),
        w: half, h: 24, align: 'center', color: t.muted,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_24_BOLD' },
        display: 'cardinal', points: 8, prefix: '', suffix: '', placeholder: '--',
      };
    case 'batteryText':
      return {
        ...base, type: 'batteryText', name: nextName(existing, 'Battery %'),
        w: 80, h: 20, align: 'right', color: t.fg,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_18_BOLD' },
        prefix: '', suffix: '%', lowColor: t.low, lowThreshold: 20, chargingColor: t.charge,
      };
    case 'batteryBar':
      return {
        ...base, type: 'batteryBar', name: nextName(existing, 'Battery bar'),
        w: half, h: 12, orientation: 'horizontal', reverse: false,
        backgroundColor: t.track, fillColor: t.accent, borderColor: t.fg, borderWidth: 1,
        lowColor: t.low, lowThreshold: 20, chargingColor: t.charge, padding: 2, radius: 0,
      };
    case 'batteryRing':
      return {
        ...base, type: 'batteryRing', name: nextName(existing, 'Battery ring'),
        size: 60, thickness: 6, backgroundColor: t.track, fillColor: t.accent,
        lowColor: t.low, lowThreshold: 20, chargingColor: t.charge, startAngle: 0, sweep: 360,
      };
    case 'bluetooth':
      return {
        ...base, type: 'bluetooth', name: nextName(existing, 'Bluetooth'),
        w: 60, h: 20, align: 'center', color: t.fg,
        font: { kind: 'system', key: 'FONT_KEY_GOTHIC_18_BOLD' },
        style: 'dot', connectedText: 'BT', disconnectedText: 'BT',
        connectedColor: t.accent, disconnectedColor: t.low,
        hideWhenConnected: false, markSize: 10, radius: 0,
      };
    case 'polygon':
      return {
        ...base, type: 'polygon', name: nextName(existing, 'Polygon'),
        w: half, h: 40, sides: 4, rotation: 45,
        fill: true, fillColor: t.shape, strokeWidth: 0, strokeColor: t.fg, radius: 0,
        roundedJoins: false,
      };
    case 'circle':
      return {
        ...base, type: 'circle', name: nextName(existing, 'Circle'),
        size: 60, fill: true, fillColor: t.accent, strokeWidth: 0, strokeColor: t.fg,
      };
    case 'line':
      return {
        ...base, type: 'line', name: nextName(existing, 'Line'),
        length: half, angle: 0, color: t.fg, width: 2, roundedEnds: false,
      };
    case 'image':
      return {
        ...base, type: 'image', name: nextName(existing, 'Image'),
        assetId: defaultImageAssetId ?? '', w: 60, h: 60,
      };
    case 'analog':
      return {
        ...base, type: 'analog', name: nextName(existing, 'Analog dial'),
        size: dial,
        showHour: true, showMinute: true, showSecond: false,
        hourColor: t.fg, minuteColor: t.fg, secondColor: t.low,
        hourWidth: 5, minuteWidth: 3, secondWidth: 1,
        hourLength: 55, minuteLength: 82, secondLength: 90,
        showTicks: true, tickColor: t.muted, tickLength: 8, tickWidth: 1, minuteTicks: false,
        showCenterDot: true, centerDotColor: t.fg, centerDotRadius: 4,
        roundedHands: false, roundedTicks: false,
      };
    default:
      throw new Error(`Unknown element kind: ${paletteId}`);
  }
}

export function createStarterProject(platform: PlatformId = 'emery'): WatchfaceProject {
  const spec = platformSpec(platform);
  const elements: WatchElement[] = [];
  // Lay the starter out proportionally so it looks right on any of the screens.
  const rowY = (fraction: number) => Math.round(spec.height * fraction);
  const addCentered = (paletteId: string, y: number) => {
    const el = createElement({ paletteId, existing: elements, spec, x: 0, y });
    elements.push({ ...el, x: Math.round((spec.width - elementBox(el).w) / 2) });
  };

  addCentered('time', rowY(0.32));
  addCentered('date', rowY(0.545));
  addCentered('batteryBar', rowY(0.74));

  return {
    schemaVersion: 1,
    platform: spec.id,
    name: 'My Watchface',
    author: 'Me',
    uuid: uuidv4(),
    version: '1.0',
    backgroundColor: tokensFor(spec).bg,
    elements,
    fonts: [],
    images: [],
    options: {
      forceSecondTicks: false,
      vibeOnDisconnect: false,
      weatherApiKey: '',
      weatherRefreshMinutes: 30,
    },
  };
}

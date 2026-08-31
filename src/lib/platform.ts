/**
 * Hardware facts for the supported watches, plus the Pebble system font catalog.
 *
 * Everything platform-specific is funnelled through this module: screen size,
 * screen shape, how many colors the panel can show, and which SDK platform slug
 * the export targets. Adding Basalt or Chalk later means adding an entry to
 * PLATFORMS.
 */

export type PlatformId = 'emery' | 'flint' | 'gabbro';

export interface PlatformSpec {
  id: PlatformId;
  /** Product name shown throughout the UI. */
  name: string;
  /** SDK platform slug used in package.json targetPlatforms. */
  sdkPlatform: string;
  width: number;
  height: number;
  /**
   * Round panels still hand the app a square framebuffer of width x height; the
   * pixels outside the inscribed circle simply are not displayed. Coordinates
   * are unaffected, so only the preview and the default layouts care.
   */
  shape: 'rect' | 'round';
  /** Corner radius of a rectangular screen, for the preview chrome only. */
  screenRadius: number;
  /**
   * Bezel around the screen in the simulated case, in screen pixels, even on
   * every side. Preview chrome only, but it lives here so the canvas and the
   * device picker scale the same number rather than each guessing.
   */
  bezel: number;
  colorMode: 'color' | 'bw';
  colorCount: number;
  /** Colors the panel can actually show, ordered for the swatch grid. */
  palette: string[];
  /** Grid columns to lay the palette out in. */
  paletteColumns: number;
  /** Case treatment for the preview shell. */
  shell: 'metal' | 'plastic';
  /** Whether the watch has an optical heart rate sensor. */
  hasHeartRate: boolean;
  /** Whether the watch has a magnetometer to drive a compass. */
  hasCompass: boolean;
}

/* ------------------------------------------------------------------ *
 * Color palettes
 * ------------------------------------------------------------------ */

/** Every channel on a color Pebble is 2 bits, so only these levels exist. */
export const CHANNEL_LEVELS = [0x00, 0x55, 0xaa, 0xff] as const;

const toHexByte = (n: number) => n.toString(16).padStart(2, '0');

/** The full 64-color Pebble palette, ordered for a readable 8x8 swatch grid. */
export const PEBBLE_PALETTE: string[] = (() => {
  const out: string[] = [];
  for (const r of CHANNEL_LEVELS) {
    for (const g of CHANNEL_LEVELS) {
      for (const b of CHANNEL_LEVELS) {
        out.push(`#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`);
      }
    }
  }
  return out;
})();

/** A 1-bit panel has exactly these two. */
export const MONO_PALETTE: string[] = ['#000000', '#ffffff'];

/* ------------------------------------------------------------------ *
 * Platforms
 * ------------------------------------------------------------------ */

export const PEBBLE_TIME_2: PlatformSpec = {
  id: 'emery',
  name: 'Pebble Time 2',
  sdkPlatform: 'emery',
  width: 200,
  height: 228,
  shape: 'rect',
  screenRadius: 8,
  bezel: 24,
  colorMode: 'color',
  colorCount: 64,
  palette: PEBBLE_PALETTE,
  paletteColumns: 8,
  shell: 'metal',
  hasHeartRate: true,
  hasCompass: true,
};

export const CORE_2_DUO: PlatformSpec = {
  id: 'flint',
  name: 'Core 2 Duo',
  sdkPlatform: 'flint',
  width: 144,
  height: 168,
  shape: 'rect',
  screenRadius: 8,
  bezel: 24,
  colorMode: 'bw',
  colorCount: 2,
  palette: MONO_PALETTE,
  paletteColumns: 2,
  shell: 'plastic',
  hasHeartRate: false,
  hasCompass: true,
};

export const PEBBLE_ROUND_2: PlatformSpec = {
  id: 'gabbro',
  name: 'Pebble Round 2',
  sdkPlatform: 'gabbro',
  width: 260,
  height: 260,
  shape: 'round',
  screenRadius: 0,
  bezel: 20,
  colorMode: 'color',
  colorCount: 64,
  palette: PEBBLE_PALETTE,
  paletteColumns: 8,
  shell: 'metal',
  hasHeartRate: false,
  hasCompass: true,
};

export const PLATFORMS: Record<PlatformId, PlatformSpec> = {
  emery: PEBBLE_TIME_2,
  flint: CORE_2_DUO,
  gabbro: PEBBLE_ROUND_2,
};

export const PLATFORM_LIST: PlatformSpec[] = [PEBBLE_TIME_2, CORE_2_DUO, PEBBLE_ROUND_2];

export const DEFAULT_PLATFORM: PlatformId = 'emery';

export function platformSpec(id: PlatformId | undefined): PlatformSpec {
  return (id && PLATFORMS[id]) || PLATFORMS[DEFAULT_PLATFORM];
}

/* ------------------------------------------------------------------ *
 * Color helpers
 * ------------------------------------------------------------------ */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Perceived brightness, 0..1. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Relative luminance, used to pick a readable outline for swatches. */
export function isLight(hex: string): boolean {
  return luminance(hex) > 0.6;
}

const nearestLevel = (v: number) =>
  CHANNEL_LEVELS.reduce((best, level) =>
    Math.abs(level - v) < Math.abs(best - v) ? level : best,
  );

/** Snap a color to the nearest one the given watch can actually show. */
export function quantizeToPlatform(hex: string, spec: PlatformSpec): string {
  if (spec.colorMode === 'bw') {
    return luminance(hex) >= 0.5 ? '#ffffff' : '#000000';
  }
  const { r, g, b } = hexToRgb(hex);
  return `#${toHexByte(nearestLevel(r))}${toHexByte(nearestLevel(g))}${toHexByte(nearestLevel(b))}`;
}

/* ------------------------------------------------------------------ *
 * System fonts
 * ------------------------------------------------------------------ */

export interface SystemFont {
  /** FONT_KEY_* constant used with fonts_get_system_font(). */
  key: string;
  label: string;
  /** Line height in pixels. The number in the font key is exactly this. */
  height: number;
  /**
   * Cap height in pixels, measured off the reference renderings Core Devices
   * publishes for each font key on Emery. The preview sizes its substitute to
   * hit this, which is what keeps text the right size on screen.
   */
  capHeight: number;
  /** CSS stack standing in for the real typeface in the browser. */
  cssStack: string;
  cssWeight: number;
  /**
   * Whether cssStack is the genuine typeface Pebble uses, a descendant of it,
   * or an unrelated lookalike. Surfaced in the inspector so the preview does
   * not overstate itself.
   */
  fidelity: 'exact' | 'descendant' | 'lookalike';
  /** Letters this font can render; the LECO family is digits-only. */
  coverage: 'full' | 'numbers' | 'numbers+ampm';
  group: string;
}

/*
 * The typefaces behind the system fonts, per Core Devices' own documentation:
 * Gothic is Mark Simonson's Raster Gothic, Bitham is Gotham, and LECO is
 * LECO 1976. Those three are commercial and cannot be bundled, so each has a
 * stand-in. Roboto and Droid Serif are open, so those are the real thing.
 */
// Raster Gothic is a condensed bitmap grotesque. Measured against the reference
// renderings, Roboto Condensed is the closest widely-available stand-in:
// Gothic 28 Bold's digits come out 17% wide against Inter's 40%.
const GOTHIC = `'Roboto Condensed', 'Arial Narrow', 'Inter', sans-serif`;
const GOTHAM = `'Montserrat', 'Century Gothic', 'Futura', 'Inter', sans-serif`;
const ROBOTO_CONDENSED = `'Roboto Condensed', 'Arial Narrow', 'Inter', sans-serif`;
const ROBOTO = `'Roboto', 'Helvetica Neue', Arial, sans-serif`;
const DROID_SERIF = `'Noto Serif', 'Droid Serif', Georgia, serif`;
const LECO = `'Chakra Petch', 'Rajdhani', 'JetBrains Mono', monospace`;

export const SYSTEM_FONTS: SystemFont[] = [
  { key: 'FONT_KEY_GOTHIC_14', label: 'Gothic 14', height: 14, capHeight: 9, cssStack: GOTHIC, cssWeight: 400, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_14_BOLD', label: 'Gothic 14 Bold', height: 14, capHeight: 9, cssStack: GOTHIC, cssWeight: 700, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_18', label: 'Gothic 18', height: 18, capHeight: 11, cssStack: GOTHIC, cssWeight: 400, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_18_BOLD', label: 'Gothic 18 Bold', height: 18, capHeight: 11, cssStack: GOTHIC, cssWeight: 700, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_24', label: 'Gothic 24', height: 24, capHeight: 14, cssStack: GOTHIC, cssWeight: 400, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_24_BOLD', label: 'Gothic 24 Bold', height: 24, capHeight: 14, cssStack: GOTHIC, cssWeight: 700, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_28', label: 'Gothic 28', height: 28, capHeight: 18, cssStack: GOTHIC, cssWeight: 400, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_GOTHIC_28_BOLD', label: 'Gothic 28 Bold', height: 28, capHeight: 18, cssStack: GOTHIC, cssWeight: 700, fidelity: 'lookalike', coverage: 'full', group: 'Gothic' },
  { key: 'FONT_KEY_BITHAM_30_BLACK', label: 'Bitham 30 Black', height: 30, capHeight: 21, cssStack: GOTHAM, cssWeight: 900, fidelity: 'lookalike', coverage: 'full', group: 'Bitham' },
  { key: 'FONT_KEY_BITHAM_34_MEDIUM_NUMBERS', label: 'Bitham 34 Numbers', height: 34, capHeight: 24, cssStack: GOTHAM, cssWeight: 500, fidelity: 'lookalike', coverage: 'numbers', group: 'Bitham' },
  { key: 'FONT_KEY_BITHAM_42_BOLD', label: 'Bitham 42 Bold', height: 42, capHeight: 30, cssStack: GOTHAM, cssWeight: 700, fidelity: 'lookalike', coverage: 'full', group: 'Bitham' },
  { key: 'FONT_KEY_BITHAM_42_LIGHT', label: 'Bitham 42 Light', height: 42, capHeight: 31, cssStack: GOTHAM, cssWeight: 300, fidelity: 'lookalike', coverage: 'full', group: 'Bitham' },
  { key: 'FONT_KEY_BITHAM_42_MEDIUM_NUMBERS', label: 'Bitham 42 Numbers', height: 42, capHeight: 30, cssStack: GOTHAM, cssWeight: 500, fidelity: 'lookalike', coverage: 'numbers', group: 'Bitham' },
  { key: 'FONT_KEY_ROBOTO_CONDENSED_21', label: 'Roboto Condensed 21', height: 21, capHeight: 15, cssStack: ROBOTO_CONDENSED, cssWeight: 400, fidelity: 'exact', coverage: 'full', group: 'Roboto' },
  { key: 'FONT_KEY_ROBOTO_BOLD_SUBSET_49', label: 'Roboto Bold 49 (digits)', height: 49, capHeight: 35, cssStack: ROBOTO, cssWeight: 700, fidelity: 'exact', coverage: 'numbers', group: 'Roboto' },
  { key: 'FONT_KEY_DROID_SERIF_28_BOLD', label: 'Droid Serif 28 Bold', height: 28, capHeight: 20, cssStack: DROID_SERIF, cssWeight: 700, fidelity: 'descendant', coverage: 'full', group: 'Droid' },
  { key: 'FONT_KEY_LECO_20_BOLD_NUMBERS', label: 'LECO 20 Numbers', height: 20, capHeight: 14, cssStack: LECO, cssWeight: 700, fidelity: 'lookalike', coverage: 'numbers', group: 'LECO' },
  { key: 'FONT_KEY_LECO_26_BOLD_NUMBERS_AM_PM', label: 'LECO 26 Numbers + AM/PM', height: 26, capHeight: 18, cssStack: LECO, cssWeight: 700, fidelity: 'lookalike', coverage: 'numbers+ampm', group: 'LECO' },
  { key: 'FONT_KEY_LECO_28_LIGHT_NUMBERS', label: 'LECO 28 Light Numbers', height: 28, capHeight: 20, cssStack: LECO, cssWeight: 400, fidelity: 'lookalike', coverage: 'numbers', group: 'LECO' },
  { key: 'FONT_KEY_LECO_32_BOLD_NUMBERS', label: 'LECO 32 Numbers', height: 32, capHeight: 22, cssStack: LECO, cssWeight: 700, fidelity: 'lookalike', coverage: 'numbers', group: 'LECO' },
  { key: 'FONT_KEY_LECO_36_BOLD_NUMBERS', label: 'LECO 36 Numbers', height: 36, capHeight: 25, cssStack: LECO, cssWeight: 700, fidelity: 'lookalike', coverage: 'numbers', group: 'LECO' },
  { key: 'FONT_KEY_LECO_38_BOLD_NUMBERS', label: 'LECO 38 Numbers', height: 38, capHeight: 27, cssStack: LECO, cssWeight: 700, fidelity: 'lookalike', coverage: 'numbers', group: 'LECO' },
  { key: 'FONT_KEY_LECO_42_NUMBERS', label: 'LECO 42 Numbers', height: 42, capHeight: 29, cssStack: LECO, cssWeight: 400, fidelity: 'lookalike', coverage: 'numbers', group: 'LECO' },
];

export const SYSTEM_FONT_BY_KEY = new Map(SYSTEM_FONTS.map((f) => [f.key, f]));

/** Which real typeface each family is, for the note shown under the font picker. */
const REAL_TYPEFACE: Record<string, string> = {
  Gothic: 'Raster Gothic',
  Bitham: 'Gotham',
  LECO: 'LECO 1976',
};

/**
 * Plain-language description of how close the preview gets. Sizing is always
 * right - every substitute is scaled to the real font's measured cap height -
 * so the only thing that varies is the letterforms and the advance widths.
 */
export function fidelityNote(font: SystemFont): string {
  const substitute = font.cssStack.split(',')[0]!.replace(/'/g, '');
  if (font.fidelity === 'exact') {
    return `Previewed in ${substitute}, the same typeface the watch uses.`;
  }
  if (font.fidelity === 'descendant') {
    return `Previewed in ${substitute}, the direct successor to the watch's Droid Serif. Very close.`;
  }
  const real = REAL_TYPEFACE[font.group] ?? 'a commercial typeface';
  return (
    `The watch uses ${real}, which is commercial and cannot be bundled here. ` +
    `Previewed in ${substitute} at the real font's cap height, so the size is right ` +
    `but the letterforms and text widths differ.`
  );
}

export function systemFont(key: string): SystemFont {
  return SYSTEM_FONT_BY_KEY.get(key) ?? SYSTEM_FONTS[4]!;
}

/* ------------------------------------------------------------------ *
 * strftime helpers
 * ------------------------------------------------------------------ */

/**
 * Format presets. Only the name is fixed; the example beside it in the picker
 * is rendered from the clock the preview is showing, so it is never a stale
 * date from whenever this list was written.
 */
export interface FormatPreset {
  name: string;
  format: string;
}

export const TIME_FORMAT_PRESETS: FormatPreset[] = [
  { name: '24 hour', format: '%H:%M' },
  { name: '24 hour with seconds', format: '%H:%M:%S' },
  { name: '12 hour', format: '%I:%M' },
  { name: '12 hour with AM/PM', format: '%I:%M %p' },
  { name: '12 hour with seconds', format: '%I:%M:%S %p' },
  { name: 'Hour only', format: '%H' },
  { name: 'Minute only', format: '%M' },
  { name: 'Seconds only', format: '%S' },
];

export const DATE_FORMAT_PRESETS: FormatPreset[] = [
  { name: 'Short day and date', format: '%a %d' },
  { name: 'Weekday', format: '%A' },
  { name: 'Month and date', format: '%b %d' },
  { name: 'Date and month', format: '%d %b' },
  { name: 'Day/month', format: '%d/%m' },
  { name: 'Month/day/year', format: '%m/%d/%Y' },
  { name: 'ISO date', format: '%Y-%m-%d' },
  { name: 'Full date', format: '%A, %B %d' },
  { name: 'Day of year', format: '%j' },
  { name: 'Week number', format: '%V' },
];

/**
 * Whether a format string is a clock or a calendar.
 *
 * Time and date elements are the same underlying type, told apart by their
 * mode. This is the fallback for an element saved before that field existed.
 */
export function inferTimeMode(format: string): 'time' | 'date' {
  return /%[-_0^#]?\d*[HIMSpRTrXc]/.test(format) ? 'time' : 'date';
}

/** Formats that make the watchface need a per-second tick. */
export function formatNeedsSeconds(format: string): boolean {
  return /%[-_0^#]?\d*[ST]/.test(format);
}

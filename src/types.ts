/**
 * Project data model for the Pebble Watchface Builder.
 *
 * Everything the user creates lives in a `WatchfaceProject`, which is a plain
 * JSON-serializable object. That keeps save/load, undo/redo, and code generation
 * trivial: the generator is a pure function of this document.
 */

import type { PlatformId } from './lib/platform';
import type { CompassDisplay, CompassPoints } from './lib/compass';
import type { WeatherCondition, WeatherField, WeatherUnits } from './lib/weather';

export type { PlatformId };

export type Hex = string; // '#RRGGBB', always quantized to the target watch's palette.

/** Which font a text-drawing element uses. */
export type FontRef =
  | { kind: 'system'; key: string } // key is a FONT_KEY_* name, e.g. 'FONT_KEY_GOTHIC_24_BOLD'
  | { kind: 'custom'; fontId: string; size: number };

export type TextAlign = 'left' | 'center' | 'right';

/** A TTF/OTF the user uploaded. Bytes are kept as base64 so the project is pure JSON. */
export interface CustomFont {
  id: string;
  /** Original file name, e.g. 'Montserrat-Bold.ttf'. */
  fileName: string;
  /** Resource identifier stem in SCREAMING_SNAKE_CASE, e.g. 'MONTSERRAT_BOLD'. */
  identifier: string;
  /** base64 of the raw font file (no data: prefix). */
  data: string;
  /** Optional character subset regex passed to the resource, shrinks the built font. */
  characterRegex: string;
}

/** A PNG the user uploaded, exported as a Pebble bitmap resource. */
export interface ImageAsset {
  id: string;
  fileName: string;
  /** Resource identifier, e.g. 'IMG_BACKGROUND'. */
  identifier: string;
  /** base64 of the raw PNG bytes, always the original the user uploaded. */
  data: string;
  width: number;
  height: number;
  /**
   * How to reduce this image to the target watch's palette. Unset until the user
   * chooses, so the default can follow the watch; see reduceOptions().
   */
  reduce?: { mode: 'flat' | 'dither'; threshold: number };
  /** Whether the uploaded PNG has any transparent pixels. */
  hasAlpha?: boolean;
  /**
   * Compositing mode used to draw it. 'assign' replaces the pixels underneath;
   * 'set' is the only mode that honors transparency, but on a 1-bit watch it
   * means "paint white where the source is black, leave the rest alone".
   */
  compositing?: 'assign' | 'set';
}

export type ElementType =
  | 'time'
  | 'text'
  | 'steps'
  | 'heartRate'
  | 'weather'
  | 'compass'
  | 'batteryText'
  | 'batteryBar'
  | 'batteryRing'
  | 'bluetooth'
  | 'polygon'
  | 'circle'
  | 'line'
  | 'image'
  | 'analog';

interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  /**
   * Elements sharing a groupId move as one: selecting any member selects them
   * all. Optional because most elements are not grouped, and because schema 1
   * documents predate it - absent reads the same as ungrouped, which is why
   * opening one needs no conversion beyond stamping the new version.
   */
  groupId?: string;
}

/** Shared properties of every element that draws text into a box. */
interface TextBoxBase extends ElementBase {
  w: number;
  h: number;
  align: TextAlign;
  color: Hex;
  font: FontRef;
}

export interface TimeElement extends TextBoxBase {
  type: 'time';
  /**
   * Whether this is a clock or a calendar. Both are the same element under the
   * hood, since both are just strftime; the mode is what keeps the format
   * picker showing only the presets that belong to one of them.
   */
  mode: 'time' | 'date';
  /** strftime format string handed to Pebble's strftime(), e.g. '%H:%M'. */
  format: string;
  /** Remove a leading '0' from the rendered string (Pebble has no portable %-I). */
  stripLeadingZero: boolean;
  /** Force uppercase, handy for '%a' / '%b'. */
  uppercase: boolean;
}

export interface TextElement extends TextBoxBase {
  type: 'text';
  text: string;
}

export interface StepsElement extends TextBoxBase {
  type: 'steps';
  prefix: string;
  suffix: string;
  /** Insert a ',' every three digits. */
  thousandsSeparator: boolean;
}

export interface HeartRateElement extends TextBoxBase {
  type: 'heartRate';
  prefix: string;
  suffix: string;
  /** Shown when the sensor has no reading yet, or the watch has no sensor. */
  placeholder: string;
}

/**
 * One weather reading. The numbers come from a PebbleKit JS companion on the
 * phone rather than from the watch, so every one of these has a placeholder for
 * the window before the first message arrives.
 */
export interface WeatherElement extends TextBoxBase {
  type: 'weather';
  /** Which reading to show. 'icon' draws the condition artwork instead of text. */
  field: WeatherField;
  /** Whether temperatures read in Celsius or Fahrenheit, and wind in km/h or mph. */
  units: WeatherUnits;
  /** Append a degree sign to temperatures. */
  degreeSymbol: boolean;
  prefix: string;
  suffix: string;
  /** Shown until the phone sends a reading. */
  placeholder: string;
}

/**
 * A magnetometer reading, named as a compass point.
 *
 * The magnetometer is off until something subscribes to it, so adding one of
 * these has a real battery cost. The reading on screen is refreshed on a fixed
 * interval rather than on every wobble, which keeps redraws down.
 */
export interface CompassElement extends TextBoxBase {
  type: 'compass';
  /** Whether to show the sector name, the raw bearing, or both. */
  display: CompassDisplay;
  /** How finely the heading is named. */
  points: CompassPoints;
  prefix: string;
  suffix: string;
  /** Shown while the compass is still calibrating, which happens often. */
  placeholder: string;
}

export interface BatteryTextElement extends TextBoxBase {
  type: 'batteryText';
  prefix: string;
  suffix: string;
  /** Swap to `lowColor` at or below `lowThreshold` percent. */
  lowColor: Hex;
  lowThreshold: number;
  chargingColor: Hex;
}

export interface BatteryBarElement extends ElementBase {
  type: 'batteryBar';
  w: number;
  h: number;
  orientation: 'horizontal' | 'vertical';
  /** Grow the fill from the opposite end. */
  reverse: boolean;
  backgroundColor: Hex;
  fillColor: Hex;
  borderColor: Hex;
  borderWidth: number;
  lowColor: Hex;
  lowThreshold: number;
  chargingColor: Hex;
  /** Inset between the border and the fill, in pixels. */
  padding: number;
  /** Corner radius of the track, the fill, and the border. */
  radius: number;
}

export interface BatteryRingElement extends ElementBase {
  type: 'batteryRing';
  /** Outer diameter; the ring is drawn inside a square box at (x, y). */
  size: number;
  thickness: number;
  backgroundColor: Hex;
  fillColor: Hex;
  lowColor: Hex;
  lowThreshold: number;
  chargingColor: Hex;
  /** Degrees clockwise from 12 o'clock where the gauge starts. */
  startAngle: number;
  /** Total sweep in degrees for a full battery. */
  sweep: number;
}

export interface BluetoothElement extends TextBoxBase {
  type: 'bluetooth';
  style: 'text' | 'dot' | 'bar';
  connectedText: string;
  disconnectedText: string;
  connectedColor: Hex;
  disconnectedColor: Hex;
  hideWhenConnected: boolean;
  /** Used by the 'dot' and 'bar' styles. */
  markSize: number;
  /** Corner radius of the 'bar' style. */
  radius: number;
}

/**
 * A regular polygon inscribed in its bounding box. Four sides at 45 degrees is
 * an axis-aligned rectangle, which is what this element starts as.
 */
export interface PolygonElement extends ElementBase {
  type: 'polygon';
  w: number;
  h: number;
  /** 3 = triangle, 4 = rectangle/diamond, and so on. */
  sides: number;
  /** Degrees clockwise. 45 on a 4-gon squares it up with the screen. */
  rotation: number;
  fill: boolean;
  fillColor: Hex;
  strokeWidth: number;
  strokeColor: Hex;
  /**
   * Corner radius. Only meaningful while the shape is an axis-aligned
   * rectangle, because the SDK can only round the corners of a GRect.
   */
  radius: number;
  /**
   * Soften the corners of the outline on shapes that are not rectangles, by
   * capping each vertex with a disc. The fill underneath still has hard
   * corners; the SDK cannot round an arbitrary path.
   */
  roundedJoins: boolean;
}

export interface CircleElement extends ElementBase {
  type: 'circle';
  /** Diameter; (x, y) is the top-left of the bounding square. */
  size: number;
  fill: boolean;
  fillColor: Hex;
  strokeWidth: number;
  strokeColor: Hex;
}

export interface LineElement extends ElementBase {
  type: 'line';
  /** Distance from (x, y) to the far end, in pixels. */
  length: number;
  /** Degrees clockwise from horizontal. 0 points right, 90 points down. */
  angle: number;
  color: Hex;
  width: number;
  /** Round off both ends instead of cutting them square. */
  roundedEnds: boolean;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  assetId: string;
  w: number;
  h: number;
}

export interface AnalogElement extends ElementBase {
  type: 'analog';
  /** Diameter of the dial; (x, y) is its top-left corner. */
  size: number;
  showHour: boolean;
  showMinute: boolean;
  showSecond: boolean;
  hourColor: Hex;
  minuteColor: Hex;
  secondColor: Hex;
  hourWidth: number;
  minuteWidth: number;
  secondWidth: number;
  /** Hand lengths as a percentage of the dial radius. */
  hourLength: number;
  minuteLength: number;
  secondLength: number;
  showTicks: boolean;
  tickColor: Hex;
  tickLength: number;
  tickWidth: number;
  /** Draw a tick every 5 minutes instead of every hour. */
  minuteTicks: boolean;
  showCenterDot: boolean;
  centerDotColor: Hex;
  centerDotRadius: number;
  /** Round the ends of the hands. */
  roundedHands: boolean;
  /** Round the ends of the tick marks. */
  roundedTicks: boolean;
}

export type WatchElement =
  | TimeElement
  | TextElement
  | StepsElement
  | HeartRateElement
  | WeatherElement
  | CompassElement
  | BatteryTextElement
  | BatteryBarElement
  | BatteryRingElement
  | BluetoothElement
  | PolygonElement
  | CircleElement
  | LineElement
  | ImageElement
  | AnalogElement;

export interface WatchfaceProject {
  /**
   * Document format version. 2 added element grouping; see SCHEMA_VERSION and
   * READABLE_VERSIONS in store.tsx for which versions this build opens.
   */
  schemaVersion: 2;
  /** Which watch this face is laid out for. */
  platform: PlatformId;
  /** Human name; also becomes the CloudPebble project / app name. */
  name: string;
  author: string;
  uuid: string;
  version: string;
  backgroundColor: Hex;
  elements: WatchElement[];
  fonts: CustomFont[];
  images: ImageAsset[];
  /** Toggles the "quiet time"/background-safe helpers in generated code. */
  options: {
    /** Redraw every second (forced on when a second-precision element exists). */
    forceSecondTicks: boolean;
    /** Emit the vibrate-on-bluetooth-disconnect handler. */
    vibeOnDisconnect: boolean;
    /**
     * OpenWeatherMap API key, baked into the generated companion JS. Only used
     * when the face has a weather element; the user supplies their own.
     */
    weatherApiKey: string;
    /** How often the watch asks the phone for fresh weather, in minutes. */
    weatherRefreshMinutes: number;
  };
}

/** Preview clock state, so the canvas can show a chosen time rather than "now". */
export interface PreviewState {
  useLiveTime: boolean;
  hour: number;
  minute: number;
  second: number;
  /** ISO day-of-month/month used when the clock is frozen. */
  day: number;
  month: number; // 0-11
  year: number;
  battery: number;
  charging: boolean;
  bluetooth: boolean;
  steps: number;
  heartRate: number;
  /** Stand-in weather, so weather elements have something to draw. */
  weatherCondition: WeatherCondition;
  /** Preview temperature in whole degrees Celsius. */
  weatherTempC: number;
  weatherRainChance: number;
  /** Preview compass bearing in degrees clockwise from north. */
  compassHeading: number;
}

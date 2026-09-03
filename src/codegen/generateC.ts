/**
 * Emits the `main.c` for a Pebble C SDK watchface.
 *
 * The generated program keeps a single Layer whose update procedure draws every
 * element in z-order, which maps one-to-one onto the builder's layer list and
 * keeps the output easy to read and hand-edit afterwards.
 *
 * Every element's block opens with the values that drive it, declared as named
 * constants, so a value can be found and changed in CloudPebble without reading
 * the drawing code underneath it. A constant is only declared where the code
 * below actually reads it: the build compiles with -Wall -Wextra -Werror, so an
 * unused one would fail the build rather than mislead.
 */

import type {
  AnalogElement,
  BatteryBarElement,
  BatteryRingElement,
  BatteryTextElement,
  BluetoothElement,
  CircleElement,
  CompassElement,
  FontRef,
  Hex,
  HeartRateElement,
  ImageElement,
  LineElement,
  PolygonElement,
  StepsElement,
  TextAlign,
  TextElement,
  TimeElement,
  WatchElement,
  WatchfaceProject,
  WeatherElement,
} from '../types';
import { hexToRgb, inferTimeMode, luminance, platformSpec, type PlatformSpec } from '../lib/platform';
import { isAxisAlignedRect } from '../lib/geometry';
import { COMPASS_NAMES, COMPASS_REFRESH_MS } from '../lib/compass';
import { compositingFor } from '../lib/imageConvert';
import {
  CONDITION_ICON,
  CONDITION_LABEL,
  WEATHER_CONDITIONS,
  WEATHER_FIELDS,
  WEATHER_TEXT_BYTES,
  temperatureUnitLabel,
  windUnitLabel,
} from '../lib/weather';
import { cString } from '../lib/utils';
import type { ProjectAnalysis } from './analyze';

/**
 * A 1-bit watch has no GColorFromRGB worth speaking of, so mono targets emit the
 * two named constants directly and colors are thresholded on the way out.
 */
const makeColor = (spec: PlatformSpec) => (hex: Hex): string => {
  if (spec.colorMode === 'bw') {
    return luminance(hex) >= 0.5 ? 'GColorWhite' : 'GColorBlack';
  }
  const { r, g, b } = hexToRgb(hex);
  return `GColorFromRGB(${r}, ${g}, ${b})`;
};

/** Escape a literal for use inside a printf-style format string. */
const fmtLiteral = (s: string): string => cString(s).replace(/%/g, '%%');

const align = (a: TextAlign): string =>
  a === 'left' ? 'GTextAlignmentLeft' : a === 'right' ? 'GTextAlignmentRight' : 'GTextAlignmentCenter';

interface Ctx {
  analysis: ProjectAnalysis;
  spec: PlatformSpec;
  /** Renders a hex color as the right C expression for this platform. */
  color: (hex: Hex) => string;
  /** Declarations for the text buffers each element needs. */
  buffers: { name: string; size: number; owner: string }[];
  helpers: Set<HelperName>;
}

type HelperName =
  | 'roundCap'
  | 'fillPoly'
  | 'clampRadius'
  | 'lineEnd'
  | 'buildPolygon'
  | 'strip'
  | 'upper'
  | 'thousands'
  | 'tenths'
  | 'conditionLabel'
  | 'compassPoint';

/** Emitted in this order, so a helper is always defined before one that uses it. */
const HELPER_ORDER = [
  'roundCap',
  'fillPoly',
  'clampRadius',
  'lineEnd',
  'buildPolygon',
  'strip',
  'upper',
  'thousands',
  'tenths',
  'conditionLabel',
  'compassPoint',
] as const;

const INDENT = '    ';

/**
 * Collects the tunables of one element so they can be declared together at the
 * top of its block.
 *
 * Every method registers on the way past and hands back the C name to use, so a
 * constant only exists when the drawing code below really reads it. Asking for
 * the same one twice reuses the first declaration.
 */
interface Consts {
  int(suffix: string, value: number, comment?: string): string;
  color(suffix: string, hex: Hex): string;
  /** A string constant; the value is escaped on the way out. */
  str(suffix: string, value: string, comment?: string): string;
  /** A string constant whose body is already escaped, e.g. a printf format. */
  lit(suffix: string, escapedBody: string, comment?: string): string;
  raw(suffix: string, type: string, expr: string, comment?: string): string;
  /** A comment of its own, for something the next few constants share. */
  note(text: string): void;
  /** The declarations, in the order they were first asked for. */
  lines(): string[];
}

function makeConsts(prefix: string, ctx: Ctx): Consts {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (suffix: string, decl: (name: string) => string, comment?: string): string => {
    const name = `${prefix}_${suffix}`;
    if (!seen.has(suffix)) {
      seen.add(suffix);
      if (comment) out.push(`${INDENT}// ${comment}`);
      out.push(`${INDENT}${decl(name)}`);
    }
    return name;
  };

  return {
    int: (suffix, value, comment) => add(suffix, (n) => `const int ${n} = ${value};`, comment),
    color: (suffix, hex) => add(suffix, (n) => `const GColor ${n} = ${ctx.color(hex)};`),
    str: (suffix, value, comment) =>
      add(suffix, (n) => `const char *const ${n} = "${cString(value)}";`, comment),
    lit: (suffix, body, comment) =>
      add(suffix, (n) => `const char *const ${n} = "${body}";`, comment),
    raw: (suffix, type, expr, comment) => add(suffix, (n) => `const ${type} ${n} = ${expr};`, comment),
    note: (text) => {
      out.push(`${INDENT}// ${text}`);
    },
    lines: () => out,
  };
}

/**
 * A greppable prefix for an element's constants, taken from the name in the
 * builder so the generated C points back at the layer list.
 */
function constPrefix(name: string, type: string, taken: Set<string>): string {
  const clean = (s: string) =>
    s
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  // A name that is empty or starts with a digit cannot be a C identifier, so the
  // element type stands in for it.
  let base = clean(name);
  if (!base || /^[0-9]/.test(base)) base = clean(type) || 'ELEMENT';
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

function fontExpr(font: FontRef, ctx: Ctx): string {
  if (font.kind === 'system') return `fonts_get_system_font(${font.key})`;
  const used = ctx.analysis.fonts.find(
    (f) => f.font.id === font.fontId && f.size === Math.round(font.size),
  );
  // A dangling custom-font reference degrades to a system font rather than
  // producing code that will not compile.
  return used ? used.varName : 'fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD)';
}

/**
 * A text buffer for one element. The size follows the text it was generated for
 * but never drops below a floor, so a format string that is edited a little
 * longer still fits; snprintf truncates rather than overflowing either way.
 */
function bufferFor(ctx: Ctx, prefix: string, size: number, cap = 64): string {
  const name = `s_${prefix.toLowerCase()}_text`;
  ctx.buffers.push({ name, size: Math.min(cap, Math.max(32, size)), owner: prefix });
  return name;
}

interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  align: TextAlign;
  color: Hex;
  font: FontRef;
}

interface TextConsts {
  x: string;
  y: string;
  w: string;
  h: string;
  color: string;
  font: string;
  align: string;
}

function boxConsts(el: { x: number; y: number; w: number; h: number }, k: Consts) {
  return {
    x: k.int('POS_X', el.x),
    y: k.int('POS_Y', el.y),
    w: k.int('WIDTH', el.w),
    h: k.int('HEIGHT', el.h),
  };
}

/**
 * The box, color, font, and alignment every text-drawing element shares. The
 * color is skipped for elements that pick one at draw time.
 */
function textConsts(el: TextBox, ctx: Ctx, k: Consts, withColor = true): TextConsts {
  const box = boxConsts(el, k);
  return {
    ...box,
    color: withColor ? k.color('COLOR', el.color) : '',
    font: k.raw('FONT', 'GFont', fontExpr(el.font, ctx)),
    align: k.raw('ALIGN', 'GTextAlignment', align(el.align)),
  };
}

function drawText(textExpr: string, t: TextConsts, indent: string): string {
  return (
    `${indent}graphics_draw_text(ctx, ${textExpr}, ${t.font},\n` +
    `${indent}                   GRect(${t.x}, ${t.y}, ${t.w}, ${t.h}),\n` +
    `${indent}                   GTextOverflowModeWordWrap, ${t.align}, NULL);`
  );
}

/** Emits the picker that swaps in the charging / low-battery color. */
function batteryColorBlock(
  varName: string,
  normal: string,
  charging: string,
  low: string,
  threshold: string,
  indent: string,
): string {
  return [
    `${indent}GColor ${varName} = ${normal};`,
    `${indent}if (s_battery_charging) {`,
    `${indent}  ${varName} = ${charging};`,
    `${indent}} else if (s_battery_percent <= ${threshold}) {`,
    `${indent}  ${varName} = ${low};`,
    `${indent}}`,
  ].join('\n');
}

/** The four colors and the threshold that every battery element shares. */
function batteryConsts(
  el: { lowColor: Hex; lowThreshold: number; chargingColor: Hex },
  k: Consts,
): { low: string; charging: string; threshold: string } {
  return {
    low: k.color('LOW_COLOR', el.lowColor),
    charging: k.color('CHARGING_COLOR', el.chargingColor),
    threshold: k.int('LOW_THRESHOLD', el.lowThreshold, 'battery percent at or below which LOW_COLOR is used'),
  };
}

const i = INDENT;

function emitTime(el: TimeElement, ctx: Ctx, k: Consts, prefix: string): string {
  boxConsts(el, k);
  const format = k.str('FORMAT', el.format, 'strftime format');
  const t = textConsts(el, ctx, k);
  const buf = bufferFor(ctx, prefix, el.format.length * 4 + 12);

  let body = `${i}strftime(${buf}, sizeof(${buf}), ${format}, &s_now);\n`;
  if (el.stripLeadingZero) {
    ctx.helpers.add('strip');
    body += `${i}strip_leading_zero(${buf});\n`;
  }
  if (el.uppercase) {
    ctx.helpers.add('upper');
    body += `${i}text_to_upper(${buf});\n`;
  }
  body += `${i}graphics_context_set_text_color(ctx, ${t.color});\n`;
  return body + drawText(buf, t, i);
}

function emitText(el: TextElement, ctx: Ctx, k: Consts): string {
  boxConsts(el, k);
  const text = k.str('TEXT', el.text);
  const t = textConsts(el, ctx, k);
  return `${i}graphics_context_set_text_color(ctx, ${t.color});\n` + drawText(text, t, i);
}

function emitSteps(el: StepsElement, ctx: Ctx, k: Consts, prefix: string): string {
  boxConsts(el, k);
  const spec = el.thousandsSeparator ? '%s' : '%d';
  const format = k.lit(
    'FORMAT',
    `${fmtLiteral(el.prefix)}${spec}${fmtLiteral(el.suffix)}`,
    'the step count is substituted in',
  );
  const t = textConsts(el, ctx, k);
  const buf = bufferFor(ctx, prefix, 24 + el.prefix.length + el.suffix.length);

  let body = `${i}int steps = 0;\n`;
  body += `${i}#if defined(PBL_HEALTH)\n`;
  body += `${i}steps = (int)health_service_sum_today(HealthMetricStepCount);\n`;
  body += `${i}#endif\n`;
  if (el.thousandsSeparator) {
    ctx.helpers.add('thousands');
    body += `${i}char steps_str[16];\n`;
    body += `${i}format_thousands(steps, steps_str, sizeof(steps_str));\n`;
    body += `${i}snprintf(${buf}, sizeof(${buf}), ${format}, steps_str);\n`;
  } else {
    body += `${i}snprintf(${buf}, sizeof(${buf}), ${format}, steps);\n`;
  }
  body += `${i}graphics_context_set_text_color(ctx, ${t.color});\n`;
  return body + drawText(buf, t, i);
}

function emitHeartRate(el: HeartRateElement, ctx: Ctx, k: Consts, prefix: string): string {
  boxConsts(el, k);
  const format = k.lit('FORMAT', `${fmtLiteral(el.prefix)}%d${fmtLiteral(el.suffix)}`, 'the reading is substituted in');
  const placeholder = k.str('PLACEHOLDER', el.placeholder, 'shown when no reading is available');
  const t = textConsts(el, ctx, k);
  const buf = bufferFor(
    ctx,
    prefix,
    20 + el.prefix.length + el.suffix.length + el.placeholder.length,
  );

  let body = `${i}int bpm = 0;\n`;
  body += `${i}#if defined(PBL_HEALTH)\n`;
  body += `${i}if (health_service_metric_accessible(HealthMetricHeartRateBPM, time(NULL), time(NULL)) &\n`;
  body += `${i}    HealthServiceAccessibilityMaskAvailable) {\n`;
  body += `${i}  bpm = (int)health_service_peek_current_value(HealthMetricHeartRateBPM);\n`;
  body += `${i}}\n`;
  body += `${i}#endif\n`;
  body += `${i}if (bpm > 0) {\n`;
  body += `${i}  snprintf(${buf}, sizeof(${buf}), ${format}, bpm);\n`;
  body += `${i}} else {\n`;
  body += `${i}  snprintf(${buf}, sizeof(${buf}), "%s", ${placeholder});\n`;
  body += `${i}}\n`;
  body += `${i}graphics_context_set_text_color(ctx, ${t.color});\n`;
  return body + drawText(buf, t, i);
}

function emitWeather(el: WeatherElement, ctx: Ctx, k: Consts, prefix: string): string {
  if (el.field === 'icon') {
    const box = boxConsts(el, k);
    const color = k.color('COLOR', el.color);
    // The condition starts at -1, so nothing is drawn until the phone has
    // actually reported something.
    return (
      `${i}if (s_weather_condition >= 0) {\n` +
      `${i}  draw_weather_icon(ctx, GRect(${box.x}, ${box.y}, ${box.w}, ${box.h}),\n` +
      `${i}                    s_weather_condition, ${color});\n` +
      `${i}}`
    );
  }

  // Temperatures arrive as tenths of a degree Celsius and wind as tenths of a
  // km/h, so every display value is a rounded conversion of an integer.
  const whole = (expr: string) => {
    ctx.helpers.add('tenths');
    return `tenths_to_whole(${expr})`;
  };
  const temp = (varName: string) =>
    el.units === 'imperial' ? whole(`(${varName} * 9) / 5 + 320`) : whole(varName);
  const degree = el.degreeSymbol ? `°${temperatureUnitLabel(el.units)}` : '';

  let spec: string;
  let valueExpr: string;
  let unitSuffix = '';
  switch (el.field) {
    case 'temperature': spec = '%d'; valueExpr = temp('s_weather_temp'); unitSuffix = degree; break;
    case 'feelsLike': spec = '%d'; valueExpr = temp('s_weather_feels_like'); unitSuffix = degree; break;
    case 'high': spec = '%d'; valueExpr = temp('s_weather_high'); unitSuffix = degree; break;
    case 'low': spec = '%d'; valueExpr = temp('s_weather_low'); unitSuffix = degree; break;
    case 'rainChance': spec = '%d'; valueExpr = 's_weather_rain_chance'; unitSuffix = '%'; break;
    case 'humidity': spec = '%d'; valueExpr = 's_weather_humidity'; unitSuffix = '%'; break;
    case 'wind':
      spec = '%d';
      valueExpr =
        el.units === 'imperial' ? whole('(s_weather_wind * 1000) / 1609') : whole('s_weather_wind');
      unitSuffix = ` ${windUnitLabel(el.units)}`;
      break;
    case 'condition':
      spec = '%s';
      valueExpr = 'weather_condition_label(s_weather_condition)';
      ctx.helpers.add('conditionLabel');
      break;
    default:
      spec = '%s';
      valueExpr = 's_weather_location';
      break;
  }

  boxConsts(el, k);
  const format = k.lit(
    'FORMAT',
    `${fmtLiteral(el.prefix)}${spec}${fmtLiteral(unitSuffix)}${fmtLiteral(el.suffix)}`,
    'the reading is substituted in',
  );
  const placeholder = k.str('PLACEHOLDER', el.placeholder, 'shown until the phone reports in');
  const t = textConsts(el, ctx, k);
  const buf = bufferFor(
    ctx,
    prefix,
    WEATHER_TEXT_BYTES + 8 + el.prefix.length + el.suffix.length + el.placeholder.length,
    96,
  );

  let body = `${i}if (s_weather_ready) {\n`;
  body += `${i}  snprintf(${buf}, sizeof(${buf}), ${format}, ${valueExpr});\n`;
  body += `${i}} else {\n`;
  body += `${i}  snprintf(${buf}, sizeof(${buf}), "%s", ${placeholder});\n`;
  body += `${i}}\n`;
  body += `${i}graphics_context_set_text_color(ctx, ${t.color});\n`;
  return body + drawText(buf, t, i);
}

function emitCompass(el: CompassElement, ctx: Ctx, k: Consts, prefix: string): string {
  boxConsts(el, k);
  const pre = fmtLiteral(el.prefix);
  const suf = fmtLiteral(el.suffix);
  const format =
    el.display === 'cardinal'
      ? k.lit('FORMAT', `${pre}%s${suf}`, 'the direction is substituted in')
      : el.display === 'degrees'
        ? k.lit('FORMAT', `${pre}%d°${suf}`, 'the bearing is substituted in')
        : k.lit('FORMAT', `${pre}%s %d°${suf}`, 'the direction and then the bearing are substituted in');
  const points =
    el.display === 'degrees'
      ? ''
      : k.int('POINTS', el.points, 'how many named directions: 4, 8 or 16');
  const placeholder = k.str('PLACEHOLDER', el.placeholder, 'shown while the heading is unknown');
  const t = textConsts(el, ctx, k);
  const buf = bufferFor(
    ctx,
    prefix,
    20 + el.prefix.length + el.suffix.length + el.placeholder.length,
  );

  let body = `${i}if (s_compass_heading >= 0) {\n`;
  if (el.display === 'cardinal') {
    ctx.helpers.add('compassPoint');
    body += `${i}  snprintf(${buf}, sizeof(${buf}), ${format}, compass_point(s_compass_heading, ${points}));\n`;
  } else if (el.display === 'degrees') {
    body += `${i}  snprintf(${buf}, sizeof(${buf}), ${format}, s_compass_heading);\n`;
  } else {
    ctx.helpers.add('compassPoint');
    body += `${i}  snprintf(${buf}, sizeof(${buf}), ${format},\n`;
    body += `${i}           compass_point(s_compass_heading, ${points}), s_compass_heading);\n`;
  }
  body += `${i}} else {\n`;
  body += `${i}  snprintf(${buf}, sizeof(${buf}), "%s", ${placeholder});\n`;
  body += `${i}}\n`;
  body += `${i}graphics_context_set_text_color(ctx, ${t.color});\n`;
  return body + drawText(buf, t, i);
}

function emitBatteryText(el: BatteryTextElement, ctx: Ctx, k: Consts, prefix: string): string {
  boxConsts(el, k);
  const format = k.lit(
    'FORMAT',
    `${fmtLiteral(el.prefix)}%d${fmtLiteral(el.suffix)}`,
    'the percentage is substituted in',
  );
  const t = textConsts(el, ctx, k);
  const battery = batteryConsts(el, k);
  const buf = bufferFor(ctx, prefix, 12 + el.prefix.length + el.suffix.length);

  let body = `${i}snprintf(${buf}, sizeof(${buf}), ${format}, s_battery_percent);\n`;
  body += `${batteryColorBlock('text_color', t.color, battery.charging, battery.low, battery.threshold, i)}\n`;
  body += `${i}graphics_context_set_text_color(ctx, text_color);\n`;
  return body + drawText(buf, t, i);
}

function emitBatteryBar(el: BatteryBarElement, k: Consts, ctx: Ctx): string {
  const box = boxConsts(el, k);
  const padding = k.int('PADDING', el.padding, 'gap between the border and the track');
  const radius = k.int('RADIUS', el.radius, 'corner radius, clamped to half the shorter side');
  const border = el.borderWidth > 0
    ? { width: k.int('BORDER_WIDTH', el.borderWidth), color: k.color('BORDER_COLOR', el.borderColor) }
    : null;
  const background = k.color('BACKGROUND_COLOR', el.backgroundColor);
  const fill = k.color('FILL_COLOR', el.fillColor);
  const battery = batteryConsts(el, k);
  ctx.helpers.add('clampRadius');

  let body = `${i}GRect frame = GRect(${box.x}, ${box.y}, ${box.w}, ${box.h});\n`;
  body += `${i}const int inset = ${border ? `${border.width} + ${padding}` : padding};\n`;
  body += `${i}int track_w = frame.size.w - inset * 2;\n`;
  body += `${i}int track_h = frame.size.h - inset * 2;\n`;
  body += `${i}if (track_w < 0) track_w = 0;\n`;
  body += `${i}if (track_h < 0) track_h = 0;\n`;
  body += `${i}GRect track = GRect(frame.origin.x + inset, frame.origin.y + inset, track_w, track_h);\n`;
  body += `${i}const int track_radius = clamp_radius(${radius}, track);\n`;
  body += `${batteryColorBlock('bar_color', fill, battery.charging, battery.low, battery.threshold, i)}\n`;
  body += `${i}graphics_context_set_fill_color(ctx, ${background});\n`;
  body += `${i}graphics_fill_rect(ctx, track, track_radius, GCornersAll);\n`;
  if (el.orientation === 'horizontal') {
    body += `${i}int filled = (track.size.w * s_battery_percent) / 100;\n`;
    body += el.reverse
      ? `${i}GRect level = GRect(track.origin.x + track.size.w - filled, track.origin.y, filled, track.size.h);\n`
      : `${i}GRect level = GRect(track.origin.x, track.origin.y, filled, track.size.h);\n`;
  } else {
    body += `${i}int filled = (track.size.h * s_battery_percent) / 100;\n`;
    body += el.reverse
      ? `${i}GRect level = GRect(track.origin.x, track.origin.y, track.size.w, filled);\n`
      : `${i}GRect level = GRect(track.origin.x, track.origin.y + track.size.h - filled, track.size.w, filled);\n`;
  }
  body += `${i}graphics_context_set_fill_color(ctx, bar_color);\n`;
  body += `${i}graphics_fill_rect(ctx, level, track_radius, GCornersAll);`;
  if (border) {
    body += `\n${i}graphics_context_set_stroke_color(ctx, ${border.color});\n`;
    body += `${i}graphics_context_set_stroke_width(ctx, ${border.width});\n`;
    body += `${i}graphics_draw_round_rect(ctx, frame, clamp_radius(${radius}, frame));\n`;
    body += `${i}graphics_context_set_stroke_width(ctx, 1);`;
  }
  return body;
}

function emitBatteryRing(el: BatteryRingElement, k: Consts): string {
  const x = k.int('POS_X', el.x);
  const y = k.int('POS_Y', el.y);
  const size = k.int('SIZE', el.size);
  const thickness = k.int('THICKNESS', el.thickness);
  const start = k.int('START_ANGLE', el.startAngle, 'degrees clockwise from 12 o\'clock');
  const sweep = k.int('SWEEP', el.sweep, 'how far a full battery travels, in degrees');
  const background = k.color('BACKGROUND_COLOR', el.backgroundColor);
  const fill = k.color('FILL_COLOR', el.fillColor);
  const battery = batteryConsts(el, k);

  let body = `${i}GRect ring = GRect(${x}, ${y}, ${size}, ${size});\n`;
  body += `${batteryColorBlock('ring_color', fill, battery.charging, battery.low, battery.threshold, i)}\n`;
  body += `${i}graphics_context_set_fill_color(ctx, ${background});\n`;
  body += `${i}graphics_fill_radial(ctx, ring, GOvalScaleModeFitCircle, ${thickness},\n`;
  body += `${i}                     DEG_TO_TRIGANGLE(${start}), DEG_TO_TRIGANGLE(${start} + ${sweep}));\n`;
  body += `${i}int32_t sweep_end = ${start} + (${sweep} * s_battery_percent) / 100;\n`;
  body += `${i}graphics_context_set_fill_color(ctx, ring_color);\n`;
  body += `${i}graphics_fill_radial(ctx, ring, GOvalScaleModeFitCircle, ${thickness},\n`;
  body += `${i}                     DEG_TO_TRIGANGLE(${start}), DEG_TO_TRIGANGLE(sweep_end));`;
  return body;
}

function emitBluetooth(el: BluetoothElement, ctx: Ctx, k: Consts): string {
  const inner = el.hideWhenConnected ? `${i}  ` : i;
  let body = '';
  let colors: { connected: string; disconnected: string };

  if (el.style === 'text') {
    boxConsts(el, k);
    const connectedText = k.str('CONNECTED_TEXT', el.connectedText);
    const disconnectedText = k.str('DISCONNECTED_TEXT', el.disconnectedText);
    colors = {
      connected: k.color('CONNECTED_COLOR', el.connectedColor),
      disconnected: k.color('DISCONNECTED_COLOR', el.disconnectedColor),
    };
    const t = textConsts(el, ctx, k, false);
    if (el.hideWhenConnected) body += `${i}if (!s_bt_connected) {\n`;
    body += `${inner}GColor bt_color = s_bt_connected ? ${colors.connected} : ${colors.disconnected};\n`;
    body += `${inner}const char *bt_text = s_bt_connected ? ${connectedText} : ${disconnectedText};\n`;
    body += `${inner}graphics_context_set_text_color(ctx, bt_color);\n`;
    body += drawText('bt_text', t, inner);
  } else if (el.style === 'dot') {
    const x = k.int('POS_X', el.x);
    const y = k.int('POS_Y', el.y);
    const size = k.int('MARK_SIZE', el.markSize, 'diameter of the dot');
    colors = {
      connected: k.color('CONNECTED_COLOR', el.connectedColor),
      disconnected: k.color('DISCONNECTED_COLOR', el.disconnectedColor),
    };
    if (el.hideWhenConnected) body += `${i}if (!s_bt_connected) {\n`;
    body += `${inner}GColor bt_color = s_bt_connected ? ${colors.connected} : ${colors.disconnected};\n`;
    body += `${inner}int dot_radius = (${size} + 1) / 2;\n`;
    body += `${inner}if (dot_radius < 1) dot_radius = 1;\n`;
    body += `${inner}graphics_context_set_fill_color(ctx, bt_color);\n`;
    body += `${inner}graphics_fill_circle(ctx, GPoint(${x} + dot_radius, ${y} + dot_radius), dot_radius);`;
  } else {
    const box = boxConsts(el, k);
    const radius = k.int('RADIUS', el.radius, 'corner radius, clamped to half the shorter side');
    colors = {
      connected: k.color('CONNECTED_COLOR', el.connectedColor),
      disconnected: k.color('DISCONNECTED_COLOR', el.disconnectedColor),
    };
    ctx.helpers.add('clampRadius');
    if (el.hideWhenConnected) body += `${i}if (!s_bt_connected) {\n`;
    body += `${inner}GColor bt_color = s_bt_connected ? ${colors.connected} : ${colors.disconnected};\n`;
    body += `${inner}GRect bar = GRect(${box.x}, ${box.y}, ${box.w}, ${box.h});\n`;
    body += `${inner}graphics_context_set_fill_color(ctx, bt_color);\n`;
    body += `${inner}graphics_fill_rect(ctx, bar, clamp_radius(${radius}, bar), GCornersAll);`;
  }

  if (el.hideWhenConnected) body += `\n${i}}`;
  return body;
}

function emitPolygon(el: PolygonElement, ctx: Ctx, k: Consts): string {
  const box = boxConsts(el, k);

  // A rectangle goes through graphics_fill_rect so its corners can be rounded;
  // the SDK cannot round an arbitrary path.
  if (isAxisAlignedRect(el.sides, el.rotation)) {
    const radius =
      el.fill || el.strokeWidth > 0
        ? k.int('RADIUS', el.radius, 'corner radius, clamped to half the shorter side')
        : '';
    const fillColor = el.fill ? k.color('FILL_COLOR', el.fillColor) : '';
    const stroke =
      el.strokeWidth > 0
        ? { color: k.color('STROKE_COLOR', el.strokeColor), width: k.int('STROKE_WIDTH', el.strokeWidth) }
        : null;
    if (radius) ctx.helpers.add('clampRadius');

    let body = `${i}GRect box = GRect(${box.x}, ${box.y}, ${box.w}, ${box.h});\n`;
    if (el.fill) {
      body += `${i}graphics_context_set_fill_color(ctx, ${fillColor});\n`;
      body += `${i}graphics_fill_rect(ctx, box, clamp_radius(${radius}, box), GCornersAll);\n`;
    }
    if (stroke) {
      body += `${i}graphics_context_set_stroke_color(ctx, ${stroke.color});\n`;
      body += `${i}graphics_context_set_stroke_width(ctx, ${stroke.width});\n`;
      body += `${i}graphics_draw_round_rect(ctx, box, clamp_radius(${radius}, box));\n`;
      body += `${i}graphics_context_set_stroke_width(ctx, 1);\n`;
    }
    if (!el.fill && !stroke) body += `${i}(void)box;\n`;
    return body.replace(/\n$/, '');
  }

  const sides = k.int('SIDES', Math.round(el.sides));
  const rotation = k.int('ROTATION', Math.round(el.rotation), 'degrees clockwise');
  const fillColor = el.fill ? k.color('FILL_COLOR', el.fillColor) : '';
  const stroke =
    el.strokeWidth > 0
      ? { color: k.color('STROKE_COLOR', el.strokeColor), width: k.int('STROKE_WIDTH', el.strokeWidth) }
      : null;
  ctx.helpers.add('buildPolygon');

  let body = `${i}GPoint pts[POLYGON_MAX_POINTS];\n`;
  body += `${i}int point_count = build_polygon(pts, ${sides}, ${rotation},\n`;
  body += `${i}                                GRect(${box.x}, ${box.y}, ${box.w}, ${box.h}));\n`;
  if (el.fill) {
    ctx.helpers.add('fillPoly');
    body += `${i}graphics_context_set_fill_color(ctx, ${fillColor});\n`;
    body += `${i}fill_poly(ctx, pts, point_count);\n`;
  }
  if (stroke) {
    body += `${i}graphics_context_set_stroke_color(ctx, ${stroke.color});\n`;
    body += `${i}graphics_context_set_stroke_width(ctx, ${stroke.width});\n`;
    body += `${i}for (int v = 0; v < point_count; v++) {\n`;
    body += `${i}  graphics_draw_line(ctx, pts[v], pts[(v + 1) % point_count]);\n`;
    body += `${i}}\n`;
    if (el.roundedJoins) {
      // The SDK cannot round a path's joins, so each vertex gets a disc.
      ctx.helpers.add('roundCap');
      body += `${i}graphics_context_set_fill_color(ctx, ${stroke.color});\n`;
      body += `${i}for (int v = 0; v < point_count; v++) {\n`;
      body += `${i}  draw_round_cap(ctx, pts[v], ${stroke.width});\n`;
      body += `${i}}\n`;
    }
    body += `${i}graphics_context_set_stroke_width(ctx, 1);\n`;
  }
  if (!el.fill && !stroke) body += `${i}(void)point_count;\n`;
  return body.replace(/\n$/, '');
}

function emitCircle(el: CircleElement, k: Consts): string {
  const x = k.int('POS_X', el.x);
  const y = k.int('POS_Y', el.y);
  const size = k.int('SIZE', el.size, 'diameter');
  const fillColor = el.fill ? k.color('FILL_COLOR', el.fillColor) : '';
  const stroke =
    el.strokeWidth > 0
      ? { color: k.color('STROKE_COLOR', el.strokeColor), width: k.int('STROKE_WIDTH', el.strokeWidth) }
      : null;

  let body = `${i}int radius = ${size} / 2;\n`;
  body += `${i}if (radius < 1) radius = 1;\n`;
  body += `${i}GPoint center = GPoint(${x} + radius, ${y} + radius);\n`;
  if (el.fill) {
    body += `${i}graphics_context_set_fill_color(ctx, ${fillColor});\n`;
    body += `${i}graphics_fill_circle(ctx, center, radius);\n`;
  }
  if (stroke) {
    body += `${i}int outline = radius - ${stroke.width} / 2;\n`;
    body += `${i}if (outline < 1) outline = 1;\n`;
    body += `${i}graphics_context_set_stroke_color(ctx, ${stroke.color});\n`;
    body += `${i}graphics_context_set_stroke_width(ctx, ${stroke.width});\n`;
    body += `${i}graphics_draw_circle(ctx, center, outline);\n`;
    body += `${i}graphics_context_set_stroke_width(ctx, 1);\n`;
  }
  if (!el.fill && !stroke) body += `${i}(void)center;\n`;
  return body.replace(/\n$/, '');
}

function emitLine(el: LineElement, ctx: Ctx, k: Consts): string {
  const x = k.int('POS_X', el.x);
  const y = k.int('POS_Y', el.y);
  const length = k.int('LENGTH', el.length);
  const angle = k.int('ANGLE', el.angle, 'degrees clockwise from pointing right');
  const width = k.int('WIDTH', Math.max(1, el.width), 'stroke thickness');
  const color = k.color('COLOR', el.color);
  ctx.helpers.add('lineEnd');

  let body = `${i}GPoint start = GPoint(${x}, ${y});\n`;
  body += `${i}GPoint end = line_end(start, ${length}, ${angle});\n`;
  body += `${i}graphics_context_set_stroke_color(ctx, ${color});\n`;
  body += `${i}graphics_context_set_stroke_width(ctx, ${width});\n`;
  body += `${i}graphics_draw_line(ctx, start, end);\n`;
  if (el.roundedEnds) {
    ctx.helpers.add('roundCap');
    body += `${i}graphics_context_set_fill_color(ctx, ${color});\n`;
    body += `${i}draw_round_cap(ctx, start, ${width});\n`;
    body += `${i}draw_round_cap(ctx, end, ${width});\n`;
  }
  body += `${i}graphics_context_set_stroke_width(ctx, 1);`;
  return body;
}

function emitImage(el: ImageElement, ctx: Ctx, k: Consts): string {
  const used = ctx.analysis.images.find(
    (img) => img.asset.id === el.assetId && img.width === el.w && img.height === el.h,
  );
  if (!used) return '';

  const x = k.int('POS_X', el.x);
  const y = k.int('POS_Y', el.y);
  // graphics_draw_bitmap_in_rect neither scales nor stretches, so the resource
  // is built at exactly this size and a different one here crops instead.
  k.note('the bitmap resource is built at exactly this size, so changing these');
  k.note('crops the image rather than scaling it');
  const w = k.int('WIDTH', el.w);
  const h = k.int('HEIGHT', el.h);

  // GCompOpSet is only right for a bitmap with transparency. On an opaque 1-bit
  // image it paints white wherever the source is black and leaves the rest
  // untouched, which makes the image look inverted or vanish.
  const mode =
    compositingFor(used.asset, ctx.spec.colorMode) === 'set' ? 'GCompOpSet' : 'GCompOpAssign';
  let body = `${i}graphics_context_set_compositing_mode(ctx, ${mode});\n`;
  body += `${i}graphics_draw_bitmap_in_rect(ctx, ${used.varName}, GRect(${x}, ${y}, ${w}, ${h}));\n`;
  body += `${i}graphics_context_set_compositing_mode(ctx, GCompOpAssign);`;
  return body;
}

function emitAnalog(el: AnalogElement, ctx: Ctx, k: Consts): string {
  const x = k.int('POS_X', el.x);
  const y = k.int('POS_Y', el.y);
  const size = k.int('SIZE', el.size, 'diameter of the dial');
  const radiusUsed = el.showTicks || el.showHour || el.showMinute || el.showSecond;
  const centerUsed = radiusUsed || el.showCenterDot;

  let body = `${i}const int radius = ${size} / 2;\n`;
  body += `${i}GPoint center = GPoint(${x} + radius, ${y} + radius);\n`;
  if (!radiusUsed) body += `${i}(void)radius;\n`;
  if (!centerUsed) body += `${i}(void)center;\n`;

  if (el.showTicks) {
    const tickColor = k.color('TICK_COLOR', el.tickColor);
    const tickCount = k.int('TICK_COUNT', el.minuteTicks ? 60 : 12);
    const tickLength = k.int('TICK_LENGTH', el.tickLength, 'how far each tick reaches inwards');
    const tickWidth = k.int('TICK_WIDTH', Math.max(1, el.tickWidth));
    body += `${i}graphics_context_set_stroke_color(ctx, ${tickColor});\n`;
    body += `${i}graphics_context_set_stroke_width(ctx, ${tickWidth});\n`;
    if (el.roundedTicks) {
      body += `${i}graphics_context_set_fill_color(ctx, ${tickColor});\n`;
    }
    body += `${i}for (int t = 0; t < ${tickCount}; t++) {\n`;
    body += `${i}  int32_t a = (TRIG_MAX_ANGLE * t) / ${tickCount};\n`;
    body += `${i}  int32_t s = sin_lookup(a), c = cos_lookup(a);\n`;
    body += `${i}  GPoint outer = GPoint(center.x + (int16_t)((s * radius) / TRIG_MAX_RATIO),\n`;
    body += `${i}                        center.y - (int16_t)((c * radius) / TRIG_MAX_RATIO));\n`;
    body += `${i}  GPoint inner = GPoint(center.x + (int16_t)((s * (radius - ${tickLength})) / TRIG_MAX_RATIO),\n`;
    body += `${i}                        center.y - (int16_t)((c * (radius - ${tickLength})) / TRIG_MAX_RATIO));\n`;
    body += `${i}  graphics_draw_line(ctx, inner, outer);\n`;
    if (el.roundedTicks) {
      ctx.helpers.add('roundCap');
      body += `${i}  draw_round_cap(ctx, inner, ${tickWidth});\n`;
      body += `${i}  draw_round_cap(ctx, outer, ${tickWidth});\n`;
    }
    body += `${i}}\n`;
  }

  if (el.roundedHands && (el.showHour || el.showMinute || el.showSecond)) {
    ctx.helpers.add('roundCap');
  }

  const hand = (
    label: string,
    suffix: string,
    angleExpr: string,
    lengthPct: number,
    width: number,
    hex: Hex,
  ): string => {
    const color = k.color(`${suffix}_COLOR`, hex);
    const handWidth = k.int(`${suffix}_WIDTH`, Math.max(1, width));
    const handLength = k.int(`${suffix}_LENGTH`, lengthPct, 'percent of the dial radius');
    return (
      [
        `${i}{`,
        `${i}  int32_t angle_${label} = ${angleExpr};`,
        `${i}  int len_${label} = (radius * ${handLength}) / 100;`,
        `${i}  GPoint tip_${label} = GPoint(center.x + (int16_t)((sin_lookup(angle_${label}) * len_${label}) / TRIG_MAX_RATIO),`,
        `${i}                               center.y - (int16_t)((cos_lookup(angle_${label}) * len_${label}) / TRIG_MAX_RATIO));`,
        `${i}  graphics_context_set_stroke_color(ctx, ${color});`,
        `${i}  graphics_context_set_stroke_width(ctx, ${handWidth});`,
        `${i}  graphics_draw_line(ctx, center, tip_${label});`,
        ...(el.roundedHands
          ? [
              `${i}  graphics_context_set_fill_color(ctx, ${color});`,
              `${i}  draw_round_cap(ctx, center, ${handWidth});`,
              `${i}  draw_round_cap(ctx, tip_${label}, ${handWidth});`,
            ]
          : []),
        `${i}}`,
      ].join('\n') + '\n'
    );
  };

  if (el.showHour) {
    body += hand(
      'hour',
      'HOUR',
      '(TRIG_MAX_ANGLE * (((s_now.tm_hour % 12) * 60) + s_now.tm_min)) / (12 * 60)',
      el.hourLength, el.hourWidth, el.hourColor,
    );
  }
  if (el.showMinute) {
    body += hand('minute', 'MINUTE', '(TRIG_MAX_ANGLE * s_now.tm_min) / 60', el.minuteLength, el.minuteWidth, el.minuteColor);
  }
  if (el.showSecond) {
    body += hand('second', 'SECOND', '(TRIG_MAX_ANGLE * s_now.tm_sec) / 60', el.secondLength, el.secondWidth, el.secondColor);
  }
  body += `${i}graphics_context_set_stroke_width(ctx, 1);\n`;
  if (el.showCenterDot) {
    const dotColor = k.color('CENTER_DOT_COLOR', el.centerDotColor);
    const dotRadius = k.int('CENTER_DOT_RADIUS', el.centerDotRadius);
    body += `${i}graphics_context_set_fill_color(ctx, ${dotColor});\n`;
    body += `${i}graphics_fill_circle(ctx, center, ${dotRadius});\n`;
  }
  return body.replace(/\n$/, '');
}

/**
 * What a block actually draws, for its header comment.
 *
 * Several types cover more than one thing, and the type name on its own can be
 * wrong about which: a date is a time element, a rectangle is a polygon that
 * takes a completely different path through the SDK, and a weather icon is not
 * text at all. Someone scanning for a block is looking for the thing, not for
 * the field the model happens to discriminate on.
 */
function elementLabel(el: WatchElement): string {
  switch (el.type) {
    // A project saved before `mode` existed has none, so fall back the way the
    // inspector does rather than labelling it "undefined".
    case 'time':
      return el.mode === 'time' || el.mode === 'date' ? el.mode : inferTimeMode(el.format);
    case 'polygon':
      return isAxisAlignedRect(el.sides, el.rotation) ? 'rectangle' : 'polygon';
    case 'bluetooth':
      return `bluetooth - ${el.style}`;
    case 'weather': {
      // The same wording the field carries in the inspector, so the comment
      // matches whatever was picked there.
      const field = WEATHER_FIELDS.find((f) => f.value === el.field);
      return field ? `weather - ${field.label.toLowerCase()}` : 'weather';
    }
    default:
      return el.type;
  }
}

function emitElement(el: WatchElement, prefix: string, ctx: Ctx): string {
  const k = makeConsts(prefix, ctx);
  let body = '';

  switch (el.type) {
    case 'time': body = emitTime(el, ctx, k, prefix); break;
    case 'text': body = emitText(el, ctx, k); break;
    case 'steps': body = emitSteps(el, ctx, k, prefix); break;
    case 'heartRate': body = emitHeartRate(el, ctx, k, prefix); break;
    case 'weather': body = emitWeather(el, ctx, k, prefix); break;
    case 'compass': body = emitCompass(el, ctx, k, prefix); break;
    case 'batteryText': body = emitBatteryText(el, ctx, k, prefix); break;
    case 'batteryBar': body = emitBatteryBar(el, k, ctx); break;
    case 'batteryRing': body = emitBatteryRing(el, k); break;
    case 'bluetooth': body = emitBluetooth(el, ctx, k); break;
    case 'polygon': body = emitPolygon(el, ctx, k); break;
    case 'circle': body = emitCircle(el, k); break;
    case 'line': body = emitLine(el, ctx, k); break;
    case 'image': body = emitImage(el, ctx, k); break;
    case 'analog': body = emitAnalog(el, ctx, k); break;
  }

  if (!body) return '';
  const declarations = k.lines();
  const head = `  // ---- ${el.name} (${elementLabel(el)}) ----\n  {\n`;
  return head + (declarations.length ? `${declarations.join('\n')}\n\n` : '') + body + '\n  }\n';
}

const HELPER_SOURCE: Record<HelperName, string> = {
  roundCap: `// Pebble's thick lines have square ends and there is no cap setting, so a
// rounded end is a disc dropped on the endpoint. Below three pixels the disc
// would not show, so it is skipped.
static void draw_round_cap(GContext *ctx, GPoint point, int width) {
  if (width > 2) {
    graphics_fill_circle(ctx, point, width / 2);
  }
}
`,
  fillPoly: `// Filling a polygon means handing the SDK a GPath, and the point list depends
// on constants that can be edited above, so the path is built for the draw and
// freed again.
static void fill_poly(GContext *ctx, GPoint *points, int count) {
  GPathInfo info = { .num_points = (uint32_t)count, .points = points };
  GPath *path = gpath_create(&info);
  if (path != NULL) {
    gpath_draw_filled(ctx, path);
    gpath_destroy(path);
  }
}
`,
  clampRadius: `// A radius past half the shorter side is not a rounder rectangle, it is an
// undefined one. Clamping here rather than at generation time is what lets the
// RADIUS constants above be changed freely.
static int clamp_radius(int radius, GRect box) {
  int limit = (box.size.w < box.size.h ? box.size.w : box.size.h) / 2;
  if (radius > limit) radius = limit;
  return radius > 0 ? radius : 0;
}
`,
  lineEnd: `// Where a segment of this length and angle ends. Angles run clockwise from
// pointing right, matching the builder. The fixed-point trig can land a pixel
// away from what the editor drew.
static GPoint line_end(GPoint start, int length, int angle) {
  int32_t a = DEG_TO_TRIGANGLE(angle);
  return GPoint(start.x + (int16_t)((cos_lookup(a) * length) / TRIG_MAX_RATIO),
                start.y + (int16_t)((sin_lookup(a) * length) / TRIG_MAX_RATIO));
}
`,
  buildPolygon: `#define POLYGON_MAX_POINTS 24

// Vertices of a regular polygon, normalized to fill the box exactly - the same
// layout the builder draws, so the watch and the editor agree. Returns how many
// points were written, which is the side count clamped to what fits.
static int build_polygon(GPoint *out, int sides, int rotation, GRect box) {
  if (sides < 3) sides = 3;
  if (sides > POLYGON_MAX_POINTS) sides = POLYGON_MAX_POINTS;
  int32_t base = DEG_TO_TRIGANGLE(rotation - 90);
  int32_t min_x = TRIG_MAX_RATIO, max_x = -TRIG_MAX_RATIO;
  int32_t min_y = TRIG_MAX_RATIO, max_y = -TRIG_MAX_RATIO;
  for (int v = 0; v < sides; v++) {
    int32_t a = base + (TRIG_MAX_ANGLE * v) / sides;
    int32_t cx = cos_lookup(a), sy = sin_lookup(a);
    if (cx < min_x) min_x = cx;
    if (cx > max_x) max_x = cx;
    if (sy < min_y) min_y = sy;
    if (sy > max_y) max_y = sy;
  }
  int32_t span_x = max_x - min_x;
  int32_t span_y = max_y - min_y;
  if (span_x == 0) span_x = 1;
  if (span_y == 0) span_y = 1;
  for (int v = 0; v < sides; v++) {
    int32_t a = base + (TRIG_MAX_ANGLE * v) / sides;
    out[v].x = (int16_t)(box.origin.x + ((cos_lookup(a) - min_x) * box.size.w) / span_x);
    out[v].y = (int16_t)(box.origin.y + ((sin_lookup(a) - min_y) * box.size.h) / span_y);
  }
  return sides;
}
`,
  tenths: `// Rounds tenths of a unit to whole units, away from zero. C's integer division
// truncates towards zero, which would read -0.5 degrees as 0 rather than -1.
static int tenths_to_whole(int tenths) {
  return tenths >= 0 ? (tenths + 5) / 10 : -((-tenths + 5) / 10);
}
`,
  compassPoint: `// Names the sector a bearing falls in. Adding half a sector before dividing is
// what rounds the bearing to the nearest name.
static const char *compass_point(int degrees, int points) {
  static const char *const names[16] = {
${COMPASS_NAMES.map((n) => `    "${n}"`).join(',\n')}
  };
  int step = 16 / points;
  int index = ((degrees * points + 180) / 360) % points;
  return names[index * step];
}
`,
  conditionLabel: `static const char *weather_condition_label(int condition) {
  switch (condition) {
${WEATHER_CONDITIONS.map((c, index) => `    case ${index}: return "${cString(CONDITION_LABEL[c])}";`).join('\n')}
    default: return "--";
  }
}
`,
  strip: `// Drops a leading zero, e.g. "09:05" -> "9:05". Pebble's strftime has no
// portable "%-I", so the trim happens here instead.
static void strip_leading_zero(char *s) {
  if (s[0] == '0' && s[1] != '\\0') {
    memmove(s, s + 1, strlen(s));
  }
}
`,
  upper: `static void text_to_upper(char *s) {
  for (; *s; s++) {
    if (*s >= 'a' && *s <= 'z') {
      *s = (char)(*s - ('a' - 'A'));
    }
  }
}
`,
  thousands: `// Formats 12345 as "12,345".
static void format_thousands(int value, char *out, size_t out_size) {
  char digits[16];
  snprintf(digits, sizeof(digits), "%d", value);
  int len = (int)strlen(digits);
  int total = len + (len - 1) / 3;
  if (total >= (int)out_size) {
    snprintf(out, out_size, "%d", value);
    return;
  }
  out[total] = '\\0';
  int j = total - 1;
  int count = 0;
  for (int idx = len - 1; idx >= 0; idx--) {
    out[j--] = digits[idx];
    if (++count % 3 == 0 && idx > 0) {
      out[j--] = ',';
    }
  }
}
`,
};

/**
 * The condition artwork, emitted from the same normalized shape table the
 * preview draws, so the editor and the watch cannot drift apart.
 *
 * Everything is scaled by the shorter side and centered, so the artwork fills
 * the largest square the box holds rather than stretching to fit a box that is
 * wider than it is tall.
 */
function weatherIconHelper(): string {
  const permille = (v: number) => Math.round(v * 1000);
  const px = (axis: 'ox' | 'oy', v: number) => `${axis} + (s * ${permille(v)}) / 1000`;
  const L: string[] = [];

  L.push('// Scales one normalized measurement, never down to nothing.');
  L.push('static int icon_scale(int extent, int permille) {');
  L.push('  int value = (extent * permille) / 1000;');
  L.push('  return value > 0 ? value : 1;');
  L.push('}');
  L.push('');
  L.push('// An open polyline. The SDK has neither caps nor joins, so a disc at every');
  L.push('// point rounds the two ends and keeps the corners of a curve from notching.');
  L.push('// Below three pixels wide the disc would not show, so it is skipped.');
  L.push('static void icon_stroke_path(GContext *ctx, GPoint *points, uint32_t count, int width) {');
  L.push('  graphics_context_set_stroke_width(ctx, width);');
  L.push('  for (uint32_t i = 1; i < count; i++) {');
  L.push('    graphics_draw_line(ctx, points[i - 1], points[i]);');
  L.push('  }');
  L.push('  if (width > 2) {');
  L.push('    for (uint32_t i = 0; i < count; i++) {');
  L.push('      graphics_fill_circle(ctx, points[i], width / 2);');
  L.push('    }');
  L.push('  }');
  L.push('}');
  L.push('');
  L.push('static void draw_weather_icon(GContext *ctx, GRect box, int condition, GColor color) {');
  L.push('  const int w = box.size.w, h = box.size.h;');
  L.push('  const int x0 = box.origin.x, y0 = box.origin.y;');
  L.push('  const int s = w < h ? w : h;');
  L.push('  // Centre the square the artwork is drawn in.');
  L.push('  const int ox = x0 + (w - s) / 2;');
  L.push('  const int oy = y0 + (h - s) / 2;');
  L.push('  graphics_context_set_fill_color(ctx, color);');
  L.push('  graphics_context_set_stroke_color(ctx, color);');
  L.push('  switch (condition) {');

  WEATHER_CONDITIONS.forEach((condition, index) => {
    // Braced so the point arrays a polygon needs are legal declarations.
    L.push(`    case ${index}: {  // ${CONDITION_LABEL[condition]}`);
    for (const shape of CONDITION_ICON[condition]) {
      if (shape.kind === 'circle') {
        L.push(
          `      graphics_fill_circle(ctx, GPoint(${px('ox', shape.cx)}, ${px('oy', shape.cy)}),` +
            ` icon_scale(s, ${permille(shape.r)}));`,
        );
      } else if (shape.kind === 'rect') {
        L.push(
          `      graphics_fill_rect(ctx, GRect(${px('ox', shape.x)}, ${px('oy', shape.y)},` +
            ` icon_scale(s, ${permille(shape.w)}), icon_scale(s, ${permille(shape.h)})), 0, GCornerNone);`,
        );
      } else {
        const pts = shape.points
          .map((pt) => `{ ${px('ox', pt.x)}, ${px('oy', pt.y)} }`)
          .join(', ');
        L.push('      {');
        L.push(`        GPoint pts[${shape.points.length}] = { ${pts} };`);
        L.push(
          shape.kind === 'path'
            ? `        icon_stroke_path(ctx, pts, ${shape.points.length}, icon_scale(s, ${permille(shape.width)}));`
            : `        fill_poly(ctx, pts, ${shape.points.length});`,
        );
        L.push('      }');
      }
    }
    L.push('      break;');
    L.push('    }');
  });

  L.push('    default:');
  L.push('      break;');
  L.push('  }');
  L.push('  graphics_context_set_stroke_width(ctx, 1);');
  L.push('}');
  L.push('');
  return L.join('\n');
}

/** Globals, handlers, and wiring for the phone weather companion. */
function weatherGlobals(): string[] {
  return [
    '// Weather, filled in by the companion JavaScript running on the phone.',
    '// Temperatures are tenths of a degree Celsius and wind is tenths of a km/h,',
    '// so the watch can render either unit system without floating point.',
    'static int s_weather_temp = 0;',
    'static int s_weather_feels_like = 0;',
    'static int s_weather_high = 0;',
    'static int s_weather_low = 0;',
    'static int s_weather_rain_chance = 0;',
    'static int s_weather_humidity = 0;',
    'static int s_weather_wind = 0;',
    '// -1 until the phone reports one, which is what keeps the icon blank.',
    'static int s_weather_condition = -1;',
    `static char s_weather_location[${WEATHER_TEXT_BYTES}] = "";`,
    'static bool s_weather_ready = false;',
    'static int s_weather_countdown = 1;',
    '',
  ];
}

export function generateC(project: WatchfaceProject, analysis: ProjectAnalysis): string {
  const spec = platformSpec(project.platform);
  const ctx: Ctx = { analysis, spec, color: makeColor(spec), buffers: [], helpers: new Set() };

  // Element bodies are generated first so we know which buffers and helpers the
  // file needs to declare above the update procedure.
  const taken = new Set<string>();
  const prefixes = analysis.drawOrder.map((el) => constPrefix(el.name, el.type, taken));
  const bodies = analysis.drawOrder
    .map((el, index) => emitElement(el, prefixes[index]!, ctx))
    .filter(Boolean)
    .join('\n');
  if (analysis.needsWeatherIcon) ctx.helpers.add('fillPoly');

  const L: string[] = [];
  L.push(`// ${project.name} - generated by Pebble Watchface Builder`);
  L.push(
    `// Target: ${spec.name} (${spec.sdkPlatform}), ${spec.width} x ${spec.height}, ` +
      `${spec.colorMode === 'bw' ? 'black & white' : `${spec.colorCount} colors`}`,
  );
  L.push(`//`);
  L.push(`// Paste this file into CloudPebble's main.c and add the resources listed in`);
  L.push(`// the export panel before building.`);
  L.push(`//`);
  L.push(`// Each element's block opens with the values that drive it - position, size,`);
  L.push(`// colors, format strings. Change them there; the drawing code below reads them.`);
  L.push('');
  L.push('#include <pebble.h>');
  L.push('');
  L.push('// A color expands to a compound literal, which cannot initialize a static, so');
  L.push('// the one value used outside the drawing code is a macro instead.');
  L.push(`#define BACKGROUND_COLOR ${ctx.color(project.backgroundColor)}`);
  L.push('');
  L.push('static Window *s_window;');
  L.push('static Layer *s_canvas_layer;');
  L.push('');
  L.push('static struct tm s_now;');
  if (analysis.needsBattery) {
    L.push('static int s_battery_percent = 100;');
    L.push('static bool s_battery_charging = false;');
  }
  if (analysis.needsBluetooth) L.push('static bool s_bt_connected = true;');
  L.push('');
  if (analysis.needsWeather) L.push(...weatherGlobals());
  if (analysis.needsCompass) {
    L.push('// Compass. The magnetometer stays powered while this watchface is up, which is');
    L.push('// the main battery cost here; the timer only limits how often the screen');
    L.push('// is redrawn with a new reading.');
    L.push('static int s_compass_heading = -1;');
    L.push('static AppTimer *s_compass_timer;');
    L.push('');
  }

  if (analysis.fonts.length) {
    L.push('// Custom fonts - one GFont per (font file, size) pair.');
    for (const f of analysis.fonts) L.push(`static GFont ${f.varName};`);
    L.push('');
  }
  if (analysis.images.length) {
    L.push('// Bitmap resources.');
    for (const img of analysis.images) L.push(`static GBitmap *${img.varName};`);
    L.push('');
  }
  if (ctx.buffers.length) {
    L.push('// Text buffers, one per text-drawing element. snprintf truncates rather than');
    L.push('// overflowing, so a format string edited longer is safe - it just gets cut off.');
    for (const b of ctx.buffers) L.push(`static char ${b.name}[${b.size}];`);
    L.push('');
  }

  for (const helper of HELPER_ORDER) {
    if (ctx.helpers.has(helper)) L.push(HELPER_SOURCE[helper]);
  }
  if (analysis.needsWeatherIcon) L.push(weatherIconHelper());

  L.push('static void canvas_update_proc(Layer *layer, GContext *ctx) {');
  L.push('  GRect bounds = layer_get_bounds(layer);');
  L.push('  graphics_context_set_fill_color(ctx, BACKGROUND_COLOR);');
  L.push('  graphics_fill_rect(ctx, bounds, 0, GCornerNone);');
  L.push('');
  L.push(bodies.replace(/\n$/, ''));
  L.push('}');
  L.push('');

  if (analysis.needsWeather) {
    const refresh = Math.max(1, Math.round(project.options.weatherRefreshMinutes));
    L.push('// Asks the phone for a fresh reading. The companion answers on its own');
    L.push('// schedule too, whenever the watchface is launched.');
    L.push('static void weather_request(void) {');
    L.push('  DictionaryIterator *out;');
    L.push('  if (app_message_outbox_begin(&out) == APP_MSG_OK) {');
    L.push('    dict_write_uint8(out, MESSAGE_KEY_WEATHER_REQUEST, 1);');
    L.push('    app_message_outbox_send();');
    L.push('  }');
    L.push('}');
    L.push('');
    L.push('static void inbox_received_handler(DictionaryIterator *iter, void *context) {');
    L.push('  (void)context;');
    L.push('  Tuple *t;');
    for (const [key, target] of [
      ['WEATHER_TEMP', 's_weather_temp'],
      ['WEATHER_FEELS_LIKE', 's_weather_feels_like'],
      ['WEATHER_HIGH', 's_weather_high'],
      ['WEATHER_LOW', 's_weather_low'],
      ['WEATHER_RAIN_CHANCE', 's_weather_rain_chance'],
      ['WEATHER_HUMIDITY', 's_weather_humidity'],
      ['WEATHER_WIND', 's_weather_wind'],
      ['WEATHER_CONDITION', 's_weather_condition'],
    ] as const) {
      L.push(`  if ((t = dict_find(iter, MESSAGE_KEY_${key})) != NULL) {`);
      L.push(`    ${target} = (int)t->value->int32;`);
      L.push('    s_weather_ready = true;');
      L.push('  }');
    }
    L.push('  if ((t = dict_find(iter, MESSAGE_KEY_WEATHER_LOCATION)) != NULL) {');
    L.push('    strncpy(s_weather_location, t->value->cstring, sizeof(s_weather_location) - 1);');
    L.push("    s_weather_location[sizeof(s_weather_location) - 1] = '\\0';");
    L.push('    s_weather_ready = true;');
    L.push('  }');
    L.push('  layer_mark_dirty(s_canvas_layer);');
    L.push('}');
    L.push('');
    L.push('static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {');
    L.push('  s_now = *tick_time;');
    L.push('  if (units_changed & MINUTE_UNIT) {');
    L.push('    if (--s_weather_countdown <= 0) {');
    L.push(`      s_weather_countdown = ${refresh};`);
    L.push('      weather_request();');
    L.push('    }');
    L.push('  }');
    L.push('  layer_mark_dirty(s_canvas_layer);');
    L.push('}');
    L.push('');
  } else {
    L.push('static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {');
    L.push('  (void)units_changed;');
    L.push('  s_now = *tick_time;');
    L.push('  layer_mark_dirty(s_canvas_layer);');
    L.push('}');
    L.push('');
  }

  if (analysis.needsBattery) {
    L.push('static void battery_handler(BatteryChargeState state) {');
    L.push('  s_battery_percent = state.charge_percent;');
    L.push('  s_battery_charging = state.is_charging || state.is_plugged;');
    L.push('  layer_mark_dirty(s_canvas_layer);');
    L.push('}');
    L.push('');
  }

  if (analysis.needsBluetooth) {
    L.push('static void connection_handler(bool connected) {');
    L.push('  s_bt_connected = connected;');
    if (project.options.vibeOnDisconnect) {
      L.push('  if (!connected) {');
      L.push('    vibes_double_pulse();');
      L.push('  }');
    }
    L.push('  layer_mark_dirty(s_canvas_layer);');
    L.push('}');
    L.push('');
  }

  if (analysis.needsCompass) {
    L.push('static void compass_handler(CompassHeadingData heading) {');
    L.push('  if (heading.compass_status == CompassStatusDataInvalid) {');
    L.push('    s_compass_heading = -1;');
    L.push('    return;');
    L.push('  }');
    L.push('  // magnetic_heading counts counter-clockwise from north as a trig angle.');
    L.push('  s_compass_heading = TRIGANGLE_TO_DEG(TRIG_MAX_ANGLE - heading.magnetic_heading);');
    L.push('}');
    L.push('');
    L.push('// Redraws on a fixed interval instead of on every reading, so a heading that');
    L.push('// wobbles by a degree does not repaint the screen.');
    L.push('static void compass_tick(void *data) {');
    L.push('  (void)data;');
    L.push('  layer_mark_dirty(s_canvas_layer);');
    L.push(`  s_compass_timer = app_timer_register(${COMPASS_REFRESH_MS}, compass_tick, NULL);`);
    L.push('}');
    L.push('');
  }

  if (analysis.needsHealth) {
    L.push('#if defined(PBL_HEALTH)');
    L.push('static void health_handler(HealthEventType event, void *context) {');
    L.push('  (void)context;');
    L.push(
      `  if (event == HealthEventMovementUpdate || event == HealthEventSignificantUpdate${
        analysis.needsHeartRate ? ' ||\n      event == HealthEventHeartRateUpdate' : ''
      }) {`,
    );
    L.push('    layer_mark_dirty(s_canvas_layer);');
    L.push('  }');
    L.push('}');
    L.push('#endif');
    L.push('');
  }

  L.push('static void main_window_load(Window *window) {');
  L.push('  Layer *window_layer = window_get_root_layer(window);');
  L.push('  s_canvas_layer = layer_create(layer_get_bounds(window_layer));');
  L.push('  layer_set_update_proc(s_canvas_layer, canvas_update_proc);');
  L.push('  layer_add_child(window_layer, s_canvas_layer);');
  L.push('}');
  L.push('');
  L.push('static void main_window_unload(Window *window) {');
  L.push('  (void)window;');
  L.push('  layer_destroy(s_canvas_layer);');
  L.push('}');
  L.push('');

  L.push('static void init(void) {');
  if (analysis.fonts.length) {
    L.push('  // Fonts must exist as resources with exactly these identifiers.');
    for (const f of analysis.fonts) {
      L.push(`  ${f.varName} = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_${f.resourceId}));`);
    }
    L.push('');
  }
  if (analysis.images.length) {
    for (const img of analysis.images) {
      L.push(`  ${img.varName} = gbitmap_create_with_resource(RESOURCE_ID_${img.resourceId});`);
    }
    L.push('');
  }
  L.push('  time_t now = time(NULL);');
  L.push('  s_now = *localtime(&now);');
  if (analysis.needsBattery) {
    L.push('  BatteryChargeState charge = battery_state_service_peek();');
    L.push('  s_battery_percent = charge.charge_percent;');
    L.push('  s_battery_charging = charge.is_charging || charge.is_plugged;');
  }
  if (analysis.needsBluetooth) {
    L.push('  s_bt_connected = connection_service_peek_pebble_app_connection();');
  }
  L.push('');
  L.push('  s_window = window_create();');
  L.push('  window_set_background_color(s_window, BACKGROUND_COLOR);');
  L.push('  window_set_window_handlers(s_window, (WindowHandlers) {');
  L.push('    .load = main_window_load,');
  L.push('    .unload = main_window_unload,');
  L.push('  });');
  L.push('  window_stack_push(s_window, true);');
  L.push('');
  L.push(
    `  tick_timer_service_subscribe(${analysis.needsSeconds ? 'SECOND_UNIT' : 'MINUTE_UNIT'}, tick_handler);`,
  );
  if (analysis.needsBattery) L.push('  battery_state_service_subscribe(battery_handler);');
  if (analysis.needsBluetooth) {
    L.push('  connection_service_subscribe((ConnectionHandlers) {');
    L.push('    .pebble_app_connection_handler = connection_handler,');
    L.push('  });');
  }
  if (analysis.needsHealth) {
    L.push('#if defined(PBL_HEALTH)');
    L.push('  health_service_events_subscribe(health_handler, NULL);');
    L.push('#endif');
  }
  if (analysis.needsCompass) {
    L.push('  compass_service_subscribe(compass_handler);');
    L.push(`  s_compass_timer = app_timer_register(${COMPASS_REFRESH_MS}, compass_tick, NULL);`);
  }
  if (analysis.needsWeather) {
    L.push('');
    L.push('  app_message_register_inbox_received(inbox_received_handler);');
    L.push('  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());');
  }
  L.push('}');
  L.push('');

  L.push('static void deinit(void) {');
  L.push('  tick_timer_service_unsubscribe();');
  if (analysis.needsWeather) L.push('  app_message_deregister_callbacks();');
  if (analysis.needsCompass) {
    L.push('  app_timer_cancel(s_compass_timer);');
    L.push('  compass_service_unsubscribe();');
  }
  if (analysis.needsBattery) L.push('  battery_state_service_unsubscribe();');
  if (analysis.needsBluetooth) L.push('  connection_service_unsubscribe();');
  if (analysis.needsHealth) {
    L.push('#if defined(PBL_HEALTH)');
    L.push('  health_service_events_unsubscribe();');
    L.push('#endif');
  }
  for (const img of analysis.images) L.push(`  gbitmap_destroy(${img.varName});`);
  for (const f of analysis.fonts) L.push(`  fonts_unload_custom_font(${f.varName});`);
  L.push('  window_destroy(s_window);');
  L.push('}');
  L.push('');
  L.push('int main(void) {');
  L.push('  init();');
  L.push('  app_event_loop();');
  L.push('  deinit();');
  L.push('  return 0;');
  L.push('}');
  L.push('');

  return L.join('\n');
}

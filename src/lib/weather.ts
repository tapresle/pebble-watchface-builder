/**
 * Weather: the readings a watchface can show, the icon artwork, and the mapping
 * from the weather service's own condition codes.
 *
 * Pebble has no weather API of its own. A watchface gets weather by running a
 * PebbleKit JS companion on the phone, which fetches from a web service and
 * sends the numbers over AppMessage. This module is the single description of
 * that data, so the preview, the generated C and the generated JS all agree.
 */

/** The general conditions the icon can draw. The index is what goes on the wire. */
export const WEATHER_CONDITIONS = [
  'clear',
  'partlyCloudy',
  'cloudy',
  'rain',
  'thunderstorm',
  'snow',
  'fog',
] as const;

export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: 'Clear',
  partlyCloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  rain: 'Rain',
  thunderstorm: 'Thunderstorm',
  snow: 'Snow',
  fog: 'Fog',
};

export const conditionIndex = (c: WeatherCondition): number => WEATHER_CONDITIONS.indexOf(c);

/** Which reading a weather element shows. */
export type WeatherField =
  | 'temperature'
  | 'feelsLike'
  | 'high'
  | 'low'
  | 'rainChance'
  | 'humidity'
  | 'wind'
  | 'condition'
  | 'location'
  | 'icon';

export const WEATHER_FIELDS: { value: WeatherField; label: string; group: string }[] = [
  { value: 'temperature', label: 'Temperature', group: 'Temperature' },
  { value: 'feelsLike', label: 'Feels like', group: 'Temperature' },
  { value: 'high', label: "Today's high", group: 'Temperature' },
  { value: 'low', label: "Today's low", group: 'Temperature' },
  { value: 'rainChance', label: 'Chance of rain', group: 'Conditions' },
  { value: 'humidity', label: 'Humidity', group: 'Conditions' },
  { value: 'wind', label: 'Wind speed', group: 'Conditions' },
  { value: 'condition', label: 'Condition text', group: 'Conditions' },
  { value: 'location', label: 'Place name', group: 'Conditions' },
  { value: 'icon', label: 'Condition icon', group: 'Artwork' },
];

/** True when the field draws artwork rather than a string. */
export const isIconField = (field: WeatherField): boolean => field === 'icon';

/** True when the field is a temperature, and so follows the C/F setting. */
export const isTemperatureField = (field: WeatherField): boolean =>
  field === 'temperature' || field === 'feelsLike' || field === 'high' || field === 'low';

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

export type WeatherUnits = 'metric' | 'imperial';

/**
 * Rounds tenths to whole units, away from zero.
 *
 * The watch does this in integer C, where division truncates towards zero, so
 * the preview uses the identical expression rather than Math.round. Otherwise
 * the two disagree on negative halves.
 */
export const roundTenths = (tenths: number): number =>
  tenths >= 0 ? Math.floor((tenths + 5) / 10) : -Math.floor((-tenths + 5) / 10);

/** Temperatures travel as tenths of a degree Celsius, so C and F both round well. */
export const cTenthsToDisplay = (tenths: number, units: WeatherUnits): number =>
  units === 'imperial' ? roundTenths(Math.trunc((tenths * 9) / 5) + 320) : roundTenths(tenths);

/** Wind travels as tenths of a km/h. */
export const windTenthsToDisplay = (tenths: number, units: WeatherUnits): number =>
  units === 'imperial'
    ? roundTenths(Math.trunc((tenths * 1000) / 1609))
    : roundTenths(tenths);

export const temperatureUnitLabel = (units: WeatherUnits): string =>
  units === 'imperial' ? 'F' : 'C';

export const windUnitLabel = (units: WeatherUnits): string =>
  units === 'imperial' ? 'mph' : 'km/h';

/* ------------------------------------------------------------------ *
 * Icon artwork
 * ------------------------------------------------------------------ */

/**
 * One primitive of an icon, in coordinates normalized to a unit square so the
 * same table can be scaled into an SVG for the preview and into graphics_*
 * calls for the watch.
 *
 * A 'path' is an open polyline with round ends and corners. Curves are
 * approximated by its segments, because the SDK has no curve primitive.
 */
export type IconShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'path'; points: { x: number; y: number }[]; width: number }
  | { kind: 'poly'; points: { x: number; y: number }[] };

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The cloud silhouette, following the proportions Noto draws: four lobes of
 * unequal size, the largest left of centre, all sharing one flat base. Sized
 * from its width, since the shape is a fixed 0.58 as tall as it is wide.
 *
 * `left` and `top` place the unit cloud's own box, so the partly cloudy icon
 * can tuck a smaller one under the sun.
 */
function cloud(left: number, top: number, width: number): IconShape[] {
  const u = (x: number) => left + x * width;
  const v = (y: number) => top + y * width;
  const r = (n: number) => n * width;
  return [
    { kind: 'circle', cx: u(0.15), cy: v(0.43), r: r(0.15) },
    { kind: 'circle', cx: u(0.33), cy: v(0.36), r: r(0.22) },
    { kind: 'circle', cx: u(0.58), cy: v(0.3), r: r(0.28) },
    { kind: 'circle', cx: u(0.82), cy: v(0.405), r: r(0.175) },
    // The lobes alone would leave a scalloped underside; this flattens it.
    { kind: 'rect', x: u(0.15), y: v(0.43), w: r(0.67), h: r(0.15) },
  ];
}

/**
 * One tapered ray, as a triangle rather than a stroke. Noto's sun spikes are
 * what most distinguishes it from a dot with lines around it.
 */
function ray(
  cx: number,
  cy: number,
  degrees: number,
  from: number,
  to: number,
  halfWidth: number,
): IconShape {
  const a = rad(degrees);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    kind: 'poly',
    points: [
      { x: cx + to * c, y: cy + to * s },
      { x: cx + from * c - halfWidth * s, y: cy + from * s + halfWidth * c },
      { x: cx + from * c + halfWidth * s, y: cy + from * s - halfWidth * c },
    ],
  };
}

function sun(
  cx: number,
  cy: number,
  r: number,
  rayFrom: number,
  rayTo: number,
  halfWidth: number,
  angles: number[],
): IconShape[] {
  return [
    { kind: 'circle', cx, cy, r },
    ...angles.map((a) => ray(cx, cy, a, rayFrom, rayTo, halfWidth)),
  ];
}

/** A raindrop: pointed at the top, round at the bottom. */
function drop(cx: number, cy: number, size: number): IconShape[] {
  return [
    {
      kind: 'poly',
      points: [
        { x: cx, y: cy - size },
        { x: cx - size * 0.62, y: cy + size * 0.3 },
        { x: cx + size * 0.62, y: cy + size * 0.3 },
      ],
    },
    { kind: 'circle', cx, cy: cy + size * 0.28, r: size * 0.62 },
  ];
}

/** A six-pointed flake. At small sizes it fairly reads as a dot, which is fine. */
function flake(cx: number, cy: number, r: number, width: number): IconShape[] {
  return [0, 60, 120].map((degrees) => {
    const a = rad(degrees);
    return {
      kind: 'path' as const,
      width,
      points: [
        { x: cx - Math.cos(a) * r, y: cy - Math.sin(a) * r },
        { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r },
      ],
    };
  });
}

/** One drifting band of mist, as a sine wave sampled into segments. */
function squiggle(
  left: number,
  right: number,
  y: number,
  amplitude: number,
  width: number,
): IconShape {
  const steps = 10;
  return {
    kind: 'path',
    width,
    points: Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return {
        x: left + t * (right - left),
        y: y + Math.sin(t * 1.25 * 2 * Math.PI) * amplitude,
      };
    }),
  };
}

/** The lightning bolt, in the box below the cloud. */
function bolt(left: number, top: number, width: number, height: number): IconShape {
  const unit = [
    [0.55, 0],
    [0.2, 0.55],
    [0.45, 0.55],
    [0.35, 1],
    [0.8, 0.4],
    [0.52, 0.4],
    [0.75, 0],
  ];
  return {
    kind: 'poly',
    points: unit.map(([x, y]) => ({ x: left + x! * width, y: top + y! * height })),
  };
}

/**
 * The icon set, drawn after Noto's weather emoji: a spiked sun, a puffy
 * four-lobe cloud with a flat base, teardrops, a filled bolt, six-pointed
 * flakes and drifting bands of mist.
 *
 * Everything is one color on a Pebble, so shapes that Noto separates by hue
 * are separated by position here instead. That is why the partly cloudy sun
 * sits clear of the cloud and drops its lower right rays rather than hiding
 * them behind it.
 *
 * Every shape stays inside the unit square. Anything outside is clipped away
 * in the preview and would spill past the element's box on the watch.
 */
export const CONDITION_ICON: Record<WeatherCondition, IconShape[]> = {
  clear: sun(0.5, 0.5, 0.22, 0.27, 0.47, 0.075, [0, 45, 90, 135, 180, 225, 270, 315]),
  partlyCloudy: [
    ...sun(0.33, 0.31, 0.135, 0.175, 0.3, 0.05, [0, 135, 180, 225, 270, 315]),
    ...cloud(0.26, 0.382, 0.72),
  ],
  cloudy: cloud(0.02, 0.212, 0.96),
  rain: [
    ...cloud(0.05, 0.04, 0.9),
    ...drop(0.27, 0.72, 0.105),
    ...drop(0.5, 0.79, 0.105),
    ...drop(0.73, 0.72, 0.105),
  ],
  // The bolt starts above the cloud's base so the two read as one shape. It is
  // all drawn in a single color, so the buried part simply merges in.
  thunderstorm: [...cloud(0.07, 0.02, 0.86), bolt(0.3, 0.44, 0.4, 0.56)],
  snow: [
    ...cloud(0.05, 0.04, 0.9),
    ...flake(0.27, 0.75, 0.095, 0.03),
    ...flake(0.5, 0.83, 0.095, 0.03),
    ...flake(0.73, 0.75, 0.095, 0.03),
  ],
  // Noto's fog is bands rather than a cloud. Three of them, sharing a span and
  // a phase so they line up with each other.
  fog: [0.28, 0.5, 0.72].map((y) => squiggle(0.09, 0.91, y, 0.045, 0.075)),
};

/* ------------------------------------------------------------------ *
 * AppMessage keys
 * ------------------------------------------------------------------ */

/**
 * Every key the companion can send. CloudPebble needs these typed into
 * Settings, and package.json lists them under messageKeys, so the names are
 * fixed here and used verbatim on both sides.
 */
export const WEATHER_MESSAGE_KEYS = [
  'WEATHER_TEMP',
  'WEATHER_FEELS_LIKE',
  'WEATHER_HIGH',
  'WEATHER_LOW',
  'WEATHER_RAIN_CHANCE',
  'WEATHER_HUMIDITY',
  'WEATHER_WIND',
  'WEATHER_CONDITION',
  'WEATHER_LOCATION',
  'WEATHER_REQUEST',
] as const;

/**
 * Longest string the companion is allowed to send, including the terminator.
 * Only the place name travels as text; the condition wording is derived from
 * the condition index on both sides so the preview and the watch cannot drift.
 */
export const WEATHER_TEXT_BYTES = 32;

/**
 * OpenWeatherMap condition groups, collapsed onto the icons above.
 *
 * The service returns a three-digit code whose leading digit is the group:
 * 2xx thunderstorm, 3xx drizzle, 5xx rain, 6xx snow, 7xx atmosphere (fog, haze,
 * dust), 800 clear, 80x clouds. 801 and 802 are light enough to read as partly
 * cloudy; 803 and 804 are overcast.
 */
export function conditionFromOwmCode(code: number): WeatherCondition {
  if (code >= 200 && code < 300) return 'thunderstorm';
  if (code >= 300 && code < 600) return 'rain';
  if (code >= 600 && code < 700) return 'snow';
  if (code >= 700 && code < 800) return 'fog';
  if (code === 800) return 'clear';
  if (code === 801 || code === 802) return 'partlyCloudy';
  return 'cloudy';
}

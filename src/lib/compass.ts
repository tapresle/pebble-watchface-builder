/**
 * Compass headings and the names of the sectors they fall in.
 *
 * The watch reports a heading in degrees clockwise from north; what a
 * watchface usually wants is the name of the sector. The naming is shared with
 * the generated C so the preview and the watch label a heading identically.
 */

/** How finely a heading is named. 4 gives N/E/S/W, 16 gives N/NNE/NE/... */
export type CompassPoints = 4 | 8 | 16;

export const COMPASS_POINT_OPTIONS: { value: CompassPoints; label: string }[] = [
  { value: 4, label: '4 · N E S W' },
  { value: 8, label: '8 · N NE E SE' },
  { value: 16, label: '16 · N NNE NE' },
];

/** The 16 sector names. Coarser settings step through this same list. */
export const COMPASS_NAMES = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

/**
 * Names the sector a heading falls in.
 *
 * Written with the same integer arithmetic the generated C uses: adding half a
 * sector before dividing is what rounds a heading to the nearest name.
 */
export function compassPoint(degrees: number, points: CompassPoints): string {
  const step = 16 / points;
  const index = Math.floor((degrees * points + 180) / 360) % points;
  return COMPASS_NAMES[index * step]!;
}

/** What a compass element shows. */
export type CompassDisplay = 'cardinal' | 'degrees' | 'both';

export const COMPASS_DISPLAY_OPTIONS: { value: CompassDisplay; label: string }[] = [
  { value: 'cardinal', label: 'NE' },
  { value: 'degrees', label: '45°' },
  { value: 'both', label: 'NE 45°' },
];

/** How often the reading on screen is refreshed, in milliseconds. */
export const COMPASS_REFRESH_MS = 5000;

export function compassText(
  degrees: number,
  points: CompassPoints,
  display: CompassDisplay,
): string {
  const name = compassPoint(degrees, points);
  if (display === 'cardinal') return name;
  if (display === 'degrees') return `${degrees}°`;
  return `${name} ${degrees}°`;
}

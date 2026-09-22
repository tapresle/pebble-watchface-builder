/**
 * Calendar: the readings a watchface can show for the next upcoming event, and
 * the AppMessage wire format that carries it.
 *
 * Pebble has no calendar of its own. A watchface gets one by running a
 * PebbleKit JS companion on the phone, which fetches an ICS feed the user
 * points it at and sends the next event's details over AppMessage - the same
 * shape weather already uses. This module is the single description of that
 * data, so the preview, the generated C, and the generated JS all agree.
 */

/** Which piece of the next event a calendar element shows. */
export type CalendarField = 'title' | 'time' | 'countdown' | 'location';

/**
 * Unlike WEATHER_FIELDS, these are all one kind of thing - there is no second
 * category to group them against - so none carries a `group`.
 */
export const CALENDAR_FIELDS: { value: CalendarField; label: string }[] = [
  { value: 'title', label: 'Event title' },
  { value: 'time', label: 'Start time' },
  { value: 'countdown', label: 'Time until' },
  { value: 'location', label: 'Location' },
];

/** How several chosen fields are joined into one line, or stacked into several. */
export type CalendarOrientation = 'horizontal' | 'vertical';

/**
 * Stacked fields always split on a newline, so Pebble's own text layer wraps
 * them - that is not a look the user picks a character for. Side by side has
 * no natural break, so that separator is the one thing left editable; this is
 * only the starting value a new element gets, and it can be cleared for none.
 */
export const CALENDAR_VERTICAL_SEPARATOR = '\n';
export const CALENDAR_DEFAULT_SEPARATOR = ' · ';

/** What actually goes between fields, given how a specific element is set up. */
export function calendarSeparator(orientation: CalendarOrientation, separator: string): string {
  return orientation === 'vertical' ? CALENDAR_VERTICAL_SEPARATOR : separator;
}

/**
 * Longest strings the companion is allowed to send, including the
 * terminator. An ICS feed's SUMMARY/LOCATION can run far longer than this;
 * the companion truncates before sending.
 */
export const CALENDAR_TITLE_BYTES = 40;
export const CALENDAR_LOCATION_BYTES = 32;

/** Rough rendered length of each field, time and countdown included - used to size buffers. */
export const CALENDAR_FIELD_BYTES: Record<CalendarField, number> = {
  title: CALENDAR_TITLE_BYTES,
  location: CALENDAR_LOCATION_BYTES,
  time: 12,
  countdown: 16,
};

/**
 * Every key the companion can send. CloudPebble needs these typed into
 * Settings, and package.json lists them under messageKeys, so the names are
 * fixed here and used verbatim on both sides.
 */
export const CALENDAR_MESSAGE_KEYS = [
  'CALENDAR_HAS_EVENT',
  'CALENDAR_START',
  'CALENDAR_TITLE',
  'CALENDAR_LOCATION',
  'CALENDAR_REQUEST',
] as const;

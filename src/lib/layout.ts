/** Which of the two arrangements the editor is drawn in. */
export type Layout = 'desktop' | 'mobile';

/**
 * Below this width the three-column layout stops fitting.
 *
 * The columns alone take 524px at their narrow setting (236 + 288), and the
 * stage needs room for the widest watch plus its bezel at the default zoom -
 * 300px for a Pebble Round 2, doubled - plus its own padding. That comes to
 * roughly 1070px before anything is comfortable, so a viewport of 1024 or less
 * is better served by the stacked layout. It catches phones and every tablet
 * in portrait, and leaves laptops alone.
 */
export const MOBILE_MAX_WIDTH = 1024;

export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/**
 * The layout to open in. Read once, when the app loads.
 *
 * Deliberately not reactive: a resize, a rotation, or a soft keyboard sliding up
 * must not rearrange the editor under someone mid-edit. The only thing that
 * changes it afterwards is the toggle in the header, and that choice is not
 * saved - a reload goes back to whatever the viewport says.
 */
export function detectLayout(): Layout {
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop';
}

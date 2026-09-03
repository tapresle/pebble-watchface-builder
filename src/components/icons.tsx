/**
 * The interface's own icons, drawn rather than typed.
 *
 * These used to be Unicode characters, which is not a decision a page gets to
 * make on its own: U+2B07 (the download arrow) carries Emoji_Presentation, so
 * every platform draws it with the color emoji font, and U+2600 (the sun) is
 * missing from most UI fonts and falls back to the same place on iOS. The
 * result was a row of flat monochrome glyphs with two full-color emoji sitting
 * in the middle of it, and a theme toggle whose two states did not match each
 * other. Drawing them means one look everywhere.
 *
 * All 16x16 on the same grid, stroked in currentColor so they take the theme
 * and any button state without extra rules.
 */

import type { ReactNode } from 'react';
import type { PaletteId } from '../lib/defaults';

function Glyph({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Glyph>
    <path d="M6 3.6 2.6 7l3.4 3.4" />
    <path d="M2.6 7h5.9a3.7 3.7 0 0 1 0 7.4H5.6" />
  </Glyph>
);

export const RedoIcon = () => (
  <Glyph>
    <path d="M10 3.6 13.4 7 10 10.4" />
    <path d="M13.4 7H7.5a3.7 3.7 0 0 0 0 7.4h2.9" />
  </Glyph>
);

export const SunIcon = () => (
  <Glyph>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.1v1.7M8 13.2v1.7M1.1 8h1.7M13.2 8h1.7M3.16 3.16l1.2 1.2M11.64 11.64l1.2 1.2M12.84 3.16l-1.2 1.2M4.36 11.64l-1.2 1.2" />
  </Glyph>
);

export const MoonIcon = () => (
  <Glyph>
    <path d="M13.4 9.9A5.9 5.9 0 0 1 6.1 2.6 5.9 5.9 0 1 0 13.4 9.9Z" />
  </Glyph>
);

/** Shown on the toggle that switches to the stacked layout. */
export const PhoneIcon = () => (
  <Glyph>
    <rect x="4.5" y="1.2" width="7" height="13.6" rx="1.6" />
    <path d="M6.9 12.6h2.2" />
  </Glyph>
);

/** Shown on the toggle that switches to the three-column layout. */
export const MonitorIcon = () => (
  <Glyph>
    <rect x="1.2" y="2.2" width="13.6" height="9.4" rx="1.6" />
    <path d="M8 11.6v2.6M5.4 14.2h5.2" />
  </Glyph>
);

export const DownloadIcon = () => (
  <Glyph>
    <path d="M8 1.9v8.2" />
    <path d="M4.7 6.9 8 10.2l3.3-3.3" />
    <path d="M2.6 11.6v1.3a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-1.3" />
  </Glyph>
);

export const CloseIcon = () => (
  <Glyph>
    <path d="M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" />
  </Glyph>
);

export const EyeIcon = () => (
  <Glyph>
    <path d="M1.4 8S4 3.8 8 3.8 14.6 8 14.6 8 12 12.2 8 12.2 1.4 8 1.4 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </Glyph>
);

export const EyeOffIcon = () => (
  <Glyph>
    <path d="M1.4 8S4 3.8 8 3.8 14.6 8 14.6 8 12 12.2 8 12.2 1.4 8 1.4 8Z" />
    <circle cx="8" cy="8" r="1.9" />
    <path d="M2.4 2.4l11.2 11.2" />
  </Glyph>
);

export const LockIcon = () => (
  <Glyph>
    <rect x="3.3" y="7" width="9.4" height="6.8" rx="1.5" />
    <path d="M5.6 7V5.1a2.4 2.4 0 0 1 4.8 0V7" />
  </Glyph>
);

export const UnlockIcon = () => (
  <Glyph>
    <rect x="3.3" y="7" width="9.4" height="6.8" rx="1.5" />
    <path d="M5.6 7V5.1a2.4 2.4 0 0 1 4.8 0" />
  </Glyph>
);

export const DuplicateIcon = () => (
  <Glyph>
    <rect x="5.6" y="1.9" width="8.5" height="8.5" rx="1.5" />
    <path d="M10.4 12.6v1a1.5 1.5 0 0 1-1.5 1.5H3.4a1.5 1.5 0 0 1-1.5-1.5V7.1a1.5 1.5 0 0 1 1.5-1.5h1" />
  </Glyph>
);

export const TrashIcon = () => (
  <Glyph>
    <path d="M2.4 4.2h11.2" />
    <path d="M6.2 4.2V2.9a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.3" />
    <path d="M3.9 4.2v9a1.4 1.4 0 0 0 1.4 1.4h5.4a1.4 1.4 0 0 0 1.4-1.4v-9" />
    <path d="M6.7 7v4.6M9.3 7v4.6" />
  </Glyph>
);

export const GithubIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/**
 * The "Add element" palette, one drawing per entry.
 *
 * These were emoji, which meant Apple, Google and Windows each drew a different
 * picture, and two entries shared one glyph: the analog dial and the compass
 * were both a compass rose. Typed as a complete record of PaletteId, so adding
 * a palette entry without an icon fails the build rather than rendering a gap.
 */
export const PALETTE_ICON: Record<PaletteId, JSX.Element> = {
  // Four digit cells and a colon, which reads as a clock face full of numbers
  // where real numerals would be a couple of pixels wide and illegible.
  time: (
    <Glyph>
      <rect x="0.9" y="4.4" width="2.6" height="7.2" rx="0.85" />
      <rect x="4" y="4.4" width="2.6" height="7.2" rx="0.85" />
      <circle cx="8" cy="6.9" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="8" cy="9.6" r="0.7" fill="currentColor" stroke="none" />
      <rect x="9.4" y="4.4" width="2.6" height="7.2" rx="0.85" />
      <rect x="12.5" y="4.4" width="2.6" height="7.2" rx="0.85" />
    </Glyph>
  ),
  date: (
    <Glyph>
      <rect x="2" y="3.2" width="12" height="11.2" rx="1.6" />
      <path d="M2 6.6h12M5.4 1.6v3M10.6 1.6v3" />
    </Glyph>
  ),
  // Hands on a dial, which is what separates this from the digital clock.
  analog: (
    <Glyph>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 4.4V8l2.6 1.9" />
    </Glyph>
  ),
  text: (
    <Glyph>
      <path d="M2.8 4.3V2.9h10.4v1.4M8 2.9v10.2M5.7 13.1h4.6" />
    </Glyph>
  ),
  // A battery holding a reading, against a plain gauge below. The two were
  // near-identical when both were drawn as a battery.
  batteryText: (
    <Glyph>
      <rect x="1.5" y="4.3" width="11" height="7.4" rx="1.8" />
      <path d="M14.3 7.1v1.8" />
      <path d="M9 6.4 5 9.6" />
      <circle cx="5.2" cy="6.6" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="8.8" cy="9.4" r="0.85" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  batteryBar: (
    <Glyph>
      <rect x="1.3" y="5.4" width="13.4" height="5.2" rx="2.6" />
      <rect x="3.3" y="7.2" width="5" height="1.6" rx="0.8" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  batteryRing: (
    <Glyph>
      <path d="M8 1.9a6.1 6.1 0 1 1-4.3 1.8" />
    </Glyph>
  ),
  // A shoe sits along the bottom of its own coordinates, which left it low and
  // small against the labels beside it - measured, 3 units below where every
  // other icon centres. Scaled up and recentred here rather than rewriting each
  // number, with the stroke divided by the same factor so it still lands on the
  // 1.4 the rest of the set uses.
  steps: (
    <Glyph>
      <g transform="translate(-1.1 -5.3) scale(1.2)" strokeWidth={1.4 / 1.2}>
        <path d="M2.1 12.9V7.7h2.6l1.5 1.7c.9.9 2.2 1.3 3.5 1.6l2.1.5c1.2.3 1.7 1.4 1 2.3-.3.4-.7.6-1.2.6H3.4a1.3 1.3 0 0 1-1.3-1.5Z" />
        <path d="M5.3 9.5 6.7 8.2M7.6 10.7 8.9 9.4" />
      </g>
    </Glyph>
  ),
  heartRate: (
    <Glyph>
      <path d="M13.4 5.6a3.1 3.1 0 0 0-5.4-2 3.1 3.1 0 0 0-5.4 2c0 3.2 5.4 7 5.4 7s5.4-3.8 5.4-7Z" />
      <path d="M2.8 8.1h2.3l1-1.7 1.4 3 1-1.3h3.1" />
    </Glyph>
  ),
  bluetooth: (
    <Glyph>
      <path d="M5.2 4.6 10.8 11 8 13.6V2.4L10.8 5 5.2 11.4" />
    </Glyph>
  ),
  // Just the cloud. A sun tucked behind it turned to noise once shrunk.
  weather: (
    <Glyph>
      <path d="M4.7 12.7h6.6a2.8 2.8 0 0 0 .5-5.6 4 4 0 0 0-7.7-.3 2.9 2.9 0 0 0 .6 5.9Z" />
    </Glyph>
  ),
  compass: (
    <Glyph>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M10.6 5.4 6.6 6.6 5.4 10.6l4-1.2Z" />
    </Glyph>
  ),
  polygon: (
    <Glyph>
      <path d="M8 1.6l6.1 4.4-2.3 7.2H4.2L1.9 6Z" />
    </Glyph>
  ),
  circle: (
    <Glyph>
      <circle cx="8" cy="8" r="6.3" />
    </Glyph>
  ),
  line: (
    <Glyph>
      <path d="M3.1 12.9 12.9 3.1" />
      <circle cx="3.1" cy="12.9" r="1.5" />
      <circle cx="12.9" cy="3.1" r="1.5" />
    </Glyph>
  ),
  image: (
    <Glyph>
      <rect x="1.6" y="3" width="12.8" height="10" rx="1.6" />
      <circle cx="5.6" cy="6.4" r="1.2" />
      <path d="M1.9 11.2l3.5-3 3 2.4 2.3-1.9 3.2 2.7" />
    </Glyph>
  ),
};

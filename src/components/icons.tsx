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

/**
 * The right-click menu on the watch preview.
 *
 * The canvas used to leave the secondary button to the browser, which was worse
 * than doing nothing: the pointer handlers fired on any button, so a right click
 * started a drag that never saw its pointerup once the native menu opened, and
 * the element stayed glued to the cursor. Owning the gesture fixes that and
 * gives grouping somewhere obvious to live.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect(): void;
}

/** A separator between groups of items. */
export type MenuEntry = MenuItem | 'separator';

export interface ContextMenuProps {
  /** Where the click happened, in viewport coordinates. */
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose(): void;
}

/** Keep the menu on screen when the click lands near an edge. */
const MARGIN = 8;

export function ContextMenu({ x, y, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Measure after mount and flip back inside the viewport before the browser
  // paints, so the menu never visibly jumps from off-screen to on.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - width - MARGIN),
      top: Math.min(y, window.innerHeight - height - MARGIN),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Pointerdown rather than click, so the menu is gone before whatever was
    // under it reacts to the same gesture.
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      // The menu is itself inside the canvas, which owns contextmenu; without
      // this a second right click would reopen it against its own bounds.
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === 'separator' ?
          <div className="context-menu-rule" key={`sep${i}`} />
        : <button
            key={entry.label}
            type="button"
            role="menuitem"
            className="context-menu-item"
            data-danger={entry.danger || undefined}
            disabled={entry.disabled}
            onClick={() => {
              entry.onSelect();
              onClose();
            }}
          >
            <span className="context-menu-icon" aria-hidden>
              {entry.icon}
            </span>
            <span className="context-menu-label">{entry.label}</span>
          </button>,
      )}
    </div>
  );
}

/**
 * The watch preview and the direct-manipulation surface: drop targets for new
 * elements, dragging, resizing, and the selection overlay.
 */

import { useCallback, useRef, useState } from 'react';
import { useStore } from '../store';
import { createElement, isPaletteId } from '../lib/defaults';
import {
  elementBox,
  isResizable,
  isSquare,
  lineDelta,
  lineFromDelta,
  resizePatch,
  type Box,
} from '../lib/geometry';
import { previewValues, useClock } from '../lib/previewValues';
import { useCustomFonts, useSystemFontMetrics } from '../lib/fontLoader';
import { useRenderedImages } from '../lib/imageConvert';
import { ElementVisual } from './ElementVisual';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { CollectIcon, DuplicateIcon, GroupIcon, TrashIcon, UngroupIcon } from './icons';
import { bringOnScreen, offScreenElements } from '../lib/platformConvert';
import { clamp } from '../lib/utils';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

const HANDLE_POSITION: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
};

/**
 * Every screen is a multiple of 4 in each direction - 200x228, 144x168, and
 * 260x260 - so a 4px step divides them evenly and keeps elements on a
 * consistent rhythm.
 */
export const PIXEL_GRID = 4;

/** A heavier line every this many cells, so a 4px grid stays readable. */
const GRID_EMPHASIS = 4;

export interface CanvasSettings {
  zoom: number;
  showGrid: boolean;
  snap: number;
}

export function Canvas({
  settings,
  onSelectOnCanvas,
}: {
  settings: CanvasSettings;
  /** Fired only when a tap on the watch picks an element, not on every
   *  selection change - adding from the palette selects too, and that should
   *  not drag the stacked layout away from the palette. */
  onSelectOnCanvas?: (id: string) => void;
}) {
  const store = useStore();
  const { project, preview, spec } = store;
  const { zoom, showGrid, snap } = settings;
  const screenRef = useRef<HTMLDivElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  useClock(preview.useLiveTime);
  useCustomFonts(project.fonts);
  useSystemFontMetrics();
  const imageVariants = project.elements
    .filter((el) => el.type === 'image' && el.visible)
    .map((el) => ({ assetId: (el as { assetId: string }).assetId, size: { width: (el as { w: number }).w, height: (el as { h: number }).h } }));
  const renderedImages = useRenderedImages(project.images, imageVariants, spec.colorMode);
  const values = previewValues(preview);
  const { width, height } = spec;

  const snapValue = useCallback((v: number) => (snap > 1 ? Math.round(v / snap) * snap : Math.round(v)), [snap]);

  /** Shared pointer-drag plumbing for both moving and resizing. */
  const startDrag = (
    e: React.PointerEvent,
    onMove: (dx: number, dy: number, shift: boolean) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      if (!moved) {
        moved = true;
        store.beginHistory();
      }
      onMove(dx, dy, ev.shiftKey);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /**
   * What a press on `id` should end up dragging. The store widens a selection
   * to whole groups, but its state does not update until after this handler
   * returns, so the same widening is done here to know what to move now.
   */
  const dragSetFor = (id: string): string[] => {
    if (store.selectedIds.includes(id)) return store.selectedIds;
    const el = project.elements.find((item) => item.id === id);
    if (el?.groupId) {
      return project.elements.filter((item) => item.groupId === el.groupId).map((item) => item.id);
    }
    return [id];
  };

  const onElementPointerDown = (e: React.PointerEvent, id: string) => {
    // The secondary button belongs to the context menu. Letting it through here
    // is what used to start a drag with no pointerup to end it.
    if (e.button !== 0) return;
    const el = project.elements.find((item) => item.id === id);
    if (!el) return;

    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // A modified click edits the selection; it never also starts a drag,
      // which would move whatever was just added by whatever the hand wobbled.
      store.select(id, { additive: true });
      return;
    }

    const ids = dragSetFor(id);
    if (!store.selectedIds.includes(id)) store.select(id);
    onSelectOnCanvas?.(id);
    if (el.locked) return;

    // Locked elements stay put even when the selection sweeps them up.
    const origins = ids
      .map((each) => project.elements.find((item) => item.id === each))
      .filter((item): item is NonNullable<typeof item> => !!item && !item.locked)
      .map((item) => ({ id: item.id, x: item.x, y: item.y }));
    const anchor = origins.find((o) => o.id === id);
    if (!anchor) return;

    startDrag(e, (dx, dy) => {
      // Snap the element under the cursor, then shift the rest by the same
      // amount. Snapping each one on its own would grind a selection's relative
      // spacing away a pixel at a time.
      const shiftX = clamp(snapValue(anchor.x + dx), -400, width + 400) - anchor.x;
      const shiftY = clamp(snapValue(anchor.y + dy), -400, height + 400) - anchor.y;
      store.patchElements(
        origins.map((o) => ({
          id: o.id,
          patch: {
            x: clamp(o.x + shiftX, -400, width + 400),
            y: clamp(o.y + shiftY, -400, height + 400),
          },
        })),
        { snapshot: false },
      );
    });
  };

  const onCanvasContextMenu = (e: React.MouseEvent, id?: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Right-clicking outside the selection moves to what is under the cursor,
    // the way every other canvas behaves; inside it, the selection is kept.
    if (id && !store.selectedIds.includes(id)) store.select(id);
    if (!id) store.select(null);
    setMenuAt({ x: e.clientX, y: e.clientY });
  };

  const menuEntries = (): MenuEntry[] => {
    const count = store.selectedIds.length;
    const single = store.selected;
    return [
      {
        label: count > 1 ? `Group ${count} elements` : 'Group',
        icon: <GroupIcon />,
        disabled: !store.canGroup,
        onSelect: store.groupSelection,
      },
      {
        label: 'Ungroup',
        icon: <UngroupIcon />,
        disabled: !store.canUngroup,
        onSelect: store.ungroupSelection,
      },
      'separator',
      {
        label: 'Duplicate',
        icon: <DuplicateIcon />,
        disabled: !single,
        onSelect: () => single && store.duplicateElement(single.id),
      },
      {
        label: count > 1 ? `Delete ${count} elements` : 'Delete',
        icon: <TrashIcon />,
        danger: true,
        disabled: count === 0,
        onSelect: store.removeSelection,
      },
    ];
  };

  const onHandlePointerDown = (e: React.PointerEvent, handle: Handle) => {
    const el = store.selected;
    if (!el || el.locked) return;
    const start = elementBox(el);
    const square = isSquare(el);

    startDrag(e, (dx, dy) => {
      let { x, y, w, h } = start;
      if (handle.includes('w')) {
        x = start.x + dx;
        w = start.w - dx;
      }
      if (handle.includes('e')) w = start.w + dx;
      if (handle.includes('n')) {
        y = start.y + dy;
        h = start.h - dy;
      }
      if (handle.includes('s')) h = start.h + dy;

      w = Math.max(2, w);
      h = Math.max(2, h);
      if (square) {
        const size = Math.max(w, h);
        w = size;
        h = size;
      }
      const next: Box = { x: snapValue(x), y: snapValue(y), w: snapValue(w), h: snapValue(h) };
      store.patchElement(el.id, resizePatch(el, next), { snapshot: false });
    });
  };

  const onLineEndpointDown = (e: React.PointerEvent) => {
    const el = store.selected;
    if (!el || el.type !== 'line' || el.locked) return;
    const start = lineDelta(el.length, el.angle);
    // The endpoint is dragged in x/y because that is what a pointer does, then
    // converted back to the length and angle the element actually stores.
    startDrag(e, (dx, dy) => {
      const next = lineFromDelta(snapValue(start.dx + dx), snapValue(start.dy + dy));
      store.patchElement(el.id, next, { snapshot: false });
    });
  };

  const dropPoint = (e: React.DragEvent): { x: number; y: number } => {
    const rect = screenRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const selected = store.selected;
  const selectionBox = selected ? elementBox(selected) : null;
  // Same test the device switch uses, so the two agree on what "off screen"
  // means and the button offers exactly the elements that dialog would move.
  const stray = offScreenElements(project, spec);

  return (
    <div className="stage-body">
      <div
        className="watch-shell"
        data-shell={spec.shell}
        data-shape={spec.shape}
        style={{ padding: spec.bezel }}
      >
        <div
          ref={screenRef}
          className="watch-screen"
          data-drop={dropActive}
          style={{
            width: width * zoom,
            height: height * zoom,
            // A round panel only lights up the inscribed circle, so clipping to
            // it shows the corners for the dead space they are.
            borderRadius: spec.shape === 'round' ? '50%' : spec.screenRadius,
            background: project.backgroundColor,
            boxShadow: dropActive ? '0 0 0 2px var(--accent)' : undefined,
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/x-pwb-element')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            const paletteId = e.dataTransfer.getData('application/x-pwb-element');
            setDropActive(false);
            // The payload is a string off the drag event, so it is checked
            // rather than handed straight to a switch that throws on a miss.
            if (!isPaletteId(paletteId)) return;
            e.preventDefault();
            const { x, y } = dropPoint(e);
            const element = createElement({
              paletteId,
              existing: project.elements,
              x: snapValue(x - 20),
              y: snapValue(y - 10),
              spec,
              defaultImageAssetId: project.images[0]?.id,
            });
            store.addElement(element);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBackground) {
              store.select(null);
            }
          }}
          onContextMenu={(e) => onCanvasContextMenu(e)}
        >
          <div className="canvas-root" style={{ transform: `scale(${zoom})`, width, height }}>
            <div data-canvas-background="true" style={{ position: 'absolute', inset: 0 }} />

            {project.elements.map((el) => {
              if (!el.visible) return null;
              const box = elementBox(el);
              return (
                <div
                  key={el.id}
                  className="el"
                  data-locked={el.locked}
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.w,
                    height: box.h,
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => onElementPointerDown(e, el.id)}
                  onContextMenu={(e) => onCanvasContextMenu(e, el.id)}
                  // A single click on a grouped element takes the whole group,
                  // so this is the way to reach one member to edit it.
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    store.select(el.id, { solo: true });
                  }}
                >
                  <ElementVisual
                    el={el}
                    fonts={project.fonts}
                    images={project.images}
                    values={values}
                    renderedImages={renderedImages}
                  />
                </div>
              );
            })}

            {showGrid && (
              <svg className="canvas-grid" width={width} height={height}>
                <defs>
                  <pattern
                    id="pwb-grid-fine"
                    width={PIXEL_GRID}
                    height={PIXEL_GRID}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${PIXEL_GRID} 0 L 0 0 0 ${PIXEL_GRID}`}
                      fill="none"
                      stroke="#7c8aa0"
                      strokeWidth="0.25"
                    />
                  </pattern>
                  <pattern
                    id="pwb-grid"
                    width={PIXEL_GRID * GRID_EMPHASIS}
                    height={PIXEL_GRID * GRID_EMPHASIS}
                    patternUnits="userSpaceOnUse"
                  >
                    <rect
                      width={PIXEL_GRID * GRID_EMPHASIS}
                      height={PIXEL_GRID * GRID_EMPHASIS}
                      fill="url(#pwb-grid-fine)"
                    />
                    <path
                      d={`M ${PIXEL_GRID * GRID_EMPHASIS} 0 L 0 0 0 ${PIXEL_GRID * GRID_EMPHASIS}`}
                      fill="none"
                      stroke="#7c8aa0"
                      strokeWidth="0.7"
                    />
                  </pattern>
                </defs>
                <rect width={width} height={height} fill="url(#pwb-grid)" />
                <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke="#7c8aa0" strokeWidth="0.5" />
                <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#7c8aa0" strokeWidth="0.5" />
              </svg>
            )}

            {store.selectedElements.length > 1 &&
              store.selectedElements.map((el) => {
                const box = elementBox(el);
                return (
                  <div
                    key={el.id}
                    className="selection selection-multi"
                    data-grouped={el.groupId ? true : undefined}
                    style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  />
                );
              })}

            {selected && selectionBox && (
              <div
                className="selection"
                style={{
                  left: selectionBox.x,
                  top: selectionBox.y,
                  width: selectionBox.w,
                  height: selectionBox.h,
                }}
              >
                {!selected.locked && isResizable(selected) &&
                  HANDLES.map((handle) => (
                    <div
                      key={handle}
                      className="handle"
                      style={{
                        left: HANDLE_POSITION[handle].left,
                        top: HANDLE_POSITION[handle].top,
                        cursor: HANDLE_POSITION[handle].cursor,
                        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => onHandlePointerDown(e, handle)}
                    />
                  ))}
                {!selected.locked && selected.type === 'line' && (
                  <div
                    className="handle"
                    style={{
                      left: selected.x + lineDelta(selected.length, selected.angle).dx - selectionBox.x,
                      top: selected.y + lineDelta(selected.length, selected.angle).dy - selectionBox.y,
                      cursor: 'crosshair',
                      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                      touchAction: 'none',
                    }}
                    onPointerDown={onLineEndpointDown}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="watch-label">{spec.name} · {width}×{height}</div>
      </div>

      {stray.length > 0 && (
        <button
          type="button"
          className="btn btn-sm stage-rescue"
          onClick={() => store.update((p) => bringOnScreen(p, spec))}
          title="Move every element that sits outside the screen back into view"
        >
          <CollectIcon />
          Bring {stray.length} {stray.length === 1 ? 'element' : 'elements'} into view
        </button>
      )}

      {menuAt && (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          entries={menuEntries()}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

/** Z-order list. The last element in the document draws on top, so this list is
 * shown reversed to match what the user sees on the watch. */

import { useRef, useState } from 'react';
import { useStore } from '../store';
import { ELEMENT_KINDS } from '../lib/defaults';

const typeLabel = (type: string): string =>
  ELEMENT_KINDS.find((k) => k.type === type)?.label ?? type;

/** Matches the `gap` on .layer-list, so the indicator sits centered between rows. */
const ROW_GAP = 4;
/** How close to an edge of the scroll area a drag has to get before it scrolls. */
const AUTOSCROLL_MARGIN = 32;
const AUTOSCROLL_STEP = 12;

const LAYER_MIME = 'application/x-pwb-layer';

export function LayersPanel() {
  const store = useStore();
  const { elements } = store.project;
  const [dragId, setDragId] = useState<string | null>(null);
  /** Where the dragged row would land, as a gap index 0..n in visual order. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [indicatorTop, setIndicatorTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Rendered top-of-stack first.
  const ordered = [...elements].reverse();

  const clearDrag = () => {
    setDragId(null);
    setInsertAt(null);
  };

  /**
   * Picks the gap nearest the pointer by comparing against row midpoints, so the
   * whole field - including the padding above the first row and below the last -
   * resolves to a real drop position.
   */
  const updateInsertion = (clientY: number) => {
    const list = listRef.current;
    if (!list) return;

    const rows = rowRefs.current
      .slice(0, ordered.length)
      .filter((row): row is HTMLDivElement => row !== null);
    if (!rows.length) return;

    let gap = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        gap = i;
        break;
      }
    }

    const center =
      gap < rows.length
        ? rows[gap]!.getBoundingClientRect().top - ROW_GAP / 2
        : rows[rows.length - 1]!.getBoundingClientRect().bottom + ROW_GAP / 2;

    setInsertAt(gap);
    setIndicatorTop(center - list.getBoundingClientRect().top);
  };

  /** Keeps the ends of a long list reachable without letting go of the drag. */
  const autoScroll = (clientY: number) => {
    const scroller = listRef.current?.closest('.panel-scroll');
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (clientY < rect.top + AUTOSCROLL_MARGIN) {
      scroller.scrollTop -= AUTOSCROLL_STEP;
    } else if (clientY > rect.bottom - AUTOSCROLL_MARGIN) {
      scroller.scrollTop += AUTOSCROLL_STEP;
    }
  };

  if (!elements.length) {
    return (
      <div className="panel-scroll">
        <div className="empty">
          No elements yet.
          <br />
          Add one from the <strong>Add</strong> tab.
        </div>
      </div>
    );
  }

  return (
    <div className="panel-scroll panel-scroll-fill">
      <div className="section-title">Layers - top first</div>
      <p className="field-hint" style={{ marginBottom: 4 }}>
        Drag to reorder. Items higher in this list are drawn later, so they cover the ones below.
      </p>

      <div
        className="layer-dropfield"
        data-active={dragId !== null}
        onDragOver={(e) => {
          if (!dragId && !e.dataTransfer.types.includes(LAYER_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          autoScroll(e.clientY);
          updateInsertion(e.clientY);
        }}
        onDragLeave={(e) => {
          // Ignore the leave events fired while crossing between child rows.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setInsertAt(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && insertAt !== null) {
            // Visual order is reversed, so a gap at visual position p is the
            // document gap (length - p).
            store.moveElementToIndex(dragId, elements.length - insertAt);
          }
          clearDrag();
        }}
      >
        <div className="layer-list" ref={listRef}>
          {ordered.map((el, visualIndex) => (
            <div
              key={el.id}
              ref={(node) => {
                rowRefs.current[visualIndex] = node;
              }}
              className="layer"
              data-selected={el.id === store.selectedId}
              data-dragging={dragId === el.id}
              draggable
              onDragStart={(e) => {
                setDragId(el.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(LAYER_MIME, el.id);
              }}
              onDragEnd={clearDrag}
              onClick={() => store.select(el.id)}
            >
              <span className="layer-grip" aria-hidden>
                ⣿
              </span>
              <span className="layer-name">
                {el.name}
                <span className="layer-type"> · {typeLabel(el.type)}</span>
              </span>
              <button
                type="button"
                className="layer-toggle"
                title={el.visible ? 'Hide' : 'Show'}
                onClick={(e) => {
                  e.stopPropagation();
                  store.patchElement(el.id, { visible: !el.visible });
                }}
              >
                {el.visible ? '👁' : '🚫'}
              </button>
              <button
                type="button"
                className="layer-toggle"
                title={el.locked ? 'Unlock' : 'Lock'}
                onClick={(e) => {
                  e.stopPropagation();
                  store.patchElement(el.id, { locked: !el.locked });
                }}
              >
                {el.locked ? '🔒' : '🔓'}
              </button>
            </div>
          ))}

          {dragId !== null && insertAt !== null && (
            <div className="layer-drop-indicator" style={{ top: indicatorTop }} />
          )}
        </div>
      </div>
    </div>
  );
}

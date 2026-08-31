/** The "add an element" palette. Items can be dragged onto the watch or clicked. */

import { useStore } from '../store';
import { createElement, elementKindsFor } from '../lib/defaults';

const GROUPS = ['Time & date', 'Complications', 'Shapes & art'] as const;

export function PalettePanel() {
  const store = useStore();

  const kinds = elementKindsFor(store.spec);

  const add = (paletteId: string) => {
    const element = createElement({
      paletteId,
      existing: store.project.elements,
      spec: store.spec,
      x: store.spec.width / 2 - 40,
      y: store.spec.height / 2 - 12,
      defaultImageAssetId: store.project.images[0]?.id,
    });
    store.addElement(element);
  };

  return (
    <div className="panel-scroll">
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Drag an element onto the watch, or click to drop it in the middle.
      </p>
      {GROUPS.map((group) => (
        <div key={group}>
          <div className="section-title">{group}</div>
          <div className="palette">
            {kinds.filter((k) => k.group === group).map((kind) => (
              <button
                key={kind.paletteId}
                type="button"
                className="palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-pwb-element', kind.paletteId);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => add(kind.paletteId)}
              >
                <span className="pi-top">
                  <span aria-hidden>{kind.icon}</span>
                  {kind.label}
                </span>
                <span className="pi-hint">{kind.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

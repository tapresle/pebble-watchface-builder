/**
 * The device chooser. Shown on a first visit, when starting a new watchface,
 * and when retargeting an existing design at a different watch.
 */

import { useState } from 'react';
import { useStore } from '../store';
import type { PlatformId } from '../types';
import { PLATFORM_LIST, type PlatformSpec } from '../lib/platform';
import { tokensFor } from '../lib/defaults';
import { summarizeConversion } from '../lib/platformConvert';
import { Modal, ModalBody, ModalFooter, ModalHeader } from './Modal';

/** Every screen is drawn at one scale so the size differences are honest. */
const PREVIEW_SCALE = 0.46;
/**
 * Every card reserves room for the tallest watch, case included, so a shorter
 * one does not pull the name and spec rows up out of line with the card beside
 * it.
 */
const PREVIEW_BOX_HEIGHT = Math.round(
  Math.max(...PLATFORM_LIST.map((p) => (p.height + p.bezel * 2) * PREVIEW_SCALE)),
);

function MiniWatch({ spec }: { spec: PlatformSpec }) {
  const w = Math.round(spec.width * PREVIEW_SCALE);
  const h = Math.round(spec.height * PREVIEW_SCALE);
  // Straight from the element defaults, so the preview is an honest sample of
  // what you get when you pick this watch.
  const t = tokensFor(spec);
  // The same bezel the canvas draws, scaled down with the screen, so the case
  // here is in proportion rather than a flat few pixels all round.
  const bezel = Math.round(spec.bezel * PREVIEW_SCALE);
  return (
    <div
      className="mini-watch"
      data-shell={spec.shell}
      data-shape={spec.shape}
      style={{ padding: bezel }}
    >
      <div
        className="mini-screen"
        data-shape={spec.shape}
        style={{ width: w, height: h, background: t.bg }}
      >
        <div className="mini-time" style={{ color: t.fg }}>
          10:09
        </div>
        <div className="mini-date" style={{ color: t.muted }}>
          FRI 28
        </div>
        <div className="mini-bar" style={{ borderColor: t.fg }}>
          <div className="mini-bar-fill" style={{ background: t.accent }} />
        </div>
      </div>
    </div>
  );
}

function DeviceCard({
  spec,
  selected,
  isCurrent,
  onSelect,
}: {
  spec: PlatformSpec;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="device-card"
      data-selected={selected}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="device-preview" style={{ height: PREVIEW_BOX_HEIGHT }}>
        <MiniWatch spec={spec} />
      </div>
      <div className="device-name">
        {spec.name}
        {isCurrent && <span className="device-badge">Current</span>}
      </div>
      <dl className="device-specs">
        <div>
          <dt>Screen</dt>
          <dd>
            {spec.width} × {spec.height}
          </dd>
        </div>
        <div>
          <dt>Shape</dt>
          <dd>{spec.shape === 'round' ? 'Round' : 'Rectangular'}</dd>
        </div>
        <div>
          <dt>Colors</dt>
          <dd>{spec.colorMode === 'bw' ? 'Black & white' : `${spec.colorCount} colors`}</dd>
        </div>
        <div>
          <dt>SDK platform</dt>
          <dd>
            <code>{spec.sdkPlatform}</code>
          </dd>
        </div>
      </dl>
    </button>
  );
}

export interface DevicePickerProps {
  /** 'new' throws away the current design; 'switch' converts it in place. */
  mode: 'new' | 'switch';
  /** Omit to make the dialog non-dismissible, as on a first visit. */
  onCancel?: () => void;
  onPick: (platform: PlatformId) => void;
}

export function DevicePicker({ mode, onCancel, onPick }: DevicePickerProps) {
  const store = useStore();
  const current = store.project.platform;
  const [choice, setChoice] = useState<PlatformId>(current);

  const target = PLATFORM_LIST.find((p) => p.id === choice)!;
  const conversion = mode === 'switch' ? summarizeConversion(store.project, choice) : null;
  const switchingAway = mode === 'switch' && choice !== current;

  const title = mode === 'new' ? 'Which watch are you designing for?' : 'Change target watch';
  const subtitle =
    mode === 'new'
      ? 'This sets the canvas size, the colors you can use, and the platform the exported project targets. You can change it later.'
      : 'Your elements stay put. Colors and any off-screen positions are adjusted to suit the new screen.';

  return (
    <Modal size="md" label={title} onClose={onCancel}>
      <ModalHeader title={title} subtitle={subtitle} onClose={onCancel} />
      <ModalBody>
        <div className="device-grid">
          {PLATFORM_LIST.map((spec) => (
            <DeviceCard
              key={spec.id}
              spec={spec}
              selected={choice === spec.id}
              isCurrent={mode === 'switch' && spec.id === current}
              onSelect={() => setChoice(spec.id)}
            />
          ))}
        </div>

        {mode === 'new' && store.project.elements.length > 0 && !store.needsDeviceChoice && (
          <div className="callout callout-warn">
            <strong className="callout-title">This replaces your current design</strong>
            Everything on the canvas is cleared. Undo (⌘Z) brings it back if you change your mind.
          </div>
        )}

        {switchingAway && conversion && (
          <div className="callout">
            <strong className="callout-title">What changes</strong>
            {conversion.recolored > 0 && (
              <>
                {conversion.recolored} element{conversion.recolored === 1 ? '' : 's'} will be
                recolored to fit the {target.colorMode === 'bw' ? '1-bit' : '64-color'} palette.{' '}
              </>
            )}
            {conversion.moved > 0 && (
              <>
                {conversion.moved} element{conversion.moved === 1 ? '' : 's'}{' '}
                {target.shape === 'round' ? (
                  <>
                    sit{conversion.moved === 1 ? 's' : ''} where the {target.name} cannot show them - a round panel only lights up the
                    circle inscribed in its {target.width} × {target.height} framebuffer, so the
                    corners are dead space - and will be pulled into view.{' '}
                  </>
                ) : (
                  <>
                    sit{conversion.moved === 1 ? 's' : ''} outside the {target.width} × {target.height} screen and will be nudged back
                    into view.{' '}
                  </>
                )}
              </>
            )}
            {conversion.heartRateStranded > 0 && (
              <>
                {conversion.heartRateStranded} heart rate element
                {conversion.heartRateStranded === 1 ? '' : 's'} will keep showing the placeholder -
                the {target.name} has no heart rate sensor.{' '}
              </>
            )}
            {conversion.compassStranded > 0 && (
              <>
                {conversion.compassStranded} compass element
                {conversion.compassStranded === 1 ? '' : 's'} will keep showing the placeholder -
                the {target.name} has no magnetometer.{' '}
              </>
            )}
            {conversion.recolored === 0 &&
              conversion.moved === 0 &&
              conversion.heartRateStranded === 0 &&
              conversion.compassStranded === 0 && (
                <>Nothing needs adjusting - everything already fits.</>
              )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={mode === 'switch' && choice === current}
          onClick={() => onPick(choice)}
        >
          {mode === 'new' ? `Start designing for ${target.name}` : `Switch to ${target.name}`}
        </button>
      </ModalFooter>
    </Modal>
  );
}

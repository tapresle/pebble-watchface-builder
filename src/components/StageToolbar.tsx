/** Preview state controls plus canvas view options, shown under the watch. */

import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { CONDITION_LABEL, WEATHER_CONDITIONS, type WeatherCondition } from '../lib/weather';
import { PIXEL_GRID, type CanvasSettings } from './Canvas';

/**
 * A labelled number box.
 *
 * Values are clamped as they are typed, but an empty box is left alone so a
 * field can be cleared and retyped rather than snapping to its minimum on the
 * first keystroke.
 */
function NumberChip({
  label,
  value,
  min,
  max,
  step,
  width = 56,
  suffix,
  children,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  width?: number;
  suffix?: string;
  /** Extra controls sharing the chip, such as a slider. */
  children?: ReactNode;
  onChange: (value: number) => void;
}) {
  return (
    <span className="chip">
      {label}
      {children}
      <input
        className="input"
        style={{ width, padding: '2px 6px' }}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          if (e.target.value === '') return;
          const next = Number(e.target.value);
          if (Number.isNaN(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
        aria-label={label}
      />
      {suffix}
    </span>
  );
}

export function StageToolbar({
  settings,
  onSettings,
}: {
  settings: CanvasSettings;
  onSettings: (next: CanvasSettings) => void;
}) {
  const store = useStore();
  const { preview } = store;
  const hasWeather = store.project.elements.some((el) => el.type === 'weather');
  const hasCompass = store.project.elements.some((el) => el.type === 'compass');
  // Only changes how the boxes below are read and written. The preview itself
  // always keeps the hour on a 24 hour clock.
  const [clock12, setClock12] = useState(false);

  const pm = preview.hour >= 12;
  const shownHour = clock12 ? preview.hour % 12 || 12 : preview.hour;
  const hourMin = clock12 ? 1 : 0;
  const hourMax = clock12 ? 12 : 23;

  const commitHour = (raw: number) => {
    const hour = Math.min(hourMax, Math.max(hourMin, raw));
    store.setPreview({ hour: clock12 ? (hour % 12) + (pm ? 12 : 0) : hour });
  };

  return (
    <div className="stage-toolbar">
      <label className="checkbox" style={{ padding: 0 }}>
        <input
          type="checkbox"
          checked={preview.useLiveTime}
          onChange={(e) => store.setPreview({ useLiveTime: e.target.checked })}
        />
        <span>Live clock</span>
      </label>

      {!preview.useLiveTime && (
        <span className="chip">
          Time
          <input
            className="input"
            style={{ width: 44, padding: '2px 6px' }}
            type="number"
            min={hourMin}
            max={hourMax}
            value={shownHour}
            onChange={(e) => {
              if (e.target.value === '') return;
              const raw = Number(e.target.value);
              if (!Number.isNaN(raw)) commitHour(raw);
            }}
            aria-label="Preview hour"
          />
          <strong>:</strong>
          <input
            className="input"
            style={{ width: 44, padding: '2px 6px' }}
            type="number"
            min={0}
            max={59}
            value={preview.minute}
            onChange={(e) => {
              if (e.target.value === '') return;
              const raw = Number(e.target.value);
              if (!Number.isNaN(raw)) store.setPreview({ minute: Math.min(59, Math.max(0, raw)) });
            }}
            aria-label="Preview minute"
          />
          {clock12 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => store.setPreview({ hour: (preview.hour + 12) % 24 })}
            >
              {pm ? 'PM' : 'AM'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setClock12((on) => !on)}
            title="Switch between a 24 hour and a 12 hour clock"
          >
            {clock12 ? '12h' : '24h'}
          </button>
        </span>
      )}

      <NumberChip
        label="Battery"
        value={preview.battery}
        min={0}
        max={100}
        width={48}
        suffix="%"
        onChange={(battery) => store.setPreview({ battery: Math.round(battery) })}
      >
        <input
          type="range"
          className="range"
          style={{ width: 72 }}
          min={0}
          max={100}
          value={preview.battery}
          onChange={(e) => store.setPreview({ battery: Number(e.target.value) })}
          aria-label="Preview battery level"
        />
      </NumberChip>

      <label className="checkbox" style={{ padding: 0 }}>
        <input
          type="checkbox"
          checked={preview.charging}
          onChange={(e) => store.setPreview({ charging: e.target.checked })}
        />
        <span>Charging</span>
      </label>

      <label className="checkbox" style={{ padding: 0 }}>
        <input
          type="checkbox"
          checked={preview.bluetooth}
          onChange={(e) => store.setPreview({ bluetooth: e.target.checked })}
        />
        <span>Connected</span>
      </label>

      <NumberChip
        label="Steps"
        value={preview.steps}
        min={0}
        max={99999}
        width={68}
        onChange={(steps) => store.setPreview({ steps: Math.round(steps) })}
      />

      {store.spec.hasHeartRate && (
        <NumberChip
          label="Heart rate"
          value={preview.heartRate}
          min={0}
          max={250}
          suffix="bpm"
          onChange={(heartRate) => store.setPreview({ heartRate: Math.round(heartRate) })}
        />
      )}

      {hasWeather && (
        <>
          <span className="chip">
            Weather
            <select
              className="input"
              style={{ width: 108, padding: '2px 4px' }}
              value={preview.weatherCondition}
              onChange={(e) =>
                store.setPreview({ weatherCondition: e.target.value as WeatherCondition })
              }
              aria-label="Preview weather condition"
            >
              {WEATHER_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </select>
          </span>
          <NumberChip
            label="Temp"
            value={preview.weatherTempC}
            min={-60}
            max={60}
            width={52}
            suffix="°C"
            onChange={(weatherTempC) => store.setPreview({ weatherTempC: Math.round(weatherTempC) })}
          />
        </>
      )}

      {hasCompass && (
        <NumberChip
          label="Heading"
          value={preview.compassHeading}
          min={0}
          max={359}
          suffix="°"
          onChange={(compassHeading) =>
            store.setPreview({ compassHeading: Math.round(compassHeading) })
          }
        />
      )}

      <span style={{ flex: 1 }} />

      {/* Shown as a percentage, kept as a multiplier: the canvas scales and
          divides drag deltas by it, so 2 is more useful there than 200. */}
      <NumberChip
        label="Zoom"
        value={Math.round(settings.zoom * 100)}
        min={100}
        max={400}
        step={25}
        width={56}
        suffix="%"
        onChange={(percent) => onSettings({ ...settings, zoom: percent / 100 })}
      >
        <input
          type="range"
          className="range"
          style={{ width: 72 }}
          min={100}
          max={400}
          step={25}
          value={Math.round(settings.zoom * 100)}
          onChange={(e) => onSettings({ ...settings, zoom: Number(e.target.value) / 100 })}
          aria-label="Canvas zoom"
        />
      </NumberChip>

      <label className="checkbox" style={{ padding: 0 }}>
        <input
          type="checkbox"
          checked={settings.showGrid}
          onChange={(e) => onSettings({ ...settings, showGrid: e.target.checked })}
        />
        <span>Grid</span>
      </label>

      <label className="checkbox" style={{ padding: 0 }}>
        <input
          type="checkbox"
          checked={settings.snap > 1}
          onChange={(e) => onSettings({ ...settings, snap: e.target.checked ? PIXEL_GRID : 1 })}
        />
        <span>Snap {PIXEL_GRID}px</span>
      </label>
    </div>
  );
}

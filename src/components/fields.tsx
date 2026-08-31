/** Small, reusable form controls used throughout the inspector and panels. */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { quantizeToPlatform } from '../lib/platform';
import { useStore } from '../store';

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  hint,
  mono,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  hint?: ReactNode;
  mono?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        style={mono ? { fontFamily: 'var(--font-mono)', fontSize: 12 } : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea className="textarea" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
}

/** A bare clamped number box, shared by NumberField and the slider fields. */
function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  className = 'input',
  ariaLabel,
}: NumberInputProps) {
  // Kept as a string while focused so intermediate states like "-" or "" work.
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(next);
    setDraft(String(next));
  };

  return (
    <input
      className={className}
      type="number"
      value={draft}
      step={step}
      min={min}
      max={max}
      aria-label={ariaLabel}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value !== '' && e.target.value !== '-') commit(e.target.value);
      }}
      onBlur={(e) => {
        setEditing(false);
        commit(e.target.value);
      }}
    />
  );
}

export function NumberField({
  label,
  hint,
  ...input
}: NumberInputProps & { label?: string; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput {...input} />
    </Field>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
  editable = false,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  /** Pairs the slider with a number box, for values the slider is too coarse for. */
  editable?: boolean;
  hint?: ReactNode;
}) {
  const slider = (
    <input
      className="range"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
    />
  );

  if (!editable) {
    return <Field label={`${label} - ${value}${suffix}`} hint={hint}>{slider}</Field>;
  }

  return (
    <Field label={label} hint={hint}>
      <div className="slider-row">
        {slider}
        <div className="slider-number">
          <NumberInput
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            ariaLabel={`${label} value`}
          />
          {suffix && <span className="slider-suffix">{suffix}</span>}
        </div>
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string; group?: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  const groups = [...new Set(options.map((o) => o.group).filter(Boolean))] as string[];
  return (
    <Field label={label} hint={hint}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {/* Ungrouped entries stay at the top so placeholders keep working. */}
        {options
          .filter((o) => !o.group)
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {options
              .filter((o) => o.group === group)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="checkbox" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <div className="segmented">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Swatch names used when a platform has few enough colors to label them. */
const SWATCH_LABELS: Record<string, string> = {
  '#000000': 'Black',
  '#ffffff': 'White',
};

export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  const { spec } = useStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // A 1-bit watch gets named buttons; 64 swatches get the grid.
  const labelled = spec.palette.length <= 4;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="field" ref={wrapRef} style={{ position: 'relative' }}>
      <label className="field-label">{label}</label>
      <button type="button" className="color-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="color-swatch" style={{ background: value }} />
        <span className="color-value">{value.toUpperCase()}</span>
      </button>
      {open && (
        <div
          className="color-popover"
          data-labelled={labelled}
          style={{ top: '100%', left: 0, marginTop: 4 }}
        >
          <div
            className={labelled ? 'color-grid color-grid-labelled' : 'color-grid'}
            style={{ gridTemplateColumns: `repeat(${spec.paletteColumns}, 1fr)` }}
          >
            {spec.palette.map((hex) => (
              <button
                key={hex}
                type="button"
                className="color-cell"
                data-active={hex.toLowerCase() === value.toLowerCase()}
                style={{ background: hex }}
                title={SWATCH_LABELS[hex] ?? hex.toUpperCase()}
                onClick={() => {
                  onChange(hex);
                  setOpen(false);
                }}
              >
                {labelled && <span className="color-cell-label">{SWATCH_LABELS[hex] ?? hex}</span>}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 9 }}>
            <input
              className="input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
              defaultValue={value}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const raw = (e.target as HTMLInputElement).value.trim();
                if (/^#?[0-9a-f]{6}$/i.test(raw)) {
                  onChange(quantizeToPlatform(raw.startsWith('#') ? raw : `#${raw}`, spec));
                  setOpen(false);
                }
              }}
            />
            <div className="field-hint" style={{ marginTop: 5 }}>
              Type a hex value and press Enter - it snaps to the nearest of the{' '}
              {spec.colorMode === 'bw' ? 'two shades' : `${spec.colorCount} colors`} the{' '}
              {spec.name} can display.
            </div>
          </div>
        </div>
      )}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

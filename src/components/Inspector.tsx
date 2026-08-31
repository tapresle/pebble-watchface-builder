/** Property editor for the selected element. */

import type { ReactNode } from 'react';
import { useStore } from '../store';
import type { CustomFont, FontRef, WatchElement } from '../types';
import {
  DATE_FORMAT_PRESETS,
  SYSTEM_FONTS,
  TIME_FORMAT_PRESETS,
  fidelityNote,
  inferTimeMode,
  systemFont,
} from '../lib/platform';
import { strftime } from '../lib/strftime';
import { previewValues } from '../lib/previewValues';
import {
  MAX_POLYGON_SIDES,
  MIN_POLYGON_SIDES,
  elementBox,
  hasFont,
  isAxisAlignedRect,
  isSquare,
  sizeProperty,
} from '../lib/geometry';
import {
  COMPASS_DISPLAY_OPTIONS,
  COMPASS_POINT_OPTIONS,
  COMPASS_REFRESH_MS,
} from '../lib/compass';
import { WEATHER_FIELDS, isTemperatureField } from '../lib/weather';
import {
  ColorField,
  Field,
  NumberField,
  Segmented,
  SelectField,
  SliderField,
  TextField,
  ToggleField,
} from './fields';

type Patch = Partial<WatchElement>;

/**
 * Common polygons. The rotations are the ones that make each shape sit square
 * with the screen once it is normalized into its bounding box: a point-up
 * triangle, an axis-aligned rectangle, and flat-topped hexagons and octagons.
 */
/**
 * The conversions strftime understands. Pebble's is newlib's, so the standard
 * C reference is the accurate one; the app's own preview implements the same
 * subset.
 */
const STRFTIME_REFERENCE = 'https://man7.org/linux/man-pages/man3/strftime.3.html';

function StrftimeHint({ children }: { children: ReactNode }) {
  return (
    <>
      {children}{' '}
      <a href={STRFTIME_REFERENCE} target="_blank" rel="noreferrer noopener">
        Full list of conversions
      </a>
      .
    </>
  );
}

const POLYGON_PRESETS: { label: string; sides: number; rotation: number }[] = [
  { label: 'Triangle', sides: 3, rotation: 0 },
  { label: 'Rectangle', sides: 4, rotation: 45 },
  { label: 'Hexagon', sides: 6, rotation: 30 },
  { label: 'Octagon', sides: 8, rotation: 22.5 },
];

function FontPicker({
  font,
  fonts,
  onChange,
}: {
  font: FontRef;
  fonts: CustomFont[];
  onChange: (font: FontRef) => void;
}) {
  const value = font.kind === 'system' ? `sys:${font.key}` : `custom:${font.fontId}`;
  const options = [
    ...SYSTEM_FONTS.map((f) => ({
      value: `sys:${f.key}`,
      label: f.coverage === 'full' ? f.label : `${f.label} - digits only`,
      group: `System · ${f.group}`,
    })),
    ...fonts.map((f) => ({
      value: `custom:${f.id}`,
      label: `${f.identifier} (${f.fileName})`,
      group: 'Your fonts',
    })),
  ];

  const selected = font.kind === 'system' ? systemFont(font.key) : null;
  const coverage = selected?.coverage ?? 'full';

  return (
    <>
      <SelectField
        label="Font"
        value={value}
        options={options}
        onChange={(next) => {
          if (next.startsWith('sys:')) {
            onChange({ kind: 'system', key: next.slice(4) });
          } else {
            const id = next.slice(7);
            onChange({ kind: 'custom', fontId: id, size: font.kind === 'custom' ? font.size : 28 });
          }
        }}
        hint={
          fonts.length === 0
            ? 'Upload a .ttf in the Assets tab to use your own typeface.'
            : undefined
        }
      />
      {coverage !== 'full' && (
        <div className="warning-bar">
          This system font only contains digits{coverage === 'numbers+ampm' ? ', AM and PM' : ''}.
          Letters will not render on the watch.
        </div>
      )}
      {selected && (
        <div className="field-hint" style={{ marginTop: -6, marginBottom: 11 }}>
          {fidelityNote(selected)}
        </div>
      )}
      {font.kind === 'custom' && (
        <NumberField
          label="Font size (px)"
          value={font.size}
          min={6}
          max={160}
          onChange={(size) => onChange({ kind: 'custom', fontId: font.fontId, size: Math.round(size) })}
          hint="Each size you use becomes a separate resource in CloudPebble."
        />
      )}
    </>
  );
}

function TextBoxControls({ el, patch }: { el: WatchElement; patch: (p: Patch) => void }) {
  const store = useStore();
  if (!hasFont(el)) return null;
  return (
    <>
      <FontPicker
        font={el.font}
        fonts={store.project.fonts}
        onChange={(font) => patch({ font } as Patch)}
      />
      <Segmented
        label="Alignment"
        value={el.align}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={(align) => patch({ align } as Patch)}
      />
      <ColorField label="Color" value={el.color} onChange={(color) => patch({ color } as Patch)} />
    </>
  );
}

function BatteryStateColors({
  el,
  patch,
}: {
  el: Extract<WatchElement, { lowThreshold: number }>;
  patch: (p: Patch) => void;
}) {
  return (
    <>
      <div className="section-title">Battery states</div>
      <ColorField
        label="Charging color"
        value={el.chargingColor}
        onChange={(chargingColor) => patch({ chargingColor } as Patch)}
      />
      <ColorField
        label="Low color"
        value={el.lowColor}
        onChange={(lowColor) => patch({ lowColor } as Patch)}
      />
      <SliderField
        label="Low below"
        value={el.lowThreshold}
        min={0}
        max={100}
        suffix="%"
        onChange={(lowThreshold) => patch({ lowThreshold } as Patch)}
      />
    </>
  );
}

function TypeControls({ el, patch }: { el: WatchElement; patch: (p: Patch) => void }) {
  const store = useStore();

  switch (el.type) {
    case 'time': {
      // A time element only offers clock presets and a date element only offers
      // calendar ones. Both are strftime underneath, so the custom field can
      // still express anything.
      const mode = el.mode === 'time' || el.mode === 'date' ? el.mode : inferTimeMode(el.format);
      const presets = mode === 'time' ? TIME_FORMAT_PRESETS : DATE_FORMAT_PRESETS;
      // Examples are rendered off the clock the preview is using, so they read
      // as right now rather than as some date baked in when this was written.
      const now = previewValues(store.preview).date;
      return (
        <>
          <div className="section-title">Format</div>
          <SelectField
            label="Preset"
            value={presets.some((p) => p.format === el.format) ? el.format : ''}
            options={[
              { value: '', label: 'Custom format' },
              ...presets.map((p) => ({
                value: p.format,
                label: `${p.name} · ${strftime(p.format, now)}`,
              })),
            ]}
            onChange={(format) => format && patch({ format } as Patch)}
          />
          <TextField
            label="strftime format"
            value={el.format}
            onChange={(format) => patch({ format } as Patch)}
            mono
            hint={
              <StrftimeHint>
                {mode === 'time'
                  ? 'Passed straight to strftime() on the watch. %H hour (24), %I hour (12), %M minute, %S second, %p AM/PM.'
                  : 'Passed straight to strftime() on the watch. %a and %A weekday, %b and %B month, %d date, %Y year, %j day of year.'}
              </StrftimeHint>
            }
          />
          <ToggleField
            label="Strip leading zero"
            checked={el.stripLeadingZero}
            onChange={(stripLeadingZero) => patch({ stripLeadingZero } as Patch)}
            hint="Turns 09:05 into 9:05. Pebble has no portable %-I, so the export trims it in C."
          />
          <ToggleField
            label="Uppercase"
            checked={el.uppercase}
            onChange={(uppercase) => patch({ uppercase } as Patch)}
          />
          <div className="section-title">Appearance</div>
          <TextBoxControls el={el} patch={patch} />
        </>
      );
    }

    case 'text':
      return (
        <>
          <div className="section-title">Content</div>
          <TextField label="Text" value={el.text} onChange={(text) => patch({ text } as Patch)} />
          <div className="section-title">Appearance</div>
          <TextBoxControls el={el} patch={patch} />
        </>
      );

    case 'steps':
      return (
        <>
          <div className="section-title">Content</div>
          <div className="field-row">
            <TextField label="Prefix" value={el.prefix} onChange={(prefix) => patch({ prefix } as Patch)} />
            <TextField label="Suffix" value={el.suffix} onChange={(suffix) => patch({ suffix } as Patch)} />
          </div>
          <ToggleField
            label="Group thousands (12,345)"
            checked={el.thousandsSeparator}
            onChange={(thousandsSeparator) => patch({ thousandsSeparator } as Patch)}
          />
          <div className="callout">
            <strong className="callout-title">Needs the Health capability</strong>
            The export adds <code>"capabilities": ["health"]</code> to package.json. In CloudPebble,
            tick <strong>Health</strong> under Settings → Capabilities as well.
          </div>
          <div className="section-title">Appearance</div>
          <TextBoxControls el={el} patch={patch} />
        </>
      );

    case 'weather': {
      const icon = el.field === 'icon';
      const showUnits = isTemperatureField(el.field) || el.field === 'wind';
      return (
        <>
          <div className="section-title">Reading</div>
          <SelectField
            label="Show"
            value={el.field}
            options={WEATHER_FIELDS.map((f) => ({ value: f.value, label: f.label, group: f.group }))}
            onChange={(field) => patch({ field } as Patch)}
            hint={
              icon
                ? 'The artwork is drawn in the largest square this box holds, centered, so a square box wastes the least room.'
                : undefined
            }
          />
          {showUnits && (
            <Segmented
              label="Units"
              value={el.units}
              options={[
                { value: 'imperial', label: '°F / mph' },
                { value: 'metric', label: '°C / km/h' },
              ]}
              onChange={(units) => patch({ units } as Patch)}
            />
          )}
          {isTemperatureField(el.field) && (
            <ToggleField
              label="Degree symbol"
              checked={el.degreeSymbol}
              onChange={(degreeSymbol) => patch({ degreeSymbol } as Patch)}
              hint="Adds °F or °C after the number."
            />
          )}
          {!icon && (
            <>
              <div className="field-row">
                <TextField label="Prefix" value={el.prefix} onChange={(prefix) => patch({ prefix } as Patch)} />
                <TextField label="Suffix" value={el.suffix} onChange={(suffix) => patch({ suffix } as Patch)} />
              </div>
              <TextField
                label="No-reading placeholder"
                value={el.placeholder}
                onChange={(placeholder) => patch({ placeholder } as Patch)}
                hint="Shown until the phone sends the first reading, which takes a few seconds after the watchface loads."
              />
            </>
          )}
          <div className="callout">
            <strong className="callout-title">Weather comes from your phone</strong>
            The watch has no weather radio. The export adds a companion JavaScript file that fetches
            from OpenWeatherMap and sends the numbers over. You need a free API key, which goes in
            the <strong>Project</strong> tab, and CloudPebble needs the JS file and the message keys
            added by hand. The export panel spells out both.
          </div>
          <div className="section-title">Appearance</div>
          {icon ? (
            <ColorField label="Color" value={el.color} onChange={(color) => patch({ color } as Patch)} />
          ) : (
            <TextBoxControls el={el} patch={patch} />
          )}
        </>
      );
    }

    case 'compass':
      return (
        <>
          <div className="section-title">Heading</div>
          <Segmented
            label="Show"
            value={el.display}
            options={COMPASS_DISPLAY_OPTIONS}
            onChange={(display) => patch({ display } as Patch)}
          />
          <SelectField
            label="Points of the compass"
            value={String(el.points)}
            options={COMPASS_POINT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(points) => patch({ points: Number(points) } as Patch)}
            hint="How finely the bearing is named."
          />
          <div className="field-row">
            <TextField label="Prefix" value={el.prefix} onChange={(prefix) => patch({ prefix } as Patch)} />
            <TextField label="Suffix" value={el.suffix} onChange={(suffix) => patch({ suffix } as Patch)} />
          </div>
          <TextField
            label="Uncalibrated placeholder"
            value={el.placeholder}
            onChange={(placeholder) => patch({ placeholder } as Patch)}
            hint="The magnetometer needs calibrating after a strong magnetic field, and reports nothing usable until it is."
          />
          <div className="callout callout-warn">
            <strong className="callout-title">This costs battery</strong>
            The magnetometer stays powered for as long as the watchface is on screen, which is
            noticeably more draining than any other complication here. The reading refreshes every{' '}
            {COMPASS_REFRESH_MS / 1000} seconds rather than on every movement, which keeps the
            redraws down but not the sensor itself.
          </div>
          <div className="section-title">Appearance</div>
          <TextBoxControls el={el} patch={patch} />
        </>
      );

    case 'batteryText':
      return (
        <>
          <div className="section-title">Content</div>
          <div className="field-row">
            <TextField label="Prefix" value={el.prefix} onChange={(prefix) => patch({ prefix } as Patch)} />
            <TextField label="Suffix" value={el.suffix} onChange={(suffix) => patch({ suffix } as Patch)} />
          </div>
          <div className="section-title">Appearance</div>
          <TextBoxControls el={el} patch={patch} />
          <BatteryStateColors el={el} patch={patch} />
        </>
      );

    case 'batteryBar':
      return (
        <>
          <div className="section-title">Gauge</div>
          <Segmented
            label="Orientation"
            value={el.orientation}
            options={[
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ]}
            onChange={(orientation) => patch({ orientation } as Patch)}
          />
          <ToggleField
            label="Fill from the other end"
            checked={el.reverse}
            onChange={(reverse) => patch({ reverse } as Patch)}
          />
          <div className="field-row">
            <NumberField
              label="Border width"
              value={el.borderWidth}
              min={0}
              max={6}
              onChange={(borderWidth) => patch({ borderWidth } as Patch)}
            />
            <NumberField
              label="Inner padding"
              value={el.padding}
              min={0}
              max={12}
              onChange={(padding) => patch({ padding } as Patch)}
            />
          </div>
          <NumberField
            label="Corner radius"
            value={el.radius}
            min={0}
            max={Math.floor(Math.min(el.w, el.h) / 2)}
            onChange={(radius) => patch({ radius: Math.round(radius) } as Patch)}
            hint="Rounds the track, the fill and the border together. Caps at half the shorter side."
          />
          <ColorField label="Fill" value={el.fillColor} onChange={(fillColor) => patch({ fillColor } as Patch)} />
          <ColorField
            label="Track"
            value={el.backgroundColor}
            onChange={(backgroundColor) => patch({ backgroundColor } as Patch)}
          />
          <ColorField
            label="Border"
            value={el.borderColor}
            onChange={(borderColor) => patch({ borderColor } as Patch)}
          />
          <BatteryStateColors el={el} patch={patch} />
        </>
      );

    case 'batteryRing':
      return (
        <>
          <div className="section-title">Gauge</div>
          <NumberField
            label="Ring thickness"
            value={el.thickness}
            min={1}
            max={Math.floor(el.size / 2)}
            onChange={(thickness) => patch({ thickness } as Patch)}
          />
          <SliderField
            label="Start angle"
            value={el.startAngle}
            min={0}
            max={359}
            suffix="°"
            onChange={(startAngle) => patch({ startAngle } as Patch)}
          />
          <SliderField
            label="Sweep"
            value={el.sweep}
            min={30}
            max={360}
            suffix="°"
            onChange={(sweep) => patch({ sweep } as Patch)}
          />
          <ColorField label="Fill" value={el.fillColor} onChange={(fillColor) => patch({ fillColor } as Patch)} />
          <ColorField
            label="Track"
            value={el.backgroundColor}
            onChange={(backgroundColor) => patch({ backgroundColor } as Patch)}
          />
          <BatteryStateColors el={el} patch={patch} />
        </>
      );

    case 'bluetooth':
      return (
        <>
          <div className="section-title">Indicator</div>
          <Segmented
            label="Style"
            value={el.style}
            options={[
              { value: 'dot', label: 'Dot' },
              { value: 'bar', label: 'Bar' },
              { value: 'text', label: 'Text' },
            ]}
            onChange={(style) => patch({ style } as Patch)}
          />
          {/* The dot's size is the Diameter field up in Position & size. */}
          {el.style === 'bar' && (
            <NumberField
              label="Corner radius"
              value={el.radius}
              min={0}
              max={Math.floor(Math.min(el.w, el.h) / 2)}
              onChange={(radius) => patch({ radius: Math.round(radius) } as Patch)}
            />
          )}
          {el.style === 'text' && (
            <>
              <div className="field-row">
                <TextField
                  label="Connected"
                  value={el.connectedText}
                  onChange={(connectedText) => patch({ connectedText } as Patch)}
                />
                <TextField
                  label="Disconnected"
                  value={el.disconnectedText}
                  onChange={(disconnectedText) => patch({ disconnectedText } as Patch)}
                />
              </div>
              <TextBoxControls el={el} patch={patch} />
            </>
          )}
          <ColorField
            label="Connected color"
            value={el.connectedColor}
            onChange={(connectedColor) => patch({ connectedColor } as Patch)}
          />
          <ColorField
            label="Disconnected color"
            value={el.disconnectedColor}
            onChange={(disconnectedColor) => patch({ disconnectedColor } as Patch)}
          />
          <ToggleField
            label="Hide while connected"
            checked={el.hideWhenConnected}
            onChange={(hideWhenConnected) => patch({ hideWhenConnected } as Patch)}
            hint="Only draw the indicator when the phone connection drops."
          />
        </>
      );

    case 'polygon': {
      const rectangular = isAxisAlignedRect(el.sides, el.rotation);
      return (
        <>
          <div className="section-title">Shape</div>
          <Field label="Preset">
            <div className="preset-row">
              {POLYGON_PRESETS.map((preset) => {
                const active = el.sides === preset.sides && el.rotation === preset.rotation;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                    aria-pressed={active}
                    onClick={() =>
                      patch({ sides: preset.sides, rotation: preset.rotation } as Patch)
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <SliderField
            label="Sides"
            value={el.sides}
            min={MIN_POLYGON_SIDES}
            max={MAX_POLYGON_SIDES}
            editable
            onChange={(sides) => patch({ sides: Math.round(sides) } as Patch)}
          />
          <SliderField
            label="Rotation"
            value={el.rotation}
            min={0}
            max={359}
            suffix="°"
            editable
            onChange={(rotation) => patch({ rotation } as Patch)}
          />
          <div className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
            {rectangular
              ? 'Four sides at 45° is a plain rectangle, so corner rounding is available.'
              : 'Pick the Rectangle preset if you want roundable corners.'}
          </div>
          <ToggleField label="Filled" checked={el.fill} onChange={(fill) => patch({ fill } as Patch)} />
          {el.fill && (
            <ColorField
              label="Fill color"
              value={el.fillColor}
              onChange={(fillColor) => patch({ fillColor } as Patch)}
            />
          )}
          <NumberField
            label="Outline width"
            value={el.strokeWidth}
            min={0}
            max={10}
            onChange={(strokeWidth) => patch({ strokeWidth } as Patch)}
          />
          {el.strokeWidth > 0 && (
            <ColorField
              label="Outline color"
              value={el.strokeColor}
              onChange={(strokeColor) => patch({ strokeColor } as Patch)}
            />
          )}
          {!rectangular && el.strokeWidth > 1 && (
            <ToggleField
              label="Rounded corners"
              checked={el.roundedJoins}
              onChange={(roundedJoins) => patch({ roundedJoins } as Patch)}
              hint="Caps each corner of the outline with a disc. The fill underneath keeps its sharp corners, since the SDK cannot round an arbitrary path."
            />
          )}
          {rectangular && (
            <NumberField
              label="Corner radius"
              value={el.radius}
              min={0}
              max={40}
              onChange={(radius) => patch({ radius } as Patch)}
              hint="The SDK can only round the corners of a rectangle, so this is hidden on other polygons."
            />
          )}
        </>
      );
    }

    case 'circle':
      return (
        <>
          <div className="section-title">Shape</div>
          <ToggleField label="Filled" checked={el.fill} onChange={(fill) => patch({ fill } as Patch)} />
          {el.fill && (
            <ColorField
              label="Fill color"
              value={el.fillColor}
              onChange={(fillColor) => patch({ fillColor } as Patch)}
            />
          )}
          <NumberField
            label="Outline width"
            value={el.strokeWidth}
            min={0}
            max={20}
            onChange={(strokeWidth) => patch({ strokeWidth } as Patch)}
            hint="Turn the fill off and set an outline to draw a ring."
          />
          {el.strokeWidth > 0 && (
            <ColorField
              label="Outline color"
              value={el.strokeColor}
              onChange={(strokeColor) => patch({ strokeColor } as Patch)}
            />
          )}
        </>
      );

    case 'heartRate':
      return (
        <>
          <div className="section-title">Content</div>
          <div className="field-row">
            <TextField label="Prefix" value={el.prefix} onChange={(prefix) => patch({ prefix } as Patch)} />
            <TextField label="Suffix" value={el.suffix} onChange={(suffix) => patch({ suffix } as Patch)} />
          </div>
          <TextField
            label="No-reading placeholder"
            value={el.placeholder}
            onChange={(placeholder) => patch({ placeholder } as Patch)}
            hint="Shown until the sensor reports a value. The optical sensor samples periodically, so this appears fairly often."
          />
          <div className="callout">
            <strong className="callout-title">Needs the Health capability</strong>
            The export adds <code>"capabilities": ["health"]</code> to package.json. In CloudPebble,
            tick <strong>Health</strong> under Settings → Capabilities as well.
          </div>
          <div className="section-title">Appearance</div>
          <TextBoxControls el={el} patch={patch} />
        </>
      );

    case 'line':
      return (
        <>
          <div className="section-title">Line</div>
          <NumberField
            label="Length"
            value={el.length}
            min={1}
            max={600}
            onChange={(length) => patch({ length: Math.round(length) } as Patch)}
          />
          <SliderField
            label="Angle"
            value={el.angle}
            min={0}
            max={359}
            suffix="°"
            editable
            onChange={(angle) => patch({ angle: Math.round(angle) } as Patch)}
            hint="0° runs to the right, 90° straight down."
          />
          <NumberField
            label="Thickness"
            value={el.width}
            min={1}
            max={20}
            onChange={(width) => patch({ width } as Patch)}
          />
          <ToggleField
            label="Rounded ends"
            checked={el.roundedEnds}
            onChange={(roundedEnds) => patch({ roundedEnds } as Patch)}
            hint="Pebble draws square ends, so this caps each end with a disc. It needs a thickness of at least 3 to show."
          />
          <ColorField label="Color" value={el.color} onChange={(color) => patch({ color } as Patch)} />
        </>
      );

    case 'image': {
      const asset = store.project.images.find((a) => a.id === el.assetId);
      return (
        <>
          <div className="section-title">Image</div>
          {store.project.images.length === 0 ? (
            <div className="warning-bar">
              No images uploaded yet. Add a PNG in the <strong>Assets</strong> tab.
            </div>
          ) : (
            <SelectField
              label="Source"
              value={el.assetId}
              options={[
                { value: '', label: 'None' },
                ...store.project.images.map((a) => ({ value: a.id, label: a.fileName })),
              ]}
              onChange={(assetId) => patch({ assetId } as Patch)}
            />
          )}
          {asset && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => patch({ w: asset.width, h: asset.height } as Patch)}
            >
              Reset to natural size ({asset.width}×{asset.height})
            </button>
          )}
          <div className="callout" style={{ marginTop: 12 }}>
            <strong className="callout-title">Upload this in CloudPebble</strong>
            The PNG has to be added as a <strong>Bitmap</strong> resource; the export panel lists the
            exact identifier to use.
          </div>
        </>
      );
    }

    case 'analog':
      return (
        <>
          <div className="section-title">Hands</div>
          {(
            [
              ['Hour', 'showHour', 'hourColor', 'hourWidth', 'hourLength'],
              ['Minute', 'showMinute', 'minuteColor', 'minuteWidth', 'minuteLength'],
              ['Second', 'showSecond', 'secondColor', 'secondWidth', 'secondLength'],
            ] as const
          ).map(([label, showKey, colorKey, widthKey, lengthKey]) => (
            <div key={label} style={{ marginBottom: 6 }}>
              <ToggleField
                label={`${label} hand`}
                checked={el[showKey]}
                onChange={(v) => patch({ [showKey]: v } as Patch)}
              />
              {el[showKey] && (
                <>
                  <div className="field-row">
                    <NumberField
                      label="Width"
                      value={el[widthKey]}
                      min={1}
                      max={14}
                      onChange={(v) => patch({ [widthKey]: v } as Patch)}
                    />
                    <NumberField
                      label="Length %"
                      value={el[lengthKey]}
                      min={5}
                      max={100}
                      onChange={(v) => patch({ [lengthKey]: v } as Patch)}
                    />
                  </div>
                  <ColorField
                    label={`${label} color`}
                    value={el[colorKey]}
                    onChange={(v) => patch({ [colorKey]: v } as Patch)}
                  />
                </>
              )}
            </div>
          ))}

          <ToggleField
            label="Rounded hand ends"
            checked={el.roundedHands}
            onChange={(roundedHands) => patch({ roundedHands } as Patch)}
            hint="Caps each hand with a disc, since Pebble draws square ends. Needs a width of at least 3 to show."
          />

          <div className="section-title">Dial</div>
          <ToggleField
            label="Tick marks"
            checked={el.showTicks}
            onChange={(showTicks) => patch({ showTicks } as Patch)}
          />
          {el.showTicks && (
            <>
              <ToggleField
                label="A tick every minute"
                checked={el.minuteTicks}
                onChange={(minuteTicks) => patch({ minuteTicks } as Patch)}
              />
              <div className="field-row">
                <NumberField
                  label="Tick length"
                  value={el.tickLength}
                  min={1}
                  max={40}
                  onChange={(tickLength) => patch({ tickLength } as Patch)}
                />
                <NumberField
                  label="Tick width"
                  value={el.tickWidth}
                  min={1}
                  max={10}
                  onChange={(tickWidth) => patch({ tickWidth } as Patch)}
                />
              </div>
              <ToggleField
                label="Rounded tick ends"
                checked={el.roundedTicks}
                onChange={(roundedTicks) => patch({ roundedTicks } as Patch)}
                hint="Needs a tick width of at least 3 to show."
              />
              <ColorField
                label="Tick color"
                value={el.tickColor}
                onChange={(tickColor) => patch({ tickColor } as Patch)}
              />
            </>
          )}
          <ToggleField
            label="Center dot"
            checked={el.showCenterDot}
            onChange={(showCenterDot) => patch({ showCenterDot } as Patch)}
          />
          {el.showCenterDot && (
            <>
              <NumberField
                label="Dot radius"
                value={el.centerDotRadius}
                min={1}
                max={20}
                onChange={(centerDotRadius) => patch({ centerDotRadius } as Patch)}
              />
              <ColorField
                label="Dot color"
                value={el.centerDotColor}
                onChange={(centerDotColor) => patch({ centerDotColor } as Patch)}
              />
            </>
          )}
        </>
      );
  }
}

export function Inspector() {
  const store = useStore();
  const el = store.selected;

  if (!el) {
    return (
      <div className="panel-scroll">
        <div className="empty">
          Nothing selected.
          <br />
          Click an element on the watch, or add one from the left.
        </div>
      </div>
    );
  }

  const patch = (p: Patch) => store.patchElement(el.id, p);
  const box = elementBox(el);
  const square = isSquare(el);
  const sizeKey = sizeProperty(el);
  // Everything the editor constrains to a square is round - the circle, the
  // battery ring, the analog dial, the Bluetooth dot - so it is a diameter.
  const sizeLabel = square ? 'Diameter' : 'Width';

  return (
    <div className="panel-scroll">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          className="input"
          value={el.name}
          onChange={(e) => store.patchElement(el.id, { name: e.target.value }, { snapshot: false })}
          style={{ fontWeight: 600 }}
        />
        <button
          type="button"
          className="btn btn-icon"
          title="Duplicate"
          onClick={() => store.duplicateElement(el.id)}
        >
          ⧉
        </button>
        <button
          type="button"
          className="btn btn-icon btn-danger"
          title="Delete"
          onClick={() => store.removeElement(el.id)}
        >
          🗑
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <button type="button" className="btn btn-sm" onClick={() => store.moveElement(el.id, 'top')}>
          Bring to front
        </button>
        <button type="button" className="btn btn-sm" onClick={() => store.moveElement(el.id, 'bottom')}>
          Send to back
        </button>
      </div>

      <div className="section-title">Position &amp; size</div>
      <div className="field-row">
        <NumberField label="X" value={el.x} onChange={(x) => patch({ x } as Patch)} />
        <NumberField label="Y" value={el.y} onChange={(y) => patch({ y } as Patch)} />
      </div>
      {el.type !== 'line' && (
        <div className="field-row">
          <NumberField
            label={sizeLabel}
            value={box.w}
            min={1}
            onChange={(w) => patch(({ [sizeKey]: Math.round(w) } as unknown) as Patch)}
          />
          {!square && (
            <NumberField
              label="Height"
              value={box.h}
              min={1}
              onChange={(h) => patch({ h: Math.round(h) } as Patch)}
            />
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => patch({ x: Math.round((store.spec.width - box.w) / 2) } as Patch)}
        >
          Center across
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => patch({ y: Math.round((store.spec.height - box.h) / 2) } as Patch)}
        >
          Center down
        </button>
      </div>
      <Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={el.visible}
              onChange={(e) => patch({ visible: e.target.checked } as Patch)}
            />
            <span>Visible</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={el.locked}
              onChange={(e) => patch({ locked: e.target.checked } as Patch)}
            />
            <span>Locked</span>
          </label>
        </div>
      </Field>

      <TypeControls el={el} patch={patch} />
    </div>
  );
}

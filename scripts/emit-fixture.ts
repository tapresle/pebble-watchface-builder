/**
 * Emits a watchface that exercises every element type, so the generated C can be
 * syntax-checked against the stub SDK header in scripts/pebble-stub.
 *
 * Run via `npm run check:c`.
 */

import { analyzeProject } from '../src/codegen/analyze';
import { generateC } from '../src/codegen/generateC';
import { generatePackageJson } from '../src/codegen/generateProject';
import { createElement, createStarterProject } from '../src/lib/defaults';
import { ELEMENT_KINDS } from '../src/lib/defaults';
import { platformSpec } from '../src/lib/platform';
import type { PlatformId, WatchElement, WatchfaceProject } from '../src/types';

const platform = (process.argv[3] ?? 'emery') as PlatformId;
const spec = platformSpec(platform);
const project: WatchfaceProject = createStarterProject(platform);
project.elements = [];
project.fonts = [
  {
    id: 'font1',
    fileName: 'Montserrat-Bold.ttf',
    identifier: 'MONTSERRAT_BOLD',
    data: 'AA==',
    characterRegex: '[0-9:]',
  },
];
project.images = [
  { id: 'img1', fileName: 'background.png', identifier: 'IMG_BACKGROUND', data: 'AA==', width: 60, height: 60 },
  // Transparent, so on a color watch it draws with GCompOpSet next to img1's
  // GCompOpAssign, which is what makes a slideshow emit its per-frame modes.
  { id: 'img2', fileName: 'cutout.png', identifier: 'IMG_CUTOUT', data: 'AA==', width: 60, height: 60, hasAlpha: true },
];
project.options.vibeOnDisconnect = true;

let x = 4;
for (const kind of ELEMENT_KINDS) {
  // Deliberately not filtered by capability: a heart rate element can survive a
  // switch to a watch without the sensor, and that still has to compile.
  const element = createElement({
    paletteId: kind.paletteId,
    existing: project.elements,
    spec,
    x,
    y: 4,
    defaultImageAssetId: 'img1',
  });
  project.elements.push(element);
  x += 6;
}

// Force the option-heavy branches that the defaults leave switched off.
const tweak = (type: WatchElement['type'], patch: Record<string, unknown>) => {
  const target = project.elements.find((el) => el.type === type);
  if (target) Object.assign(target, patch);
};

tweak('time', {
  stripLeadingZero: true,
  uppercase: true,
  format: '%I:%M:%S %p',
  font: { kind: 'custom', fontId: 'font1', size: 42 },
});
tweak('batteryBar', { reverse: true, orientation: 'vertical', borderWidth: 0, radius: 4 });
tweak('bluetooth', { style: 'text', hideWhenConnected: true });
tweak('rect', { fill: true, strokeWidth: 2, radius: 6 });
tweak('analog', {
  showSecond: true,
  minuteTicks: true,
  tickWidth: 3,
  roundedHands: true,
  roundedTicks: true,
});
tweak('line', { roundedEnds: true, width: 5, angle: 30 });
// A non-rectangular polygon takes the GPath route rather than graphics_fill_rect.
tweak('polygon', { sides: 6, rotation: 12, fill: true, strokeWidth: 2, roundedJoins: true });
tweak('circle', { fill: true, strokeWidth: 3 });
tweak('heartRate', { prefix: '100% ', suffix: ' bpm', placeholder: '--' });
tweak('steps', { thousandsSeparator: false, prefix: '100% ', suffix: ' st' });
// All three compass readouts, and each naming precision.
tweak('compass', { display: 'cardinal', points: 8 });
for (const [display, points] of [
  ['degrees', 4],
  ['both', 16],
] as const) {
  const extra = createElement({ paletteId: 'compass', existing: project.elements, spec, x: 4, y: 80 });
  Object.assign(extra, { display, points });
  project.elements.push(extra);
}

// Every weather field takes a different route through the generator: metric and
// imperial conversions, the two string readings, and the artwork.
tweak('weather', { field: 'temperature', units: 'metric', degreeSymbol: true });
for (const [field, units] of [
  ['feelsLike', 'imperial'],
  ['high', 'metric'],
  ['low', 'imperial'],
  ['rainChance', 'metric'],
  ['humidity', 'metric'],
  ['wind', 'imperial'],
  ['wind', 'metric'],
  ['condition', 'metric'],
  ['location', 'metric'],
  ['icon', 'metric'],
] as const) {
  const extra = createElement({ paletteId: 'weather', existing: project.elements, spec, x: 4, y: 60 });
  Object.assign(extra, { field, units, degreeSymbol: false });
  project.elements.push(extra);
}

// Every calendar field alone (two plain strings, one strftime call, and one
// through the countdown helper), then all four together in each orientation -
// the two branches that change how many %s placeholders and local buffers the
// generator has to line up.
for (const fields of [
  ['title'],
  ['time'],
  ['countdown'],
  ['location'],
] as const) {
  const extra = createElement({ paletteId: 'calendar', existing: project.elements, spec, x: 4, y: 70 });
  Object.assign(extra, { fields: [...fields], orientation: 'vertical', prefix: '@ ', suffix: ' *' });
  project.elements.push(extra);
}
{
  const extra = createElement({ paletteId: 'calendar', existing: project.elements, spec, x: 4, y: 70 });
  Object.assign(extra, {
    fields: ['title', 'time', 'countdown', 'location'],
    orientation: 'vertical',
    prefix: '@ ',
    suffix: ' *',
  });
  project.elements.push(extra);
}
// A separator with a quote, a percent sign, and a backslash - the characters
// that need to survive both the C string literal and the printf format.
{
  const extra = createElement({ paletteId: 'calendar', existing: project.elements, spec, x: 4, y: 70 });
  Object.assign(extra, {
    fields: ['title', 'time', 'countdown', 'location'],
    orientation: 'horizontal',
    separator: ' "100%\\" ',
    prefix: '@ ',
    suffix: ' *',
  });
  project.elements.push(extra);
}
// A cleared separator: side by side with nothing between the fields at all.
{
  const extra = createElement({ paletteId: 'calendar', existing: project.elements, spec, x: 4, y: 70 });
  Object.assign(extra, {
    fields: ['title', 'location'],
    orientation: 'horizontal',
    separator: '',
    prefix: '@ ',
    suffix: ' *',
  });
  project.elements.push(extra);
}
// Every box unchecked: no %s at all, so the format string is a plain literal
// and snprintf is called with no substitution args.
{
  const extra = createElement({ paletteId: 'calendar', existing: project.elements, spec, x: 4, y: 70 });
  Object.assign(extra, { fields: [], orientation: 'vertical', prefix: '@ ', suffix: ' *' });
  project.elements.push(extra);
}

// A second copy of the ones with meaningfully different branches.
const extra = createElement({ paletteId: 'batteryBar', existing: project.elements, spec, x: 4, y: 120 });
Object.assign(extra, { radius: 6, borderWidth: 2 });
project.elements.push(extra);
// The bar style of the Bluetooth indicator is the other roundable rectangle.
const btBar = createElement({ paletteId: 'bluetooth', existing: project.elements, spec, x: 4, y: 130 });
Object.assign(btBar, { style: 'bar', radius: 5 });
project.elements.push(btBar);
const extraAnalog = createElement({ paletteId: 'analog', existing: project.elements, spec, x: 4, y: 140 });
Object.assign(extraAnalog, { showTicks: false, showHour: false, showMinute: false, showCenterDot: false });
project.elements.push(extraAnalog);
const extraText = createElement({ paletteId: 'text', existing: project.elements, spec, x: 4, y: 160 });
Object.assign(extraText, {
  text: 'Quote " and 100% \\ backslash',
  font: { kind: 'custom', fontId: 'font1', size: 18 },
});
project.elements.push(extraText);
// A rounded rectangle still goes through graphics_fill_rect.
const roundedRect = createElement({ paletteId: 'polygon', existing: project.elements, spec, x: 4, y: 180 });
Object.assign(roundedRect, { sides: 4, rotation: 45, radius: 6, fill: true, strokeWidth: 2 });
project.elements.push(roundedRect);

// Every "nothing to draw" branch: no fill and no outline.
const emptyPolygon = createElement({ paletteId: 'polygon', existing: project.elements, spec, x: 4, y: 190 });
Object.assign(emptyPolygon, { sides: 4, rotation: 45, fill: false, strokeWidth: 0, radius: 0 });
project.elements.push(emptyPolygon);

const emptyNgon = createElement({ paletteId: 'polygon', existing: project.elements, spec, x: 4, y: 200 });
Object.assign(emptyNgon, { sides: 5, rotation: 0, fill: false, strokeWidth: 0 });
project.elements.push(emptyNgon);

// The largest GPath the editor can produce.
const bigPolygon = createElement({ paletteId: 'polygon', existing: project.elements, spec, x: 4, y: 208 });
Object.assign(bigPolygon, { sides: 24, rotation: 7, fill: true, strokeWidth: 1 });
project.elements.push(bigPolygon);

const emptyCircle = createElement({ paletteId: 'circle', existing: project.elements, spec, x: 4, y: 210 });
Object.assign(emptyCircle, { fill: false, strokeWidth: 0 });
project.elements.push(emptyCircle);

// The default slideshow shares img1 at 60x60 with the image element, so that
// resource is both preloaded and loaded on demand. This one mixes compositing
// modes and repeats a frame, at a size nothing else uses.
const slideshow = createElement({ paletteId: 'slideshow', existing: project.elements, spec, x: 4, y: 220 });
Object.assign(slideshow, { assetIds: ['img1', 'img2', 'img1'], intervalMinutes: 7, w: 40, h: 30 });
project.elements.push(slideshow);

// Outlines, one per way the text color reaches the draw: a constant, the
// battery's picked color, and the Bluetooth color inside its hide-when-
// connected branch. Both widths, both colors.
for (const [paletteId, patch] of [
  ['time', { outline: true, outlineColor: '#ffffff', outlineWidth: 2 }],
  ['text', { outline: true, outlineColor: '#000000', outlineWidth: 1 }],
  ['batteryText', { outline: true, outlineColor: '#000000', outlineWidth: 2 }],
  ['bluetooth', { style: 'text', hideWhenConnected: true, outline: true, outlineColor: '#ffffff', outlineWidth: 1 }],
] as const) {
  const outlined = createElement({ paletteId, existing: project.elements, spec, x: 4, y: 230 });
  Object.assign(outlined, patch);
  project.elements.push(outlined);
}

const analysis = analyzeProject(project);
const mode = process.argv[2] ?? 'c';
process.stdout.write(mode === 'json' ? generatePackageJson(project, analysis) : generateC(project, analysis));

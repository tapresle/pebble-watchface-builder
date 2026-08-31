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
];
project.options.vibeOnDisconnect = true;
project.options.weatherApiKey = 'fixture-key';

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

const analysis = analyzeProject(project);
const mode = process.argv[2] ?? 'c';
process.stdout.write(mode === 'json' ? generatePackageJson(project, analysis) : generateC(project, analysis));

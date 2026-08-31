/**
 * Asserts every weather icon fits inside the unit square it is scaled into.
 *
 * A shape that strays outside is clipped away by the SVG viewport in the
 * preview, and on the watch it spills past the element's own box and paints
 * over whatever is next to it. Neither is obvious while editing the shape
 * table, so it is checked here.
 *
 * Run via `npm run check:icons`.
 */

import { CONDITION_ICON, WEATHER_CONDITIONS, type IconShape } from '../src/lib/weather';

/** Corners of the area a shape actually covers, stroke width included. */
function extremes(shape: IconShape): [number, number][] {
  switch (shape.kind) {
    case 'circle':
      return [
        [shape.cx - shape.r, shape.cy - shape.r],
        [shape.cx + shape.r, shape.cy + shape.r],
      ];
    case 'rect':
      return [
        [shape.x, shape.y],
        [shape.x + shape.w, shape.y + shape.h],
      ];
    case 'path': {
      const half = shape.width / 2;
      return shape.points.flatMap((p) => [
        [p.x - half, p.y - half],
        [p.x + half, p.y + half],
      ]);
    }
    default:
      return shape.points.map((p) => [p.x, p.y]);
  }
}

// A shape may touch an edge, but must not cross it. The slack absorbs the
// floating point noise in the trigonometry that lays the rays and waves out.
const SLACK = 0.001;

let failed = 0;
for (const condition of WEATHER_CONDITIONS) {
  const points = CONDITION_ICON[condition].flatMap(extremes);
  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  const box = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  const outside =
    box.minX < -SLACK || box.minY < -SLACK || box.maxX > 1 + SLACK || box.maxY > 1 + SLACK;
  const extent =
    `x ${box.minX.toFixed(3)}..${box.maxX.toFixed(3)}  y ${box.minY.toFixed(3)}..${box.maxY.toFixed(3)}`;
  if (outside) {
    failed += 1;
    console.error(`${condition}: strays outside its box, ${extent}`);
  } else {
    console.log(`  ${condition.padEnd(13)} ${extent}`);
  }
}

if (failed > 0) {
  console.error(`icons: ${failed} of ${WEATHER_CONDITIONS.length} do not fit their box`);
  process.exit(1);
}
console.log(`icons: all ${WEATHER_CONDITIONS.length} fit inside their box`);

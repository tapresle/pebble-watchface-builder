# Pebble Watchface Builder

[![Netlify Status](https://api.netlify.com/api/v1/badges/efba93e8-cb6e-4359-8dc5-e7ca8ecc26d6/deploy-status)](https://app.netlify.com/projects/pebble-watchface-builder/deploys)

Live site at [pebble-watchface-builder.netlify.app](https://pebble-watchface-builder.netlify.app/)

A drag-and-drop watchface designer for every Pebble watch, from the 2013 original to the
Pebble Time 2, that runs in the browser and exports a ready-to-build **Pebble C SDK**
project for CloudPebble.

There is no backend. The editor, the font handling, the code generator, and the zip writer
all run client side, and the production build is a folder of static files. The only thing
fetched from anywhere else is the Buy Me a Coffee button in the corner.

## Supported watches

| Watch | Platform | Screen | Colors |
| --- | --- | --- | --- |
| Core 2 Duo | `flint` | 144×168 | black and white |
| Pebble Time 2 | `emery` | 200×228 | 64 |
| Pebble Round 2 | `gabbro` | 260×260, round | 64 |
| Pebble Classic | `aplite` | 144×168 | black and white |
| Pebble Time | `basalt` | 144×168 | 64 |
| Pebble Time Round | `chalk` | 180×180, round | 64 |
| Pebble 2 | `diorite` | 144×168 | black and white |

The first three are Core Devices' current watches; the rest are legacy. Both groups run
oldest to newest by release date.
That is every platform the Pebble SDK builds for. The original is listed as Pebble Classic
because plain "Pebble" beside a Pebble 2 and a Pebble Time reads as a category rather than
a watch.

## What you get

- A device picker on first run, covering all seven. You can retarget an existing design at
  another watch, and colors and stray positions are converted for you.
- A live preview of the chosen screen with drag, resize, snap, grid, and keyboard nudging.
  On the round watches, elements size themselves to the visible circle's chord and the
  canvas clips to it, because a round panel hands the app a square framebuffer and lights
  only the circle inside it.
- Elements: digital time/date (any `strftime` format), analog dial, static text, step
  count, heart rate, battery as text / bar / ring, Bluetooth indicator, weather, compass,
  polygons, circles, lines, and PNG images.
- Weather as ten readings - temperature, feels-like, today's high and low, chance of rain,
  humidity, wind, condition text, place name, and a drawn condition icon - with
  Celsius/Fahrenheit and km/h/mph per element. The watch has no weather radio, so the
  export also emits a PebbleKit JS companion that geolocates, queries OpenWeatherMap, and
  pushes the numbers over AppMessage, plus the message keys and the CloudPebble steps for
  wiring it up.
- Compass heading as a named point (N, NE, E and so on, at 4, 8, or 16 points), as a
  bearing in degrees, or both.
- Complications that need hardware the target watch lacks are hidden from the palette -
  the heart rate element only appears for watches with the sensor, the compass only for
  watches with a magnetometer. The Pebble 2 has neither a magnetometer nor, on the SE
  model, the heart rate sensor, so it gets the compass hidden outright and a note on the
  export saying the heart rate reading depends on which model it runs on. The Pebble
  Classic, the Pebble Time, and the Time Round all carried the magnetometer and none of
  them ever had a heart rate sensor, so they get the compass and not the pulse.
- Colors limited to what the chosen watch can actually display - 64 on the Time 2, the
  Round 2, the Pebble Time, and the Time Round, black and white on the Core 2 Duo, the
  Pebble Classic, and the Pebble 2 - so the preview does not lie. Uploaded PNGs get the same treatment, with a choice of nearest-color or
  Floyd-Steinberg dithering, and the reduced file is what lands in the exported project.
  Bitmaps are also built at the exact size they are drawn at, because
  `graphics_draw_bitmap_in_rect` clips or tiles rather than scaling.
- Your own `.ttf` / `.otf` fonts, previewed with the real glyphs.
- A generated `main.c`, a generated `package.json`, and a setup guide that spells out the
  parts of a CloudPebble project you have to click through by hand (fonts and images are
  SDK *resources*; they cannot be expressed in code).
- Generated C that is meant to be edited afterwards. Each element's block opens with its
  position, size, colors, and format strings as named constants, prefixed from the layer's
  name, so a value can be found and changed in CloudPebble without reading the drawing
  code under it.
- A light and a dark theme, following your system setting until you pick one.
- Autosave to browser storage, plus `project.json` import/export.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints.

## Building the static app

```bash
npm run build
```

The result in `dist/` is self-contained; serve it from any static host, or open it with
`npm run preview`.

## Checking the generated firmware code

`npm run check:c` builds a fixture watchface that uses every element type, once per
supported watch, then compiles the generated C against a stub `pebble.h` with
`-Wall -Wextra -Werror`. It also asserts that `targetPlatforms` matches and that a
black-and-white build never emits a color expression it cannot represent. All of that
without needing the real Pebble SDK installed.

```bash
npm run verify   # typecheck + text and icon guards + generated-C check + production build
```

## Layout of the source

| Path | What lives there |
| --- | --- |
| `src/types.ts` | The project document model - everything else is a function of this. |
| `src/lib/platform.ts` | Hardware facts per watch, the color palettes, system font catalog. |
| `src/lib/platformConvert.ts` | Retargeting a design at another watch. |
| `src/lib/defaults.ts` | Element factories and the starter project. |
| `src/lib/weather.ts` | Condition artwork, fields, units, and message keys, shared by the preview and the generated C. |
| `src/lib/compass.ts` | Compass point naming and the refresh interval. |
| `src/codegen/` | `analyze.ts` works out which resources and services are needed; `generateC.ts` and `generateProject.ts` emit the output. |
| `src/components/` | The editor UI: canvas, panels, inspector, export. |
| `scripts/` | The generated-C compile check and its stub SDK header, plus the text and icon guards. |

## Notes and limitations

- All seven Pebble SDK platforms are supported; see the table above for which is which.
  There are no more to add. Platform specs are isolated in `src/lib/platform.ts`, and a
  new entry in `PLATFORMS` would be most of the work if that ever changes.
- Pebble Health on the Pebble Classic is the one capability this does not try to settle.
  The generated C wraps every step and heart rate read in `#if defined(PBL_HEALTH)`, so a
  step counter compiles whatever the target firmware offers and simply draws nothing where
  there is no health service. The compile check cannot tell you which it will be: its stub
  header defines `PBL_HEALTH` unconditionally, so it proves the generated code is valid C,
  not that a given watch will run it.
- Built-in system fonts are previewed with stand-ins sized to each font's real cap
  height, measured from the reference renderings Core Devices publishes per font key.
  Roboto and Droid Serif are the genuine typefaces; Gothic (Raster Gothic), Bitham
  (Gotham), and LECO (LECO 1976) are commercial, so those preview with lookalikes -
  right size and placement, different letterforms and text widths. The font picker
  says which is which. Uploaded fonts preview exactly.
- Uploaded fonts and images are stored inside `project.json` as base64. Large fonts can
  exceed the browser's storage quota - the app warns you and you can keep working by
  downloading `project.json`.

## License and support

MIT, so you are free to use this commercially - see [LICENSE](LICENSE). If you found this
useful or interesting, consider [buying me a coffee](https://buymeacoffee.com/tapresle) so
I can keep making things like this.

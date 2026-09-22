/**
 * Everything the export panel needs besides main.c: the SDK package.json, the
 * CloudPebble resource checklist, and a README for the downloaded bundle.
 */

import type { WatchfaceProject } from '../types';
import { platformSpec } from '../lib/platform';
import { WEATHER_CONDITIONS, WEATHER_MESSAGE_KEYS, WEATHER_TEXT_BYTES } from '../lib/weather';
import {
  CALENDAR_LOCATION_BYTES,
  CALENDAR_MESSAGE_KEYS,
  CALENDAR_TITLE_BYTES,
} from '../lib/calendar';
import { PROJECT_FILE_NAME } from '../lib/utils';
import type { ProjectAnalysis, UsedImage } from './analyze';

export interface ResourceInstruction {
  kind: 'font' | 'bitmap';
  /** Name of the file the user has to upload. */
  fileName: string;
  /** Identifier that must be typed into CloudPebble exactly. */
  identifier: string;
  /** Constant the generated C code references. */
  constant: string;
  detail: string;
}

/** CloudPebble labels the platform checkboxes with capitalised slugs. */
export function platformLabel(sdkPlatform: string): string {
  return sdkPlatform.charAt(0).toUpperCase() + sdkPlatform.slice(1);
}

const npmName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'my-watchface';

/** Coerce a user version like "1.0" or "2" into the semver package.json wants. */
const semver = (version: string): string => {
  const parts = version.split('.').map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).join('.');
};

export function fontFilePath(fileName: string): string {
  return `resources/fonts/${fileName}`;
}

export function imageFilePath(fileName: string): string {
  return `resources/images/${fileName}`;
}

/**
 * File name for one image variant. An image drawn at two different sizes needs
 * two bitmaps, so the size goes in the name when that happens.
 */
export function imageFileName(image: UsedImage): string {
  const base = image.asset.fileName.replace(/\.png$/i, '');
  const suffix =
    image.resourceId === image.asset.identifier ? '' : `-${image.width}x${image.height}`;
  return `${base}${suffix}.png`;
}

export function generatePackageJson(project: WatchfaceProject, analysis: ProjectAnalysis): string {
  const media: Record<string, unknown>[] = [];

  for (const font of analysis.fonts) {
    const entry: Record<string, unknown> = {
      type: 'font',
      name: font.resourceId,
      file: `fonts/${font.font.fileName}`,
    };
    if (font.font.characterRegex.trim()) entry.characterRegex = font.font.characterRegex.trim();
    media.push(entry);
  }

  for (const image of analysis.images) {
    media.push({
      type: 'bitmap',
      name: image.resourceId,
      file: `images/${imageFileName(image)}`,
    });
  }

  const pebble: Record<string, unknown> = {
    displayName: project.name,
    uuid: project.uuid,
    sdkVersion: '3',
    enableMultiJS: false,
    targetPlatforms: [platformSpec(project.platform).sdkPlatform],
    watchapp: { watchface: true },
    messageKeys: [
      ...(analysis.needsWeather ? WEATHER_MESSAGE_KEYS : []),
      ...(analysis.needsCalendar ? CALENDAR_MESSAGE_KEYS : []),
    ],
    resources: { media },
  };
  const capabilities: string[] = [];
  if (analysis.needsHealth) capabilities.push('health');
  // Lets the phone app show the gear icon that opens the settings page below.
  if (analysis.needsWeather || analysis.needsCalendar) capabilities.push('configurable');
  if (capabilities.length) pebble.capabilities = capabilities;

  const doc = {
    name: npmName(project.name),
    author: project.author || 'Unknown',
    version: semver(project.version),
    keywords: ['pebble-app'],
    private: true,
    dependencies: {},
    pebble,
  };

  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Where the companion lives in a local SDK project, and in the download. */
export const COMPANION_JS_PATH = 'src/pkjs/index.js';

const weatherConditionCases = [
  "  if (code >= 200 && code < 300) return " + WEATHER_CONDITIONS.indexOf('thunderstorm') + ';',
  "  if (code >= 300 && code < 600) return " + WEATHER_CONDITIONS.indexOf('rain') + ';',
  "  if (code >= 600 && code < 700) return " + WEATHER_CONDITIONS.indexOf('snow') + ';',
  "  if (code >= 700 && code < 800) return " + WEATHER_CONDITIONS.indexOf('fog') + ';',
  '  if (code === 800) return ' + WEATHER_CONDITIONS.indexOf('clear') + ';',
  '  if (code === 801 || code === 802) return ' + WEATHER_CONDITIONS.indexOf('partlyCloudy') + ';',
  '  return ' + WEATHER_CONDITIONS.indexOf('cloudy') + ';',
].join('\n');

/** The part of the companion that fetches weather. Only emitted when needed. */
const WEATHER_JS = `var API_KEY_STORAGE_KEY = 'weatherApiKey';

function storedApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

// The watchface draws one of a fixed set of icons, so the service's condition
// codes are collapsed onto that set here.
function conditionFromCode(code) {
${weatherConditionCases}
}

function getJson(url, done) {
  var request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.onload = function () {
    if (request.status !== 200) {
      console.log('weather: HTTP ' + request.status + ' from ' + url);
      return;
    }
    try {
      done(JSON.parse(request.responseText));
    } catch (err) {
      console.log('weather: bad JSON, ' + err);
    }
  };
  request.onerror = function () {
    console.log('weather: request failed');
  };
  request.send();
}

function fetchWeather(latitude, longitude) {
  var apiKey = storedApiKey();
  if (!apiKey) {
    console.log('weather: no API key yet - open this watchface\\'s settings in the Pebble app');
    return;
  }
  var base = 'https://api.openweathermap.org/data/2.5/';
  var query =
    '?lat=' + latitude + '&lon=' + longitude + '&units=metric&appid=' + apiKey;

  getJson(base + 'weather' + query, function (now) {
    if (!now || !now.main || !now.weather || !now.weather.length) return;
    // Temperatures go over as tenths of a degree Celsius and wind as tenths of
    // a km/h (the service reports m/s), so the watch needs no floating point.
    send({
      WEATHER_TEMP: Math.round(now.main.temp * 10),
      WEATHER_FEELS_LIKE: Math.round(now.main.feels_like * 10),
      WEATHER_HIGH: Math.round(now.main.temp_max * 10),
      WEATHER_LOW: Math.round(now.main.temp_min * 10),
      WEATHER_HUMIDITY: Math.round(now.main.humidity),
      WEATHER_WIND: Math.round((now.wind ? now.wind.speed : 0) * 36),
      WEATHER_CONDITION: conditionFromCode(now.weather[0].id),
      WEATHER_LOCATION: String(now.name || '').substring(0, ${WEATHER_TEXT_BYTES - 1})
    });
  });

  // Chance of rain lives on the forecast endpoint, not the current one.
  getJson(base + 'forecast' + query + '&cnt=1', function (soon) {
    if (!soon || !soon.list || !soon.list.length) return;
    send({ WEATHER_RAIN_CHANCE: Math.round((soon.list[0].pop || 0) * 100) });
  });
}

function locateAndFetch() {
  navigator.geolocation.getCurrentPosition(
    function (position) {
      fetchWeather(position.coords.latitude, position.coords.longitude);
    },
    function (error) {
      console.log('weather: no location, ' + error.message);
    },
    { timeout: 15000, maximumAge: 600000 }
  );
}
`;

/**
 * The part of the companion that fetches the next calendar event. Only
 * emitted when needed.
 *
 * The stored value is a JSON array of URLs even though the settings page
 * only edits one today - so a later "add another calendar" page needs no
 * change to how the value is read or saved, just to how it is edited and
 * merged.
 */
const CALENDAR_JS = `var CALENDAR_URLS_STORAGE_KEY = 'calendarIcsUrls';

function storedCalendarUrls() {
  try {
    var parsed = JSON.parse(localStorage.getItem(CALENDAR_URLS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// RFC 5545 line folding: a continuation line starts with a space or tab.
function unfoldIcs(text) {
  return text.replace(/\\r\\n[ \\t]/g, '').replace(/\\n[ \\t]/g, '');
}

// All-day (VALUE=DATE) events and ones qualified with a TZID are
// approximated as this phone's own timezone, which is exact for a calendar
// kept in your own timezone and approximate otherwise; a bare Z is exact.
function parseIcsDate(value) {
  if (/^\\d{8}$/.test(value)) return null;
  var m = /^(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +m[6];
  if (m[7] === 'Z') return Math.floor(Date.UTC(y, mo - 1, d, h, mi, s) / 1000);
  return Math.floor(new Date(y, mo - 1, d, h, mi, s).getTime() / 1000);
}

function icsText(value) {
  return value.replace(/\\\\n/gi, ' ').replace(/\\\\,/g, ',').replace(/\\\\\\\\/g, '\\\\');
}

// Recurring events (RRULE) are skipped rather than expanded - a wrong "next
// event" is worse than a missing one.
function parseIcsEvents(text) {
  var lines = unfoldIcs(text).split(/\\r\\n|\\n|\\r/);
  var events = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && !cur.recurring) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    var colon = line.indexOf(':');
    if (colon < 0) continue;
    var name = line.slice(0, colon).split(';')[0];
    var value = line.slice(colon + 1);
    if (name === 'SUMMARY') cur.title = icsText(value);
    else if (name === 'LOCATION') cur.location = icsText(value);
    else if (name === 'DTSTART') cur.start = parseIcsDate(value);
    else if (name === 'RRULE') cur.recurring = true;
  }
  return events;
}

function nextEvent(events) {
  var now = Math.floor(Date.now() / 1000);
  var best = null;
  for (var i = 0; i < events.length; i++) {
    if (events[i].start >= now && (!best || events[i].start < best.start)) best = events[i];
  }
  return best;
}

function getText(url, done) {
  var request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.onload = function () {
    if (request.status !== 200) {
      console.log('calendar: HTTP ' + request.status + ' from ' + url);
      return;
    }
    done(request.responseText);
  };
  request.onerror = function () {
    console.log('calendar: request failed');
  };
  request.send();
}

function fetchCalendar() {
  var urls = storedCalendarUrls();
  if (!urls.length) {
    console.log('calendar: no calendar URL yet - open this watchface\\'s settings in the Pebble app');
    return;
  }
  getText(urls[0], function (text) {
    var next = nextEvent(parseIcsEvents(text));
    if (!next) {
      send({ CALENDAR_HAS_EVENT: 0 });
      return;
    }
    send({
      CALENDAR_HAS_EVENT: 1,
      CALENDAR_START: next.start,
      CALENDAR_TITLE: (next.title || '').substring(0, ${CALENDAR_TITLE_BYTES - 1}),
      CALENDAR_LOCATION: (next.location || '').substring(0, ${CALENDAR_LOCATION_BYTES - 1})
    });
  });
}
`;

/**
 * The PebbleKit JS companion.
 *
 * The watch itself has no network, so weather and the next calendar event
 * both have to be fetched by JavaScript running on the phone and pushed over
 * AppMessage. `enableMultiJS` is off (see generatePackageJson), so this has
 * to stay one self-contained script - there is no `require` to split it with.
 *
 * Nothing personal is baked into this file. The settings HTML is built as a
 * data: URI and opened with `Pebble.openURL`, and whatever it collects lives
 * in this phone's localStorage, entered after the watchface is installed via
 * the gear icon the 'configurable' capability adds next to it.
 */
export function generateCompanionJs(project: WatchfaceProject, analysis: ProjectAnalysis): string {
  const needsWeather = analysis.needsWeather;
  const needsCalendar = analysis.needsCalendar;

  const fetches: string[] = [];
  if (needsWeather) fetches.push('weather');
  if (needsCalendar) fetches.push('the next calendar event');

  const settingsFields =
    (needsWeather
      ? `'<h2>Weather</h2>' +
    '<label>OpenWeatherMap API key</label>' +
    '<input id="apiKey" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="' +
      escapeForHtmlAttribute(current.apiKey) + '">' +
    '<p class="hint">Free at <a href="https://openweathermap.org/api">openweathermap.org/api</a>.</p>' +
    `
      : '') +
    (needsCalendar
      ? `'<h2>Calendar</h2>' +
    '<label>Calendar ICS URL</label>' +
    '<input id="calendarUrl" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="' +
      escapeForHtmlAttribute(current.calendarUrl) + '">' +
    '<p class="hint">A Google Calendar "secret address in iCal format", or an iCloud calendar\\'s public link.</p>' +
    `
      : '');

  const showConfigCurrent =
    (needsWeather ? '    apiKey: storedApiKey(),\n' : '') +
    (needsCalendar ? "    calendarUrl: storedCalendarUrls()[0] || '',\n" : '');

  const webviewClosedWeather = needsWeather
    ? `  if (typeof config.apiKey === 'string') {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, config.apiKey);
    } catch (err) {
      console.log('weather: could not save the key, ' + err);
    }
  }
`
    : '';

  const webviewClosedCalendar = needsCalendar
    ? `  if (typeof config.calendarUrl === 'string') {
    try {
      var urls = config.calendarUrl ? [config.calendarUrl] : [];
      localStorage.setItem(CALENDAR_URLS_STORAGE_KEY, JSON.stringify(urls));
    } catch (err) {
      console.log('calendar: could not save the URL, ' + err);
    }
  }
`
    : '';

  const refreshCalls =
    (needsWeather ? '  locateAndFetch();\n' : '') + (needsCalendar ? '  fetchCalendar();\n' : '');

  return `// Phone companion for "${project.name}".
// Generated by Pebble Watchface Builder.
//
// This runs on your phone, not on the watch. It fetches ${fetches.join(' and ')} and
// sends them to the watchface over AppMessage. The watchface shows its
// placeholder until the first message lands - and until settings are entered
// below, since there is nothing to fetch without them.
//
// Settings live on this phone only: tap the watchface's gear icon in the
// Pebble app's watchapp list to open the settings page and enter them.

function escapeForHtmlAttribute(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function send(payload) {
  Pebble.sendAppMessage(payload, null, function (e) {
    console.log('companion: could not reach the watch, ' + JSON.stringify(e));
  });
}

${needsWeather ? WEATHER_JS : ''}${needsCalendar ? CALENDAR_JS : ''}
// A settings page, self-contained so it needs no hosting: it travels to the
// phone's browser as a data: URI, not a fetched URL.
function buildSettingsHtml(current) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Watchface Settings</title><style>' +
    'body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;margin:0;padding:16px}' +
    'h1{font-size:18px;margin:0 0 16px}' +
    'h2{font-size:13px;margin:20px 0 8px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}' +
    'label{display:block;font-size:12px;color:#94a3b8;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em}' +
    'input{width:100%;box-sizing:border-box;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:10px;font-size:14px}' +
    'p.hint{font-size:12px;color:#94a3b8;margin:8px 0 4px}' +
    'a{color:#38bdf8}' +
    'button{width:100%;padding:14px;font-size:15px;font-weight:600;border:none;border-radius:8px;background:#0891b2;color:#fff;margin-top:20px}' +
    '</style></head><body>' +
    '<h1>Watchface Settings</h1>' +
    ${settingsFields}
    '<button id="saveBtn">Save</button>' +
    '<script>' +
    'document.getElementById("saveBtn").addEventListener("click", function () {' +
    'var payload = {};' +
    // Read by feature detection rather than by which fields this export
    // actually has, so this one script works unmodified either way.
    'var apiKeyEl = document.getElementById("apiKey");' +
    'if (apiKeyEl) { payload.apiKey = apiKeyEl.value.trim(); }' +
    'var calendarUrlEl = document.getElementById("calendarUrl");' +
    'if (calendarUrlEl) { payload.calendarUrl = calendarUrlEl.value.trim(); }' +
    'document.location = "pebblejs://close#" + encodeURIComponent(JSON.stringify(payload));' +
    '});' +
    '</script></body></html>';
}

Pebble.addEventListener('showConfiguration', function () {
  var html = buildSettingsHtml({
${showConfigCurrent}  });
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e.response) return;
  var config;
  try {
    config = JSON.parse(decodeURIComponent(e.response));
  } catch (err) {
    console.log('settings: could not read them, ' + err);
    return;
  }
${webviewClosedWeather}${webviewClosedCalendar}  refreshAll();
});

// Once when the watchface starts, and again whenever it asks.
function refreshAll() {
${refreshCalls}}
Pebble.addEventListener('ready', refreshAll);
Pebble.addEventListener('appmessage', refreshAll);
`;
}

export function generateResourceInstructions(analysis: ProjectAnalysis): ResourceInstruction[] {
  const out: ResourceInstruction[] = [];

  for (const font of analysis.fonts) {
    out.push({
      kind: 'font',
      fileName: font.font.fileName,
      identifier: font.resourceId,
      constant: `RESOURCE_ID_${font.resourceId}`,
      detail:
        `Upload the TTF/OTF as a "Font" resource and set the identifier to ${font.resourceId}. ` +
        `The trailing _${font.size} is what tells the SDK to rasterize the face at ${font.size}px - ` +
        `it is part of the identifier, not a separate setting.` +
        (font.font.characterRegex.trim()
          ? ` Set the character regex to ${font.font.characterRegex.trim()} to keep the built font small.`
          : ''),
    });
  }

  for (const image of analysis.images) {
    out.push({
      kind: 'bitmap',
      fileName: imageFileName(image),
      identifier: image.resourceId,
      constant: `RESOURCE_ID_${image.resourceId}`,
      detail:
        `Upload the PNG as a "Bitmap" resource with identifier ${image.resourceId}. ` +
        `Leave the resource type on "Bitmap" so the SDK picks the right color depth for the target.`,
    });
  }

  return out;
}

export function generateReadme(
  project: WatchfaceProject,
  analysis: ProjectAnalysis,
  resources: ResourceInstruction[],
): string {
  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  lines.push('');
  const spec = platformSpec(project.platform);
  lines.push(
    `Generated by Pebble Watchface Builder for the ${spec.name} ` +
      `(${spec.sdkPlatform}, ${spec.width}x${spec.height}, ` +
      `${spec.colorMode === 'bw' ? 'black & white' : `${spec.colorCount} colors`}).`,
  );
  lines.push('');
  lines.push('## Contents');
  lines.push('');
  lines.push('- `src/c/main.c` - the whole watchface.');
  lines.push('- `package.json` - app metadata and the resource manifest.');
  lines.push(
    `- \`${PROJECT_FILE_NAME}\` - this design in the builder's own format. ` +
      "Open it again from the builder's Project tab to keep editing.",
  );
  if (analysis.fonts.length) lines.push('- `resources/fonts/` - the font files this face needs.');
  if (analysis.images.length) lines.push('- `resources/images/` - the images this face needs.');
  if (analysis.needsWeather || analysis.needsCalendar) {
    lines.push(
      `- \`${COMPANION_JS_PATH}\` - the phone-side companion that fetches ` +
        `${[
          analysis.needsWeather && 'the weather',
          analysis.needsCalendar && 'the next calendar event',
        ]
          .filter(Boolean)
          .join(' and ')}.`,
    );
  }
  lines.push('');
  lines.push('## Building on CloudPebble');
  lines.push('');
  lines.push(
    '1. Create a new project: **Project type = Pebble C SDK**, **Template = Default app**.',
  );
  lines.push(
    `2. In **Settings**, set the app to a *watchface*, and enable the **${platformLabel(spec.sdkPlatform)}** platform.`,
  );
  lines.push(`3. Set the UUID to \`${project.uuid}\` (or keep the one CloudPebble generated).`);
  let step = 4;
  if (analysis.needsHealth) {
    lines.push(
      `${step}. In **Settings → Capabilities**, tick **Health** - the step counter needs it.`,
    );
    step += 1;
  }
  if (analysis.needsWeather || analysis.needsCalendar) {
    lines.push(
      `${step}. In **Settings → Capabilities**, tick **Configurable** - this is what puts a gear ` +
        'icon next to the watchface in the phone app, where settings get entered after install.',
    );
    step += 1;
  }
  lines.push('');
  if (analysis.needsWeather || analysis.needsCalendar) {
    const pieces = [
      analysis.needsWeather && 'the weather',
      analysis.needsCalendar && 'the next calendar event',
    ]
      .filter(Boolean)
      .join(' and ');
    lines.push(`### ${pieces[0]!.toUpperCase()}${pieces.slice(1)} needs two extra pieces`);
    lines.push('');
    lines.push(
      `The watch has no network of its own, so ${pieces} ${analysis.needsWeather && analysis.needsCalendar ? 'are' : 'is'} fetched by ` +
        'JavaScript on your phone and sent over. CloudPebble keeps that JavaScript and its ' +
        'message keys outside your C source, so both have to be added by hand.',
    );
    lines.push('');
    lines.push(
      `1. Add a **JavaScript** source file in CloudPebble and paste \`${COMPANION_JS_PATH}\` into it.`,
    );
    lines.push(
      '2. In **Settings → Message Keys** (called App Keys on older builds), add each of these, ' +
        'spelled exactly:',
    );
    lines.push('');
    if (analysis.needsWeather) for (const key of WEATHER_MESSAGE_KEYS) lines.push(`   - \`${key}\``);
    if (analysis.needsCalendar) for (const key of CALENDAR_MESSAGE_KEYS) lines.push(`   - \`${key}\``);
    lines.push('');
    lines.push(
      'No secrets go in this file. Once the watchface is installed, its gear icon in the phone ' +
        'app opens a settings page' +
        (analysis.needsWeather
          ? ' for entering an OpenWeatherMap key (a free one from openweathermap.org is enough)'
          : '') +
        (analysis.needsWeather && analysis.needsCalendar ? ' and' : '') +
        (analysis.needsCalendar
          ? " for entering a calendar's ICS feed URL (a Google Calendar \"secret address in iCal " +
            'format", or an iCloud calendar\'s public link)'
          : '') +
        ' - saved on the phone, not in this project.',
    );
    lines.push('');
    lines.push(
      `${pieces[0]!.toUpperCase()}${pieces.slice(1)} elements show their placeholder until settings are entered and the first ` +
        'reading arrives, which takes a few seconds after that.',
    );
    lines.push('');
  }
  if (resources.length) {
    lines.push('### Resources you must upload by hand');
    lines.push('');
    lines.push(
      'CloudPebble stores fonts and images outside your source, so these cannot be generated as code.',
    );
    lines.push('Open the **Resources** tab, click **Add New**, and create each of these:');
    lines.push('');
    lines.push('| File | Type | Identifier (exact) | Used in code as |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of resources) {
      lines.push(
        `| \`${r.fileName}\` | ${r.kind === 'font' ? 'Font' : 'Bitmap'} | \`${r.identifier}\` | \`${r.constant}\` |`,
      );
    }
    lines.push('');
    lines.push(
      'The identifier has to match character for character; the generated `main.c` refers to these names directly.',
    );
    lines.push('');
  } else {
    lines.push('### Resources');
    lines.push('');
    lines.push('This watchface only uses built-in system fonts, so there is nothing to upload.');
    lines.push('');
  }
  lines.push(`${step}. Paste \`src/c/main.c\` over the contents of the project's \`main.c\`.`);
  lines.push(`${step + 1}. Hit **Save**, then **Compile → Run/Install**.`);
  lines.push('');
  lines.push('## Building with the local Pebble SDK');
  lines.push('');
  lines.push('```');
  lines.push('pebble new-project my-watchface');
  lines.push('# copy src/c/main.c, package.json, and resources/ from this bundle over the new project');
  lines.push('pebble build');
  lines.push(`pebble install --emulator ${spec.sdkPlatform}`);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

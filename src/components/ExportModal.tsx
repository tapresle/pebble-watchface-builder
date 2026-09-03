/**
 * Export view: the generated C, the SDK package.json, and the setup guide that
 * covers the parts of a CloudPebble project you cannot express in code.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { analyzeProject } from '../codegen/analyze';
import { generateC } from '../codegen/generateC';
import {
  WEATHER_JS_PATH,
  generatePackageJson,
  generateReadme,
  generateResourceInstructions,
  generateWeatherJs,
  imageFileName,
  platformLabel,
} from '../codegen/generateProject';
import { WEATHER_MESSAGE_KEYS } from '../lib/weather';
import { platformSpec } from '../lib/platform';
import { base64ToUint8Array, downloadBlob, PROJECT_FILE_NAME, projectSlug } from '../lib/utils';
import { createZip, textEntry, type ZipEntry } from '../lib/zip';
import { reduceImage, reduceOptions } from '../lib/imageConvert';
import { Modal } from './Modal';
import { CloseIcon, DownloadIcon } from './icons';

type Tab = 'guide' | 'c' | 'manifest' | 'js';

export function ExportModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { project } = store;
  const [tab, setTab] = useState<Tab>('guide');
  const [toast, setToast] = useState<string | null>(null);

  const bundle = useMemo(() => {
    const analysis = analyzeProject(project);
    const resources = generateResourceInstructions(analysis);
    return {
      analysis,
      resources,
      mainC: generateC(project, analysis),
      packageJson: generatePackageJson(project, analysis),
      readme: generateReadme(project, analysis, resources),
      weatherJs: analysis.needsWeather ? generateWeatherJs(project) : null,
    };
  }, [project]);

  const spec = platformSpec(project.platform);
  const slug = projectSlug(project.name);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${what} copied to the clipboard`);
    } catch {
      setToast('Your browser blocked clipboard access - select the code and copy it manually.');
    }
    setTimeout(() => setToast(null), 2600);
  };

  const downloadZip = async () => {
    const entries: ZipEntry[] = [
      textEntry('src/c/main.c', bundle.mainC),
      textEntry('package.json', bundle.packageJson),
      textEntry('README.md', bundle.readme),
      textEntry(PROJECT_FILE_NAME, JSON.stringify(project, null, 2)),
    ];
    if (bundle.weatherJs) entries.push(textEntry(WEATHER_JS_PATH, bundle.weatherJs));
    for (const font of bundle.analysis.fonts) {
      entries.push({
        name: `resources/fonts/${font.font.fileName}`,
        data: base64ToUint8Array(font.font.data),
      });
    }
    for (const image of bundle.analysis.images) {
      // Ship the same pixels the editor showed, so the SDK's own reduction has
      // nothing left to decide.
      const data = await reduceImage(
        image.asset,
        reduceOptions(image.asset, spec.colorMode),
        spec.colorMode,
        { width: image.width, height: image.height },
      );
      entries.push({
        name: `resources/images/${imageFileName(image)}`,
        data: base64ToUint8Array(data),
      });
    }
    downloadBlob(createZip(entries), `${slug}.zip`);
  };

  return (
    <Modal size="lg" label="Export watchface" onClose={onClose}>
        <div className="modal-header">
          <div className="modal-heading">
            <span className="modal-title">Export · {project.name}</span>
            <span className="modal-subtitle">
              {spec.name} · {spec.width} × {spec.height} · <code>{spec.sdkPlatform}</code>
            </span>
          </div>
          <div className="segmented" style={{ width: 360, flex: 'none' }}>
            <button type="button" aria-pressed={tab === 'guide'} onClick={() => setTab('guide')}>
              CloudPebble setup
            </button>
            <button type="button" aria-pressed={tab === 'c'} onClick={() => setTab('c')}>
              main.c
            </button>
            <button type="button" aria-pressed={tab === 'manifest'} onClick={() => setTab('manifest')}>
              package.json
            </button>
            {bundle.weatherJs && (
              <button type="button" aria-pressed={tab === 'js'} onClick={() => setTab('js')}>
                index.js
              </button>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {tab === 'c' && (
            <button type="button" className="btn" onClick={() => copy(bundle.mainC, 'main.c')}>
              Copy main.c
            </button>
          )}
          {tab === 'manifest' && (
            <button type="button" className="btn" onClick={() => copy(bundle.packageJson, 'package.json')}>
              Copy package.json
            </button>
          )}
          {tab === 'js' && bundle.weatherJs && (
            <button type="button" className="btn" onClick={() => copy(bundle.weatherJs!, 'index.js')}>
              Copy index.js
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void downloadZip()}>
            <DownloadIcon /> Download project
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          {tab === 'c' && <pre className="code-block">{bundle.mainC}</pre>}
          {tab === 'manifest' && <pre className="code-block">{bundle.packageJson}</pre>}
          {tab === 'js' && <pre className="code-block">{bundle.weatherJs}</pre>}
          {tab === 'guide' && (
            <SetupGuide
              onDownload={() => void downloadZip()}
              resources={bundle.resources}
              warnings={bundle.analysis.warnings}
              needsHealth={bundle.analysis.needsHealth}
              needsSeconds={bundle.analysis.needsSeconds}
              needsWeather={bundle.analysis.needsWeather}
              hasWeatherKey={project.options.weatherApiKey.trim().length > 0}
              onCopyWeatherJs={() => bundle.weatherJs && copy(bundle.weatherJs, 'index.js')}
              uuid={project.uuid}
              name={project.name}
              spec={spec}
              onCopyMainC={() => copy(bundle.mainC, 'main.c')}
            />
          )}
        </div>
      {toast && <div className="toast">{toast}</div>}
    </Modal>
  );
}

function SetupGuide({
  onDownload,
  resources,
  warnings,
  needsHealth,
  needsSeconds,
  needsWeather,
  hasWeatherKey,
  uuid,
  name,
  spec,
  onCopyMainC,
  onCopyWeatherJs,
}: {
  onDownload: () => void;
  resources: ReturnType<typeof generateResourceInstructions>;
  warnings: string[];
  needsHealth: boolean;
  needsSeconds: boolean;
  needsWeather: boolean;
  hasWeatherKey: boolean;
  uuid: string;
  name: string;
  spec: ReturnType<typeof platformSpec>;
  onCopyMainC: () => void;
  onCopyWeatherJs: () => void;
}) {
  const fonts = resources.filter((r) => r.kind === 'font');
  const images = resources.filter((r) => r.kind === 'bitmap');

  return (
    <div className="doc">
      {warnings.length > 0 && (
        <div className="callout callout-warn">
          <strong className="callout-title">Check these before building</strong>
          <ul style={{ margin: '4px 0 0' }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>1 · Download the project</h3>
      <p>
        Everything the steps below refer to is in this zip - the code to paste, the resource files
        to upload, and a copy of this design you can re-open here later.
      </p>
      <p>
        <button type="button" className="btn btn-primary" onClick={onDownload}>
          <DownloadIcon /> Download project
        </button>
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>In the zip</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>src/c/main.c</code>
            </td>
            <td>The whole watchface. You paste this into CloudPebble in step 4.</td>
          </tr>
          <tr>
            <td>
              <code>package.json</code>
            </td>
            <td>
              App metadata and the resource manifest, for the local SDK. CloudPebble sets these
              through its own Settings tab instead.
            </td>
          </tr>
          <tr>
            <td>
              <code>{PROJECT_FILE_NAME}</code>
            </td>
            <td>
              This design, in the builder's own format. Keep it - <strong>Open project.json</strong>{' '}
              on the Project tab loads it back, with your fonts and images. It is the only file here
              you can keep editing from.
            </td>
          </tr>
          {fonts.length > 0 && (
            <tr>
              <td>
                <code>resources/fonts/</code>
              </td>
              <td>The font files to upload in step 3.</td>
            </tr>
          )}
          {images.length > 0 && (
            <tr>
              <td>
                <code>resources/images/</code>
              </td>
              <td>
                The images to upload in step 3, already reduced to what this watch can display.
              </td>
            </tr>
          )}
          <tr>
            <td>
              <code>README.md</code>
            </td>
            <td>These same steps, plus the local <code>pebble build</code> route.</td>
          </tr>
        </tbody>
      </table>

      <h3>2 · Create the CloudPebble project</h3>
      <ol>
        <li>
          In CloudPebble choose <strong>Create project</strong>, name it <code>{name}</code>, set{' '}
          <strong>Project type</strong> to <strong>Pebble C SDK</strong>, and leave{' '}
          <strong>Template</strong> on <strong>Default app</strong>. Step 4 replaces the template's
          code anyway, so any of them would do.
        </li>
        <li>
          Open <strong>Settings</strong>. Set <strong>App kind</strong> to <strong>Watchface</strong>.
        </li>
        <li>
          Under <strong>Supported platforms</strong>, enable{' '}
          <strong>{platformLabel(spec.sdkPlatform)}</strong> - that is the {spec.name} at{' '}
          {spec.width}×{spec.height}. You can leave the other platforms on, but this design is laid
          out for that screen only.
        </li>
        <li>
          Optional: set the UUID to <code>{uuid}</code> so re-installs replace the same watchface.
        </li>
        {needsWeather && (
          <li>
            Still in <strong>Settings</strong>, find <strong>Message Keys</strong> (older builds
            call it <strong>App Keys</strong>) and add each of these names, spelled exactly:{' '}
            {WEATHER_MESSAGE_KEYS.map((key, index) => (
              <span key={key}>
                {index > 0 && ', '}
                <code>{key}</code>
              </span>
            ))}
            . The generated C looks each one up by name, so a typo means that reading never
            arrives.
          </li>
        )}
        {needsHealth && (
          <li>
            Still in <strong>Settings</strong>, tick the <strong>Health</strong> capability. Without
            it the step count always reads zero.
          </li>
        )}
      </ol>

      <h3>3 · Upload resources by hand</h3>
      {resources.length === 0 ? (
        <p>
          Nothing to upload - this watchface only uses fonts that are built into the Pebble firmware.
          Skip straight to step 3.
        </p>
      ) : (
        <>
          <div className="callout callout-warn">
            <strong className="callout-title">This part can’t be generated as code</strong>
            CloudPebble keeps fonts and images in its <strong>Resources</strong> tab, outside your
            source files. The generated <code>main.c</code> refers to them by identifier, so the
            identifiers below have to match exactly - character for character, including the size
            suffix on fonts.
          </div>

          {fonts.length > 0 && (
            <>
              <h3>Fonts</h3>
              <ol>
                <li>
                  Open the <strong>Resources</strong> tab → <strong>Add New</strong>.
                </li>
                <li>
                  Set <strong>Resource Type</strong> to <strong>TrueType font</strong> and upload the
                  file (they are all in <code>resources/fonts/</code> of the downloaded project).
                </li>
                <li>
                  Add one <strong>Identifier</strong> per size listed below. CloudPebble lets a single
                  uploaded font carry several identifiers - click <strong>Add identifier</strong> for
                  each extra size.
                </li>
              </ol>
              <table className="table">
                <thead>
                  <tr>
                    <th>File to upload</th>
                    <th>Identifier</th>
                    <th>Used in code as</th>
                  </tr>
                </thead>
                <tbody>
                  {fonts.map((r) => (
                    <tr key={r.identifier}>
                      <td>
                        <code>{r.fileName}</code>
                      </td>
                      <td>
                        <code>{r.identifier}</code>
                      </td>
                      <td>
                        <code>{r.constant}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                The number at the end of the identifier is what sets the rasterized size -{' '}
                <code>MYFONT_42</code> builds the face at 42px. It is part of the name, not a separate
                field.
              </p>
            </>
          )}

          {images.length > 0 && (
            <>
              <h3>Images</h3>
              <ol>
                <li>
                  <strong>Resources</strong> → <strong>Add New</strong>, set{' '}
                  <strong>Resource Type</strong> to <strong>Bitmap</strong>.
                </li>
                <li>
                  Upload the PNG from <code>resources/images/</code> and set the identifier exactly as
                  below.
                </li>
                <li>
                  Leave the target platform unset so the same bitmap is used for Emery. The SDK picks
                  the color depth automatically.
                </li>
              </ol>
              <table className="table">
                <thead>
                  <tr>
                    <th>File to upload</th>
                    <th>Identifier</th>
                    <th>Used in code as</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((r) => (
                    <tr key={r.identifier}>
                      <td>
                        <code>{r.fileName}</code>
                      </td>
                      <td>
                        <code>{r.identifier}</code>
                      </td>
                      <td>
                        <code>{r.constant}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {needsWeather && (
        <>
          <h3>Weather: add the phone companion</h3>
          <p>
            The watch has no network of its own. Weather is fetched by JavaScript running on your
            phone, which sends the numbers to the watchface over AppMessage. CloudPebble keeps that
            JavaScript outside your C source, so it has to be added separately.
          </p>
          <ol>
            <li>
              In CloudPebble, open <strong>Source Files</strong> → <strong>Add New</strong>, set the
              target to <strong>PebbleKit JS</strong>, and name it <code>index.js</code>.
            </li>
            <li>
              Paste the generated companion into it.{' '}
              <button type="button" className="btn btn-sm" onClick={onCopyWeatherJs}>
                Copy index.js
              </button>{' '}
              It is also in the zip at <code>{WEATHER_JS_PATH}</code>.
            </li>
            <li>
              Put your own OpenWeatherMap key in the <code>API_KEY</code> line at the top. A free
              key from openweathermap.org is plenty.
            </li>
          </ol>
          {hasWeatherKey ? (
            <p>
              Your key from the <strong>Project</strong> tab is already baked into the generated
              file, so there is nothing to edit.
            </p>
          ) : (
            <div className="callout callout-warn">
              <strong className="callout-title">No API key yet</strong>
              The <code>API_KEY</code> line is empty. Put your key on the <strong>Project</strong>{' '}
              tab so it ships with the export, or paste it straight into the JavaScript in
              CloudPebble.
            </div>
          )}
          <p>
            Weather elements show their placeholder until the first reading lands, which is normally
            a few seconds after the watchface starts. The watch asks for a refresh on a timer after
            that.
          </p>
        </>
      )}

      <h3>4 · Paste the code</h3>
      <ol>
        <li>
          Open the source file CloudPebble created for you (usually <code>main.c</code> under{' '}
          <strong>Source Files</strong>).
        </li>
        <li>
          Select everything in it and replace it with the generated <code>main.c</code>.{' '}
          <button type="button" className="btn btn-sm" onClick={onCopyMainC}>
            Copy main.c
          </button>
        </li>
        <li>
          Press <strong>Save</strong>, then <strong>Compile</strong> → <strong>Run/Install</strong>.
        </li>
      </ol>

      <h3>5 · Good to know</h3>
      <ul>
        <li>
          Built-in Pebble fonts are previewed with stand-ins, scaled to each font's real measured
          cap height, so text is the right size and sits in the right place. Roboto and Droid Serif
          are the genuine article; Gothic, Bitham and LECO are commercial typefaces, so those
          preview with lookalikes and their letterforms and exact text widths will differ on the
          watch. Fonts you upload yourself preview exactly.
        </li>
        <li>
          The face redraws {needsSeconds ? 'every second' : 'once a minute'}
          {needsSeconds
            ? ' because something on it shows seconds. That costs noticeably more battery.'
            : ', which is the battery-friendly default.'}
        </li>
        <li>
          {spec.colorMode === 'bw' ? (
            <>
              The {spec.name} has a 1-bit screen, so every color in this design is already either
              black or white - nothing gets dithered behind your back.
            </>
          ) : (
            <>
              Colors are already limited to the {spec.colorCount} the watch can show, so what you
              picked is what you get.
            </>
          )}
        </li>
        <li>
          Uploaded PNGs are reduced to the {spec.colorMode === 'bw' ? 'two shades' : `${spec.colorCount} colors`}{' '}
          the {spec.name} can show before they go in the zip, using the setting on each image in
          the Assets tab. The file you upload to CloudPebble is the one you previewed.
        </li>
        <li>
          Prefer the local SDK? The downloaded zip has a <code>README.md</code> with the{' '}
          <code>pebble build</code> steps.
        </li>
      </ul>
    </div>
  );
}

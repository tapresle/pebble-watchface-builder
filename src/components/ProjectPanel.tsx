/** Watchface metadata, canvas background, global options, and project I/O. */

import { useRef, useState } from 'react';
import { useStore } from '../store';
import { ColorField, Field, NumberField, TextField, ToggleField } from './fields';
import { downloadText, PROJECT_FILE_NAME, uuidv4 } from '../lib/utils';
import { CoffeeButton } from './CoffeeButton';
import { ConfirmDialog } from './ConfirmDialog';
import { readProject } from '../store';
import { DevicePicker } from './DevicePicker';

type Dialog = 'none' | 'newProject' | 'switchDevice' | 'importFailed';

export function ProjectPanel() {
  const store = useStore();
  const { project, spec } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<Dialog>('none');
  const [importError, setImportError] = useState<string | null>(null);
  const hasWeather = project.elements.some((el) => el.type === 'weather');

  const importProject = async (file: File) => {
    setImportError(null);
    try {
      const parsed = readProject(JSON.parse(await file.text()));
      if (!parsed) throw new Error('Not a watchface project file.');
      store.replaceProject(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file.');
      setDialog('importFailed');
    }
  };

  return (
    <div className="panel-scroll">
      <div className="section-title">Target watch</div>
      <div className="device-summary">
        <div>
          <div className="device-summary-name">{spec.name}</div>
          <div className="device-summary-meta">
            {spec.width} × {spec.height} ·{' '}
            {spec.colorMode === 'bw' ? 'black & white' : `${spec.colorCount} colors`} ·{' '}
            <code>{spec.sdkPlatform}</code>
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setDialog('switchDevice')}>
          Change
        </button>
      </div>

      <div className="section-title">Watchface</div>
      <TextField
        label="Name"
        value={project.name}
        onChange={(name) => store.update((p) => ({ ...p, name }), { snapshot: false })}
        hint="Shown on the watch and used as the CloudPebble project name."
      />
      <TextField
        label="Author"
        value={project.author}
        onChange={(author) => store.update((p) => ({ ...p, author }), { snapshot: false })}
      />
      <TextField
        label="Version"
        value={project.version}
        onChange={(version) => store.update((p) => ({ ...p, version }), { snapshot: false })}
        hint="Written to package.json as a three-part version, e.g. 1.0 → 1.0.0."
      />
      <Field
        label="UUID"
        hint="Every watchface needs its own. Keep this one to update an installed face in place."
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
            value={project.uuid}
            readOnly
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => store.update((p) => ({ ...p, uuid: uuidv4() }))}
          >
            New
          </button>
        </div>
      </Field>

      <div className="section-title">Canvas</div>
      <ColorField
        label="Background color"
        value={project.backgroundColor}
        onChange={(backgroundColor) => store.update((p) => ({ ...p, backgroundColor }))}
      />

      <div className="section-title">Behavior</div>
      <ToggleField
        label="Redraw every second"
        checked={project.options.forceSecondTicks}
        onChange={(forceSecondTicks) =>
          store.update((p) => ({ ...p, options: { ...p.options, forceSecondTicks } }))
        }
        hint="Turns on automatically when something on the face shows seconds. Costs battery."
      />
      <ToggleField
        label="Vibrate when Bluetooth disconnects"
        checked={project.options.vibeOnDisconnect}
        onChange={(vibeOnDisconnect) =>
          store.update((p) => ({ ...p, options: { ...p.options, vibeOnDisconnect } }))
        }
      />

      {hasWeather && (
        <>
          <div className="section-title">Weather</div>
          <TextField
            label="OpenWeatherMap API key"
            value={project.options.weatherApiKey}
            onChange={(weatherApiKey) =>
              store.update((p) => ({ ...p, options: { ...p.options, weatherApiKey } }), {
                snapshot: false,
              })
            }
            mono
            hint="Baked into the companion JavaScript the export generates. A free key from openweathermap.org is enough. It is stored in this project file, so treat a downloaded copy as private."
          />
          <NumberField
            label="Refresh every (minutes)"
            value={project.options.weatherRefreshMinutes}
            min={5}
            max={180}
            onChange={(weatherRefreshMinutes) =>
              store.update((p) => ({
                ...p,
                options: { ...p.options, weatherRefreshMinutes: Math.round(weatherRefreshMinutes) },
              }))
            }
            hint="How often the watch asks the phone for a new reading. Shorter intervals cost battery on both."
          />
        </>
      )}

      <div className="section-title">Project file</div>
      <div style={{ display: 'grid', gap: 7 }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            downloadText(JSON.stringify(project, null, 2), PROJECT_FILE_NAME)
          }
        >
          Download project.json
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Open project.json
        </button>
        <button type="button" className="btn btn-danger" onClick={() => setDialog('newProject')}>
          Start a new watchface
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importProject(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="field-hint" style={{ marginTop: 12 }}>
        Your work is saved in this browser automatically. Downloading the JSON is the way to move it
        to another machine - it includes your uploaded fonts and images.
      </p>

      <CoffeeButton />

      {dialog === 'newProject' && (
        <DevicePicker
          mode="new"
          onCancel={() => setDialog('none')}
          onPick={(platform) => {
            store.startProject(platform);
            setDialog('none');
          }}
        />
      )}

      {dialog === 'switchDevice' && (
        <DevicePicker
          mode="switch"
          onCancel={() => setDialog('none')}
          onPick={(platform) => {
            store.changeDevice(platform);
            setDialog('none');
          }}
        />
      )}

      {dialog === 'importFailed' && (
        <ConfirmDialog
          title="That file could not be opened"
          confirmLabel="Try another file"
          cancelLabel="Close"
          onConfirm={() => {
            setDialog('none');
            fileRef.current?.click();
          }}
          onCancel={() => setDialog('none')}
        >
          <p>{importError}</p>
          <p>
            Pick a JSON file that this builder exported - the one you get from{' '}
            <strong>Download project.json</strong>.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

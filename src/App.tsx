import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { Canvas, type CanvasSettings } from './components/Canvas';
import { StageToolbar } from './components/StageToolbar';
import { PalettePanel } from './components/PalettePanel';
import { LayersPanel } from './components/LayersPanel';
import { AssetsPanel } from './components/AssetsPanel';
import { ProjectPanel } from './components/ProjectPanel';
import { Inspector } from './components/Inspector';
import { CoffeeButton } from './components/CoffeeButton';
import { ExportModal } from './components/ExportModal';
import { DevicePicker } from './components/DevicePicker';

type LeftTab = 'add' | 'layers' | 'assets' | 'project';

const THEME_KEY = 'pebble-watchface-builder/theme';

type Theme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const systemTheme = (): Theme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/** The saved override, or null while the app is still following the system. */
function savedTheme(): Theme | null {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

/**
 * The theme follows the operating system until the user says otherwise.
 *
 * Nothing is written to storage just for rendering, so a first visit does not
 * pin a theme the user never chose and then ignore their system setting for
 * good. Toggling back to whatever the system is drops the override and
 * resumes following it, which is the only way back without clearing storage.
 */
function useTheme(): [Theme, () => void] {
  const [override, setOverride] = useState<Theme | null>(savedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const theme = override ?? system;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    if (next === system) {
      setOverride(null);
      localStorage.removeItem(THEME_KEY);
    } else {
      setOverride(next);
      localStorage.setItem(THEME_KEY, next);
    }
  }, [theme, system]);

  return [theme, toggle];
}

/** Element-level keyboard shortcuts, ignored while a form field has focus. */
function useShortcuts() {
  const store = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
        return;
      }
      if (typing) return;

      const el = store.selected;
      if (!el) return;

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        store.duplicateElement(el.id);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.removeElement(el.id);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = nudge[e.key];
      if (delta && !el.locked) {
        e.preventDefault();
        store.patchElement(el.id, { x: el.x + delta[0], y: el.y + delta[1] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);
}

function Workspace() {
  const store = useStore();
  const [tab, setTab] = useState<LeftTab>('add');
  const [exporting, setExporting] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [settings, setSettings] = useState<CanvasSettings>({ zoom: 2, showGrid: false, snap: 1 });
  useShortcuts();

  const onSettings = useCallback((next: CanvasSettings) => setSettings(next), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Pebble Watchface Builder
          <span className="brand-sub">
            {store.spec.name} · {store.spec.width}×{store.spec.height}
          </span>
        </div>

        <div className="topbar-spacer" />

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={store.undo}
          disabled={!store.canUndo}
          title="Undo (⌘Z)"
        >
          ↺
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={store.redo}
          disabled={!store.canRedo}
          title="Redo (⇧⌘Z)"
        >
          ↻
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={toggleTheme}
          title="Toggle light / dark"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <a
          className="btn btn-ghost btn-icon topbar-link"
          href="https://github.com/tapresle/pebble-watchface-builder"
          target="_blank"
          rel="noopener noreferrer"
          title="View the source on GitHub"
          aria-label="View the source on GitHub"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
        <button type="button" className="btn btn-primary" onClick={() => setExporting(true)}>
          Export for CloudPebble
        </button>
      </header>

      <div className="workspace">
        <aside className="panel panel-left">
          <div className="tabs" role="tablist">
            {(
              [
                ['add', 'Add'],
                ['layers', 'Layers'],
                ['assets', 'Assets'],
                ['project', 'Project'],
              ] as [LeftTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'add' && <PalettePanel />}
          {tab === 'layers' && <LayersPanel />}
          {tab === 'assets' && <AssetsPanel />}
          {tab === 'project' && <ProjectPanel />}
        </aside>

        <main className="stage">
          {store.storageWarning && (
            <div className="warning-bar" style={{ margin: 12, marginBottom: 0 }}>
              {store.storageWarning}
            </div>
          )}
          <Canvas settings={settings} />
          <StageToolbar settings={settings} onSettings={onSettings} />
        </main>

        <aside className="panel panel-right">
          <div className="tabs">
            <span className="tab tab-static">Properties</span>
          </div>
          <Inspector />
          <CoffeeButton />
        </aside>
      </div>

      {exporting && <ExportModal onClose={() => setExporting(false)} />}

      {/* First visit with nothing saved: pick a watch before anything else. */}
      {store.needsDeviceChoice && (
        <DevicePicker mode="new" onPick={(platform) => store.startProject(platform)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}

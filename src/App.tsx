import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { Canvas, type CanvasSettings } from './components/Canvas';
import { StageToolbar } from './components/StageToolbar';
import { PalettePanel } from './components/PalettePanel';
import { LayersPanel } from './components/LayersPanel';
import { AssetsPanel } from './components/AssetsPanel';
import { ProjectPanel } from './components/ProjectPanel';
import { Inspector } from './components/Inspector';
import { ExportModal } from './components/ExportModal';
import { DevicePicker } from './components/DevicePicker';
import { detectLayout, type Layout } from './lib/layout';

/** The stacked layout folds Properties into the same strip as the rest. */
type PanelTab = 'add' | 'layers' | 'assets' | 'project' | 'properties';

const DESKTOP_TABS: [PanelTab, string][] = [
  ['add', 'Add'],
  ['layers', 'Layers'],
  ['assets', 'Assets'],
  ['project', 'Project'],
];
const MOBILE_TABS: [PanelTab, string][] = [...DESKTOP_TABS, ['properties', 'Properties']];

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

/**
 * The layout, chosen from the viewport at load and then left alone.
 *
 * There is no resize listener on purpose: rotating a tablet or opening a soft
 * keyboard must not rearrange the editor mid-edit. Nothing is persisted
 * either, so the toggle lasts for the session and a reload asks the viewport
 * again.
 */
function useLayout(): [Layout, () => void] {
  const [layout, setLayout] = useState<Layout>(detectLayout);
  const toggle = useCallback(
    () => setLayout((current) => (current === 'mobile' ? 'desktop' : 'mobile')),
    [],
  );
  return [layout, toggle];
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

/** The tab strip shared by both layouts. */
function PanelTabs({
  tabs,
  active,
  onPick,
}: {
  tabs: [PanelTab, string][];
  active: PanelTab;
  onPick: (tab: PanelTab) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === id}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PanelBody({ tab }: { tab: PanelTab }) {
  return (
    <>
      {tab === 'add' && <PalettePanel />}
      {tab === 'layers' && <LayersPanel />}
      {tab === 'assets' && <AssetsPanel />}
      {tab === 'project' && <ProjectPanel />}
      {tab === 'properties' && <Inspector />}
    </>
  );
}

function Stage({
  settings,
  onSettings,
  onSelectOnCanvas,
}: {
  settings: CanvasSettings;
  onSettings: (next: CanvasSettings) => void;
  onSelectOnCanvas?: (id: string) => void;
}) {
  const store = useStore();
  return (
    <main className="stage">
      {store.storageWarning && (
        <div className="warning-bar" style={{ margin: 12, marginBottom: 0 }}>
          {store.storageWarning}
        </div>
      )}
      <Canvas settings={settings} onSelectOnCanvas={onSelectOnCanvas} />
      <StageToolbar settings={settings} onSettings={onSettings} />
    </main>
  );
}

const LAYOUT_ICON: Record<Layout, JSX.Element> = {
  // Each button shows the layout it switches to, the way the theme toggle does.
  desktop: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <rect x="4.5" y="1.2" width="7" height="13.6" rx="1.6" />
      <path d="M6.9 12.6h2.2" />
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <rect x="1.2" y="2.2" width="13.6" height="9.4" rx="1.6" />
      <path d="M8 11.6v2.6M5.4 14.2h5.2" />
    </svg>
  ),
};

function Workspace() {
  const store = useStore();
  const [layout, toggleLayout] = useLayout();
  const [tab, setTab] = useState<PanelTab>('add');
  const [exporting, setExporting] = useState(false);
  const [theme, toggleTheme] = useTheme();
  // The stacked layout has far less room, so it opens at 1x rather than 2x.
  const [settings, setSettings] = useState<CanvasSettings>(() => ({
    zoom: layout === 'mobile' ? 1 : 2,
    showGrid: false,
    snap: 1,
  }));
  useShortcuts();

  const onSettings = useCallback((next: CanvasSettings) => setSettings(next), []);

  // Properties is a tab rather than a panel in the stacked layout, so tapping
  // an element on the watch has to bring it forward or the tap looks inert.
  const onSelectOnCanvas = useCallback(() => {
    if (layout === 'mobile') setTab('properties');
  }, [layout]);

  const mobile = layout === 'mobile';
  // Properties has nowhere to go in the three-column layout, where it is a
  // panel of its own rather than a tab.
  const panelTab: PanelTab = !mobile && tab === 'properties' ? 'add' : tab;

  return (
    <div className={`app app-${layout}`}>
      <header className="topbar">
        <div className="brand">
          {/* The full name clips on a phone, and a flex box cannot ellipsize. */}
          {mobile ? 'Watchface Builder' : 'Pebble Watchface Builder'}
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
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={toggleLayout}
          title={mobile ? 'Switch to the desktop layout' : 'Switch to the mobile layout'}
          aria-label={mobile ? 'Switch to the desktop layout' : 'Switch to the mobile layout'}
        >
          {LAYOUT_ICON[layout]}
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
          {mobile ? 'Export' : 'Export for CloudPebble'}
        </button>
      </header>

      {mobile ? (
        <div className="mobile-body">
          <Stage settings={settings} onSettings={onSettings} onSelectOnCanvas={onSelectOnCanvas} />
          <section className="panel mobile-panel">
            <PanelTabs tabs={MOBILE_TABS} active={panelTab} onPick={setTab} />
            <PanelBody tab={panelTab} />
          </section>
        </div>
      ) : (
        <div className="workspace">
          <aside className="panel panel-left">
            <PanelTabs tabs={DESKTOP_TABS} active={panelTab} onPick={setTab} />
            <PanelBody tab={panelTab} />
          </aside>

          <Stage settings={settings} onSettings={onSettings} />

          <aside className="panel panel-right">
            <div className="tabs">
              <span className="tab tab-static">Properties</span>
            </div>
            <Inspector />
          </aside>
        </div>
      )}

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

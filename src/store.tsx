/**
 * Application state: the project document, the selection, undo/redo history and
 * localStorage persistence.
 *
 * The document is treated as immutable - every mutation produces a new object -
 * which makes the history stack a plain array of previous documents.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  CustomFont,
  ImageAsset,
  PlatformId,
  PreviewState,
  WatchElement,
  WatchfaceProject,
} from './types';
import { createStarterProject } from './lib/defaults';
import { PLATFORMS, platformSpec, type PlatformSpec } from './lib/platform';
import { convertProjectToPlatform } from './lib/platformConvert';
import { clamp } from './lib/utils';

const STORAGE_KEY = 'pebble-watchface-builder/project/v1';
/** Do not bump before the 1.0 release; see WatchfaceProject.schemaVersion. */
const SCHEMA_VERSION = 1;
const HISTORY_LIMIT = 60;

export interface UpdateOptions {
  /** Push the pre-change document onto the undo stack. Defaults to true. */
  snapshot?: boolean;
}

export interface Store {
  project: WatchfaceProject;
  /** Hardware facts for the watch this project targets. */
  spec: PlatformSpec;
  /** True on a first visit with nothing saved, so the device picker opens. */
  needsDeviceChoice: boolean;
  selectedId: string | null;
  selected: WatchElement | null;
  preview: PreviewState;
  storageWarning: string | null;
  canUndo: boolean;
  canRedo: boolean;

  select(id: string | null): void;
  setPreview(patch: Partial<PreviewState>): void;
  update(fn: (project: WatchfaceProject) => WatchfaceProject, opts?: UpdateOptions): void;
  /** Throw the current design away and start a fresh one for `platform`. */
  startProject(platform: PlatformId): void;
  /** Keep the design but retarget it, snapping colors and positions to fit. */
  changeDevice(platform: PlatformId): void;
  /** Take a history snapshot now, before a burst of transient updates (a drag). */
  beginHistory(): void;
  replaceProject(project: WatchfaceProject): void;

  addElement(element: WatchElement): void;
  patchElement(id: string, patch: Partial<WatchElement>, opts?: UpdateOptions): void;
  removeElement(id: string): void;
  duplicateElement(id: string): void;
  moveElement(id: string, direction: 'up' | 'down' | 'top' | 'bottom'): void;
  /** Move an element to a gap in the list, indexed 0..length as it stands now. */
  moveElementToIndex(id: string, gapIndex: number): void;

  addFont(font: CustomFont): void;
  patchFont(id: string, patch: Partial<CustomFont>): void;
  removeFont(id: string): void;

  addImage(image: ImageAsset): void;
  patchImage(id: string, patch: Partial<ImageAsset>): void;
  removeImage(id: string): void;

  undo(): void;
  redo(): void;
}

const StoreContext = createContext<Store | null>(null);

/** A save off disk, before it has been checked. */
type SavedDoc = Omit<Partial<WatchfaceProject>, 'schemaVersion' | 'platform'> & {
  schemaVersion?: number;
  platform?: string;
};

/**
 * Reads a saved document, or returns null when it is not one we understand, so
 * the caller can fall back to the first-run flow.
 *
 * Only the current schema is accepted. Nothing has shipped, so there are no old
 * documents in the world to convert, and pretending to accept one would mean
 * silently dropping any element whose shape has since changed.
 */
export function readProject(raw: unknown): WatchfaceProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as SavedDoc;
  if (doc.schemaVersion !== SCHEMA_VERSION) return null;
  if (!Array.isArray(doc.elements)) return null;

  const platform: PlatformId =
    doc.platform && doc.platform in PLATFORMS ? (doc.platform as PlatformId) : 'emery';

  const starter = createStarterProject(platform);
  // options is a nested object, so a plain spread would drop any key the save
  // predates. Merging over the starter keeps every switch defined.
  return {
    ...starter,
    ...doc,
    platform,
    options: { ...starter.options, ...doc.options },
  } as WatchfaceProject;
}

interface InitialState {
  project: WatchfaceProject;
  /** False on a first visit, which is what opens the device picker. */
  restored: boolean;
}

function loadInitialProject(): InitialState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = readProject(JSON.parse(raw));
      if (saved) return { project: saved, restored: true };
    }
  } catch {
    // A corrupt save should never block the app; fall through to the starter.
  }
  return { project: createStarterProject('emery'), restored: false };
}

const defaultPreview = (): PreviewState => {
  const now = new Date();
  return {
    useLiveTime: true,
    hour: 10,
    minute: 9,
    second: 30,
    day: now.getDate(),
    month: now.getMonth(),
    year: now.getFullYear(),
    battery: 70,
    charging: false,
    bluetooth: true,
    steps: 8452,
    heartRate: 68,
    weatherCondition: 'partlyCloudy',
    weatherTempC: 18,
    weatherRainChance: 20,
    compassHeading: 45,
  };
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadInitialProject);
  const [project, setProjectState] = useState<WatchfaceProject>(initial.project);
  const [needsDeviceChoice, setNeedsDeviceChoice] = useState(!initial.restored);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreviewState] = useState<PreviewState>(defaultPreview);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const past = useRef<WatchfaceProject[]>([]);
  const future = useRef<WatchfaceProject[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  // Persist on idle so dragging does not thrash localStorage.
  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        setStorageWarning(null);
      } catch {
        setStorageWarning(
          'This project is too large to autosave in browser storage - usually a big font file. Download project.json to keep your work.',
        );
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [project]);

  // The latest document is mirrored into a ref so the mutators below can read
  // and write it outside of a state updater - updaters have to stay pure, and
  // the history stack is a side effect.
  const projectRef = useRef(project);
  projectRef.current = project;

  const commit = useCallback((next: WatchfaceProject) => {
    projectRef.current = next;
    setProjectState(next);
  }, []);

  const pushHistory = useCallback((snapshot: WatchfaceProject) => {
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), snapshot];
    future.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const update = useCallback<Store['update']>(
    (fn, opts) => {
      const current = projectRef.current;
      if (opts?.snapshot !== false) pushHistory(current);
      commit(fn(current));
    },
    [commit, pushHistory],
  );

  const beginHistory = useCallback(() => {
    pushHistory(projectRef.current);
  }, [pushHistory]);

  const replaceProject = useCallback<Store['replaceProject']>(
    (next) => {
      pushHistory(projectRef.current);
      commit(next);
      setSelectedId(null);
    },
    [commit, pushHistory],
  );

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, projectRef.current];
    setHistoryTick((t) => t + 1);
    commit(previous);
  }, [commit]);

  const redo = useCallback(() => {
    const next = future.current.at(-1);
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, projectRef.current];
    setHistoryTick((t) => t + 1);
    commit(next);
  }, [commit]);

  const store = useMemo<Store>(() => {
    const mapElements = (
      fn: (elements: WatchElement[]) => WatchElement[],
      opts?: UpdateOptions,
    ) => update((p) => ({ ...p, elements: fn(p.elements) }), opts);

    return {
      project,
      spec: platformSpec(project.platform),
      needsDeviceChoice,
      selectedId,
      selected: project.elements.find((el) => el.id === selectedId) ?? null,
      preview,
      storageWarning,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,

      select: setSelectedId,
      setPreview: (patch) => setPreviewState((p) => ({ ...p, ...patch })),
      update,
      beginHistory,
      replaceProject,

      startProject: (platform) => {
        replaceProject(createStarterProject(platform));
        setNeedsDeviceChoice(false);
      },

      changeDevice: (platform) => {
        if (platform === project.platform) return;
        update((p) => convertProjectToPlatform(p, platform));
      },

      addElement: (element) => {
        mapElements((els) => [...els, element]);
        setSelectedId(element.id);
      },

      patchElement: (id, patch, opts) =>
        mapElements(
          (els) => els.map((el) => (el.id === id ? ({ ...el, ...patch } as WatchElement) : el)),
          opts,
        ),

      removeElement: (id) => {
        mapElements((els) => els.filter((el) => el.id !== id));
        setSelectedId((current) => (current === id ? null : current));
      },

      duplicateElement: (id) => {
        const source = project.elements.find((el) => el.id === id);
        if (!source) return;
        const copy: WatchElement = {
          ...source,
          id: `${source.id}_c${Math.random().toString(36).slice(2, 6)}`,
          name: `${source.name} copy`,
          x: source.x + 4,
          y: source.y + 4,
        };
        mapElements((els) => [...els, copy]);
        setSelectedId(copy.id);
      },

      moveElement: (id, direction) =>
        mapElements((els) => {
          const index = els.findIndex((el) => el.id === id);
          if (index < 0) return els;
          const target =
            direction === 'up' ? index + 1
            : direction === 'down' ? index - 1
            : direction === 'top' ? els.length - 1
            : 0;
          if (target === index || target < 0 || target >= els.length) return els;
          const next = [...els];
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved!);
          return next;
        }),

      moveElementToIndex: (id, gapIndex) =>
        mapElements((els) => {
          const from = els.findIndex((el) => el.id === id);
          if (from < 0) return els;
          // The gap is measured against the list before the element is pulled
          // out, so every gap past it shifts down by one once it is removed.
          const target = clamp(Math.round(gapIndex), 0, els.length);
          const to = target > from ? target - 1 : target;
          if (to === from) return els;
          const next = [...els];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved!);
          return next;
        }),

      addFont: (font) => update((p) => ({ ...p, fonts: [...p.fonts, font] })),
      patchFont: (id, patch) =>
        update((p) => ({
          ...p,
          fonts: p.fonts.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),
      removeFont: (id) => update((p) => ({ ...p, fonts: p.fonts.filter((f) => f.id !== id) })),

      addImage: (image) => update((p) => ({ ...p, images: [...p.images, image] })),
      patchImage: (id, patch) =>
        update((p) => ({
          ...p,
          images: p.images.map((img) => (img.id === id ? { ...img, ...patch } : img)),
        })),
      removeImage: (id) => update((p) => ({ ...p, images: p.images.filter((i) => i.id !== id) })),

      undo,
      redo,
    };
    // historyTick is a dependency so canUndo/canRedo stay in sync with the refs.
  }, [project, needsDeviceChoice, selectedId, preview, storageWarning, historyTick, update, beginHistory, replaceProject, undo, redo]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

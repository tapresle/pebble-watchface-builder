/**
 * Application state: the project document, the selection, undo/redo history,
 * and localStorage persistence.
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
const SCHEMA_VERSION = 2;
/**
 * Versions this build can open. 2 added the optional groupId on elements, which
 * is purely additive - a 1 document has no groups, which reads identically to
 * every element being ungrouped - so opening one needs nothing but the new
 * stamp. Anything older than the oldest entry here is refused rather than
 * guessed at, which is what keeps a half-understood document from being
 * silently rewritten on the next autosave.
 */
const READABLE_VERSIONS = [1, 2];
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
  /** Every selected element, in the order they were added to the selection. */
  selectedIds: string[];
  selectedElements: WatchElement[];
  /**
   * The selected element when exactly one is - null for none and for several.
   * The inspector edits one element at a time, and the canvas only offers
   * resize handles when there is a single unambiguous target.
   */
  selected: WatchElement | null;
  preview: PreviewState;
  storageWarning: string | null;
  canUndo: boolean;
  canRedo: boolean;

  /**
   * Select an element, or pass null to clear. `additive` toggles it in and out
   * of the current selection instead of replacing it. Either way the selection
   * is widened to whole groups: picking one member picks its siblings, which is
   * what makes a group move as one.
   *
   * `solo` skips that widening and selects the one element even inside a group,
   * which is how a member gets edited on its own - otherwise a grouped element
   * could never be reached, since every route to it selects its siblings too.
   */
  select(id: string | null, opts?: { additive?: boolean; solo?: boolean }): void;
  /** Replace the selection outright, widened to whole groups as above. */
  setSelection(ids: string[]): void;
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
  /**
   * Apply a different patch to each of several elements in one update, so a
   * drag over a multiple selection is a single history entry and a single
   * render rather than one per element.
   */
  patchElements(
    updates: { id: string; patch: Partial<WatchElement> }[],
    opts?: UpdateOptions,
  ): void;
  removeElement(id: string): void;
  /** Delete everything selected. */
  removeSelection(): void;
  /** Put the whole selection in one group. Needs two or more selected. */
  groupSelection(): void;
  /** Dissolve the groups of everything selected. */
  ungroupSelection(): void;
  /** Whether the selection is groupable / ungroupable, for menus and buttons. */
  canGroup: boolean;
  canUngroup: boolean;
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
 * A group of one is the same thing as no group, and it is what a group is left
 * as once its other members are deleted. Dropping those keeps the rest of the
 * app from having to treat a lone "grouped" element as a special case.
 */
function dropLoneGroups(elements: WatchElement[]): WatchElement[] {
  const counts = new Map<string, number>();
  for (const el of elements) {
    if (el.groupId) counts.set(el.groupId, (counts.get(el.groupId) ?? 0) + 1);
  }
  if (![...counts.values()].some((n) => n < 2)) return elements;
  return elements.map((el) =>
    el.groupId && counts.get(el.groupId)! < 2 ? { ...el, groupId: undefined } : el,
  );
}

/**
 * Reads a saved document, or returns null when it is not one we understand, so
 * the caller can fall back to the first-run flow.
 *
 * Every version in READABLE_VERSIONS is accepted and comes back stamped as the
 * current one, so the next autosave writes the current format. There is no
 * per-version conversion step because the only change so far has been an
 * optional field; the day one is needed, it belongs here between the version
 * check and the merge below.
 */
export function readProject(raw: unknown): WatchfaceProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as SavedDoc;
  if (typeof doc.schemaVersion !== 'number') return null;
  if (!READABLE_VERSIONS.includes(doc.schemaVersion)) return null;
  if (!Array.isArray(doc.elements)) return null;

  const platform: PlatformId =
    doc.platform && doc.platform in PLATFORMS ? (doc.platform as PlatformId) : 'emery';

  const starter = createStarterProject(platform);
  // options is a nested object, so a plain spread would drop any key the save
  // predates. Merging over the starter keeps every switch defined.
  return {
    ...starter,
    ...doc,
    schemaVersion: SCHEMA_VERSION,
    platform,
    elements: dropLoneGroups(doc.elements as WatchElement[]),
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
      setSelectedIds([]);
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

  /**
   * Widen a set of ids to include every sibling of any group it touches. A
   * group is only ever selected whole, which is what lets the canvas treat the
   * selection as one thing to drag.
   */
  const widenToGroups = useCallback((ids: string[], elements: WatchElement[]): string[] => {
    const byId = new Map(elements.map((el) => [el.id, el]));
    const groups = new Set<string>();
    for (const id of ids) {
      const groupId = byId.get(id)?.groupId;
      if (groupId) groups.add(groupId);
    }
    if (groups.size === 0) return ids.filter((id) => byId.has(id));
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (id: string) => {
      if (!seen.has(id) && byId.has(id)) {
        seen.add(id);
        out.push(id);
      }
    };
    for (const id of ids) {
      add(id);
      const groupId = byId.get(id)?.groupId;
      if (groupId) for (const el of elements) if (el.groupId === groupId) add(el.id);
    }
    return out;
  }, []);

  const store = useMemo<Store>(() => {
    const elements = project.elements;
    const selectedElements = selectedIds
      .map((id) => elements.find((el) => el.id === id))
      .filter((el): el is WatchElement => el !== undefined);

    const mapElements = (
      fn: (elements: WatchElement[]) => WatchElement[],
      opts?: UpdateOptions,
    ) => update((p) => ({ ...p, elements: fn(p.elements) }), opts);

    return {
      project,
      spec: platformSpec(project.platform),
      needsDeviceChoice,
      selectedIds,
      selectedElements,
      selected: selectedElements.length === 1 ? selectedElements[0]! : null,
      preview,
      storageWarning,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,

      canGroup:
        selectedElements.length > 1 &&
        // Already one whole group and nothing else? Then there is nothing to do.
        !(
          selectedElements[0]!.groupId !== undefined &&
          selectedElements.every((el) => el.groupId === selectedElements[0]!.groupId)
        ),
      canUngroup: selectedElements.some((el) => el.groupId !== undefined),

      select: (id, opts) => {
        if (id === null) {
          setSelectedIds([]);
          return;
        }
        if (opts?.solo) {
          setSelectedIds(elements.some((el) => el.id === id) ? [id] : []);
          return;
        }
        setSelectedIds((current) => {
          if (!opts?.additive) return widenToGroups([id], elements);
          // Toggling a grouped element takes its siblings with it, in or out.
          const touched = new Set(widenToGroups([id], elements));
          const alreadyIn = current.includes(id);
          const next = alreadyIn ?
            current.filter((existing) => !touched.has(existing))
          : [...current, ...[...touched].filter((add) => !current.includes(add))];
          return widenToGroups(next, elements);
        });
      },
      setSelection: (ids) => setSelectedIds(widenToGroups(ids, elements)),
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
        setSelectedIds([element.id]);
      },

      patchElement: (id, patch, opts) =>
        mapElements(
          (els) => els.map((el) => (el.id === id ? ({ ...el, ...patch } as WatchElement) : el)),
          opts,
        ),

      patchElements: (updates, opts) => {
        if (updates.length === 0) return;
        const byId = new Map(updates.map((u) => [u.id, u.patch]));
        mapElements(
          (els) =>
            els.map((el) => {
              const patch = byId.get(el.id);
              return patch ? ({ ...el, ...patch } as WatchElement) : el;
            }),
          opts,
        );
      },

      removeElement: (id) => {
        mapElements((els) => dropLoneGroups(els.filter((el) => el.id !== id)));
        setSelectedIds((current) => current.filter((existing) => existing !== id));
      },

      removeSelection: () => {
        if (selectedIds.length === 0) return;
        const doomed = new Set(selectedIds);
        mapElements((els) => dropLoneGroups(els.filter((el) => !doomed.has(el.id))));
        setSelectedIds([]);
      },

      groupSelection: () => {
        if (selectedIds.length < 2) return;
        const groupId = `g_${Math.random().toString(36).slice(2, 8)}`;
        const members = new Set(selectedIds);
        mapElements((els) =>
          els.map((el) => (members.has(el.id) ? ({ ...el, groupId } as WatchElement) : el)),
        );
      },

      ungroupSelection: () => {
        // Dissolve whole groups, not just the members that happen to be
        // selected - the selection is always widened to whole groups anyway,
        // and a half-dissolved group is not a state worth being able to reach.
        const groups = new Set(
          selectedElements.map((el) => el.groupId).filter((id): id is string => id !== undefined),
        );
        if (groups.size === 0) return;
        mapElements((els) =>
          els.map((el) =>
            el.groupId && groups.has(el.groupId) ?
              ({ ...el, groupId: undefined } as WatchElement)
            : el,
          ),
        );
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
          // A copy stands on its own; joining the original's group would mean
          // duplicating one element silently enlarged the group.
          groupId: undefined,
        };
        mapElements((els) => [...els, copy]);
        setSelectedIds([copy.id]);
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
  }, [project, needsDeviceChoice, selectedIds, preview, storageWarning, historyTick, update, beginHistory, replaceProject, undo, redo, widenToGroups]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

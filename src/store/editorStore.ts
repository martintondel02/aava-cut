import { create } from 'zustand';
import { produce } from 'immer';
import type {
  Clip, ExportResult, ExportSettings, Keyframe, MediaAsset, PanelTab, Project, TextStyle, Track, TrackKind
} from '../types';
import { FALLBACK_ASSETS } from '../lib/fallbackAssets';
import { useSettingsStore } from './settingsStore';
import { migrateProject } from '../lib/migrate';
import { channelForClip, channelsForClip, effectChannelId, ensureEffectLayer, makeEffectLayer, valueAt } from '../lib/keyframes';
import {
  baseTextStyle, blankProject, clipDefaults, cloneProject, createMediaClip, createShapeClip, createStickerClip, createTextClip,
  defaultTrackFor, presetToClip, supportsTrack, trackForKind
} from '../lib/clips';
import { clamp, findFreeStart, projectDuration, uid } from '../lib/utils';

const STORAGE_KEY = 'lumacut.project.v1';
const HISTORY_LIMIT = 80;

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export interface ExportProgress {
  status: 'idle' | 'preparing' | 'recording' | 'finalizing' | 'done' | 'error';
  percent: number;
  message: string;
}

interface EditorState {
  project: Project | null;
  assets: MediaAsset[];
  assetsLoading: boolean;
  assetsError: string | null;
  uploading: boolean;
  uploadProgress: number;
  hydrated: boolean;
  lastSavedAt: string | null;
  selectedClipIds: string[];
  selectedKeyframe: { clipId: string; keyframeId: string } | null;
  selectedAssetId: string | null;
  activePanel: PanelTab;
  playhead: number;
  isPlaying: boolean;
  zoom: number;
  snapping: boolean;
  showSafeArea: boolean;
  showGrid: boolean;
  masterVolume: number;
  history: Project[];
  future: Project[];
  suspendHistory: boolean;
  clipboard: Clip | null;
  toasts: Toast[];
  exportOpen: boolean;
  exportSettings: ExportSettings;
  exportProgress: ExportProgress;
  exportResult: ExportResult | null;
  exportHistory: Array<{ filename: string; url: string; size: number; createdAt: string }>;
  leftPanelOpen: boolean;
  inspectorOpen: boolean;
  timelineHeight: number;

  bootstrap: () => Promise<void>;
  refreshAssets: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<MediaAsset[]>;
  removeAsset: (assetId: string) => Promise<void>;
  setSelectedAsset: (assetId: string | null) => void;

  setActivePanel: (panel: PanelTab) => void;
  setLeftPanelOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setTimelineHeight: (height: number) => void;
  setZoom: (zoom: number) => void;
  setSnapping: (snapping: boolean) => void;
  setShowSafeArea: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setMasterVolume: (volume: number) => void;

  selectClip: (clipId: string | null, additive?: boolean) => void;
  selectKeyframe: (clipId: string, keyframeId: string | null) => void;
  addKeyframeAt: (clipId: string, property: string, time: number) => void;
  setPlayhead: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlayback: () => void;

  mutateProject: (recipe: (project: Project) => void, history?: boolean) => void;
  checkpoint: () => void;
  beginEdit: () => void;
  endEdit: () => void;
  undo: () => void;
  redo: () => void;

  addAssetToTimeline: (assetId: string, at?: number, trackId?: string) => void;
  addText: (presetId: string, text?: string) => void;
  addClipsToTimeline: (clips: Clip[]) => void;
  addSticker: (sticker: string) => void;
  addShape: (shape: NonNullable<Clip['shape']>) => void;
  addCaption: (text: string, start?: number, duration?: number) => void;
  selectAllClips: () => void;
  setSelectedClipIds: (ids: string[]) => void;
  extractAudio: (clipId: string) => void;
  importCaptions: (entries: Array<{ start: number; end: number; text: string }>, replace?: boolean) => void;
  updateCaptionStyles: (patch: Partial<TextStyle>) => void;

  updateClip: (clipId: string, patch: Partial<Clip>, history?: boolean) => void;
  updateClipDeep: (clipId: string, recipe: (clip: Clip) => void, history?: boolean) => void;
  updateTextStyle: (clipId: string, patch: Partial<TextStyle>, history?: boolean) => void;
  toggleEffect: (clipId: string, effectId: string) => void;
  setFilter: (clipId: string, filter: string, intensity?: number) => void;
  setEffectIntensity: (clipId: string, effectType: string, value: number, history?: boolean) => void;
  addEffectFade: (clipId: string, effectType: string, direction: 'in' | 'out') => void;
  addClipFade: (clipId: string, kind: 'visual' | 'audio') => void;
  setTransition: (clipId: string, type: string, duration?: number) => void;
  addKeyframe: (clipId: string, property: string) => void;
  removeKeyframe: (clipId: string, keyframeId: string) => void;
  updateKeyframe: (clipId: string, keyframeId: string, patch: Partial<Keyframe>, history?: boolean) => void;

  splitSelected: (at?: number) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;

  updateTrack: (trackId: string, patch: Partial<Track>, history?: boolean) => void;
  addTrack: (kind: TrackKind) => void;
  removeTrack: (trackId: string) => void;
  reorderTrack: (sourceId: string, targetId: string, position: 'before' | 'after') => void;

  setProjectName: (name: string) => void;
  setAspect: (width: number, height: number) => void;
  setBackground: (color: string) => void;
  setFps: (fps: number) => void;
  newProject: () => void;
  importProject: (data: unknown) => void;
  exportProjectFile: () => void;
  saveProjectToServer: () => Promise<void>;

  addToast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;

  openExport: () => void;
  closeExport: () => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
  setExportProgress: (patch: Partial<ExportProgress>) => void;
  setExportResult: (result: ExportResult | null) => void;
  loadExportHistory: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function saveProjectLocally(project: Project) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  useEditorStore.setState({ lastSavedAt: new Date().toISOString() });
}

function scheduleSave(project: Project) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProjectLocally(project), 450);
}

function parseStoredProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Project;
    if (!data || !Array.isArray(data.clips) || !Array.isArray(data.tracks)) return null;
    return data;
  } catch {
    return null;
  }
}

function validateProject(data: unknown): Project {
  if (!data || typeof data !== 'object') throw new Error('This is not a LumaCut project file.');
  const project = data as Project;
  if (!Array.isArray(project.clips) || !Array.isArray(project.tracks)) throw new Error('The project file is missing its timeline.');
  if (!project.width || !project.height) throw new Error('The project file is missing its canvas size.');
  return {
    ...project,
    id: project.id || uid('project'),
    name: project.name || 'Imported project',
    fps: project.fps || 30,
    background: project.background || '#03070b',
    updatedAt: new Date().toISOString()
  };
}


function trackIsFree(project: Project, trackId: string, start: number, duration: number): boolean {
  return !project.clips.some((clip) =>
    clip.trackId === trackId &&
    start < clip.start + clip.duration - 0.02 &&
    start + duration > clip.start + 0.02
  );
}

function addTrackForKind(project: Project, kind: TrackKind): string {
  const count = project.tracks.filter((track) => track.kind === kind).length + 1;
  const id = uid('track');
  const track: Track = {
    id,
    name: kind === 'audio' ? `Audio ${count}` : kind === 'text' ? `Titles ${count}` : kind === 'overlay' ? `Overlay ${count}` : `Video ${count}`,
    kind,
    muted: false,
    hidden: false,
    locked: false,
    solo: false,
    gain: 1,
    eq: { low: 0, mid: 0, high: 0 }
  };
  if (kind === 'audio') project.tracks.push(track);
  else if (kind === 'video') {
    const audioIndex = project.tracks.findIndex((item) => item.kind === 'audio');
    project.tracks.splice(audioIndex === -1 ? project.tracks.length : audioIndex, 0, track);
  } else project.tracks.unshift(track);
  return id;
}

function findFreeTrack(project: Project, kind: TrackKind, start: number, duration: number, preferredId?: string): string {
  if (preferredId) {
    const preferred = project.tracks.find((track) => track.id === preferredId && track.kind === kind && !track.locked);
    if (preferred && trackIsFree(project, preferred.id, start, duration)) return preferred.id;
  }
  const existing = project.tracks.find((track) => track.kind === kind && !track.locked && trackIsFree(project, track.id, start, duration));
  if (existing) return existing.id;
  return addTrackForKind(project, kind);
}

function findClip(project: Project, clipId: string): Clip | undefined {
  return project.clips.find((clip) => clip.id === clipId);
}

function upsertKeyframe(clip: Clip, property: string, time: number, value: number, easing: Keyframe['easing']): void {
  const clampedTime = Math.max(0, Math.min(clip.duration, time));
  const existing = clip.keyframes.find((frame) => frame.property === property && Math.abs(frame.time - clampedTime) < 0.015);
  if (existing) {
    existing.value = value;
    existing.easing = easing;
  } else {
    clip.keyframes.push({ id: uid('kf'), property, time: clampedTime, value, easing });
  }
  clip.keyframes.sort((a, b) => a.time - b.time);
}

function fadeDuration(clip: Clip): number {
  return Math.max(0.1, Math.min(1.2, clip.duration * 0.4));
}

const AUTO_DIRECT_PROPERTIES = new Set(['x', 'y', 'scale', 'rotation', 'opacity', 'filterIntensity', 'volume']);

function autoKeyDirect(clip: Clip, playhead: number, keys: string[]): void {
  if (!useSettingsStore.getState().autoKeyframe) return;
  const local = playhead - clip.start;
  if (local <= 0.001 || local >= clip.duration) return;
  for (const key of keys) {
    if (!AUTO_DIRECT_PROPERTIES.has(key)) continue;
    const value = (clip as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number') upsertKeyframe(clip, key, local, value, 'easeInOut');
  }
}

function ensureCaptionTrack(project: Project): string {
  const existing = project.tracks.find((track) => track.id === 'track-captions' || /caption/i.test(track.name));
  if (existing) return existing.id;
  const track = { id: 'track-captions', name: 'Captions', kind: 'text' as const, muted: false, hidden: false, locked: false };
  const lastText = project.tracks.reduce((index, item, current) => item.kind === 'text' ? current : index, -1);
  project.tracks.splice(lastText + 1, 0, track);
  return 'track-captions';
}

function captionStyle(): Partial<TextStyle> {
  return {
    fontFamily: 'Open Sans',
    fontWeight: 600,
    fontSize: 48,
    color: '#ffffff',
    lineHeight: 1.25,
    letterSpacing: 0,
    shadow: true,
    background: '#05080c',
    backgroundOpacity: 0.58,
    paddingX: 26,
    paddingY: 14,
    radius: 10,
    align: 'center',
    maxWidth: 0.72,
    animation: 'none'
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  assets: [],
  assetsLoading: true,
  assetsError: null,
  uploading: false,
  uploadProgress: 0,
  hydrated: false,
  lastSavedAt: null,
  selectedClipIds: [],
  selectedKeyframe: null,
  selectedAssetId: null,
  activePanel: 'media',
  playhead: 0,
  isPlaying: false,
  zoom: 68,
  snapping: true,
  showSafeArea: false,
  showGrid: false,
  masterVolume: 0.8,
  history: [],
  future: [],
  suspendHistory: false,
  clipboard: null,
  toasts: [],
  exportOpen: false,
  exportSettings: { resolution: '1080p', fps: 30, format: 'mp4', quality: 'standard', hardwareAcceleration: true, codec: 'auto', bitDepth: 8, hdr: false, name: 'chase-the-light' },
  exportProgress: { status: 'idle', percent: 0, message: '' },
  exportResult: null,
  exportHistory: [],
  leftPanelOpen: true,
  inspectorOpen: true,
  timelineHeight: 324,

  bootstrap: async () => {
    let assets: MediaAsset[] = [];
    let error: string | null = null;
    try {
      const response = await fetch('/api/assets');
      if (!response.ok) throw new Error(`Media server returned ${response.status}`);
      const data = (await response.json()) as MediaAsset[];
      if (Array.isArray(data)) assets = data.filter((asset) => asset.source !== 'demo' && !asset.id.startsWith('demo-'));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const stored = parseStoredProject();
    let project = stored ? migrateProject(stored) : blankProject(assets);
    if (project.id === 'lumacut-demo-film' || project.name === 'Chase the Light') {
      project = blankProject(assets);
    } else if (project.clips.some((clip) => clip.assetId?.startsWith('demo-'))) {
      project.clips = project.clips.filter((clip) => !clip.assetId?.startsWith('demo-'));
    }
    set({
      assets,
      assetsError: error,
      assetsLoading: false,
      hydrated: true,
      project,
      lastSavedAt: stored ? new Date().toISOString() : null,
      selectedAssetId: assets[0]?.id || null,
      playhead: 0
    });
    scheduleSave(project);
    get().loadExportHistory();
  },

  refreshAssets: async () => {
    try {
      const response = await fetch('/api/assets');
      if (!response.ok) throw new Error(`Media server returned ${response.status}`);
      const assets = (await response.json()) as MediaAsset[];
      set({ assets, assetsError: null, assetsLoading: false });
    } catch (error) {
      set({ assetsError: error instanceof Error ? error.message : String(error), assetsLoading: false });
    }
  },

  uploadFiles: async (files: File[]) => {
    if (!files.length) return [];
    set({ uploading: true, uploadProgress: 0 });
    const form = new FormData();
    for (const file of files) form.append('files', file);
    try {
      const result = await new Promise<{ assets: MediaAsset[]; errors: Array<{ file: string; error: string }> }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/assets');
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) set({ uploadProgress: Math.round((event.loaded / event.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Could not reach the media server. Is it running?'));
        xhr.send(form);
      });
      set((state) => ({
        assets: [...result.assets, ...state.assets],
        uploading: false,
        uploadProgress: 100,
        selectedAssetId: result.assets[0]?.id || state.selectedAssetId
      }));
      if (result.assets.length) get().addToast(`Imported ${result.assets.length} file${result.assets.length === 1 ? '' : 's'}`, 'success');
      if (result.errors?.length) get().addToast(`${result.errors.length} file(s) could not be read`, 'error');
      return result.assets;
    } catch (error) {
      set({ uploading: false });
      get().addToast(error instanceof Error ? error.message : 'Upload failed', 'error');
      return [];
    }
  },

  removeAsset: async (assetId) => {
    const asset = get().assets.find((item) => item.id === assetId);
    if (!asset) return;
    try {
      await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
    } catch {
      // Keep the local library consistent even if the server is offline.
    }
    set((state) => ({
      assets: state.assets.filter((item) => item.id !== assetId),
      selectedAssetId: state.selectedAssetId === assetId ? null : state.selectedAssetId
    }));
    get().addToast(`Removed “${asset.name}” from the library`, 'info');
  },

  setSelectedAsset: (assetId) => set({ selectedAssetId: assetId }),
  setActivePanel: (panel) => set({ activePanel: panel, leftPanelOpen: true }),
  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setTimelineHeight: (height) => set({ timelineHeight: clamp(height, 220, 560) }),
  setZoom: (zoom) => set({ zoom: clamp(zoom, 12, 220) }),
  setSnapping: (snapping) => set({ snapping }),
  setShowSafeArea: (show) => set({ showSafeArea: show }),
  setShowGrid: (show) => set({ showGrid: show }),
  setMasterVolume: (volume) => set({ masterVolume: clamp(volume, 0, 10) }),

  selectClip: (clipId, additive = false) => {
    if (!clipId) {
      set({ selectedClipIds: [], selectedKeyframe: null });
      return;
    }
    set((state) => {
      if (!additive) return { selectedClipIds: [clipId], selectedKeyframe: state.selectedKeyframe?.clipId === clipId ? state.selectedKeyframe : null };
      const exists = state.selectedClipIds.includes(clipId);
      return { selectedClipIds: exists ? state.selectedClipIds.filter((id) => id !== clipId) : [...state.selectedClipIds, clipId] };
    });
    const clip = get().project ? findClip(get().project!, clipId) : null;
    if (clip?.assetId) set({ selectedAssetId: clip.assetId });
  },
  selectKeyframe: (clipId, keyframeId) => set({ selectedKeyframe: keyframeId ? { clipId, keyframeId } : null }),
  addKeyframeAt: (clipId, property, time) => {
    const project = get().project;
    const clip = project?.clips.find((item) => item.id === clipId);
    if (!project || !clip) return;
    const channel = channelForClip(clip, property);
    if (!channel) { get().addToast('That property cannot be keyframed yet', 'info'); return; }
    const local = clamp(time, 0, clip.duration);
    let createdId = '';
    get().mutateProject((draft) => {
      const target = findClip(draft, clipId);
      if (!target) return;
      const existing = target.keyframes.find((frame) => frame.property === property && Math.abs(frame.time - local) < 0.015);
      if (existing) {
        existing.value = valueAt(target, property, local, channel.get(target));
        createdId = existing.id;
      } else {
        const frame: Keyframe = {
          id: uid('kf'),
          property,
          time: local,
          value: valueAt(target, property, local, channel.get(target)),
          easing: 'easeInOut'
        };
        target.keyframes.push(frame);
        target.keyframes.sort((a, b) => a.time - b.time);
        createdId = frame.id;
      }
    });
    if (createdId) set({ selectedKeyframe: { clipId, keyframeId: createdId }, selectedClipIds: [clipId] });
  },

  setPlayhead: (time) => {
    const project = get().project;
    set({ playhead: clamp(time, 0, project ? projectDuration(project) : 0) });
  },
  setPlaying: (playing) => set({ isPlaying: playing }),
  togglePlayback: () => {
    const state = get();
    if (state.playhead >= (state.project ? projectDuration(state.project) : 0) - 0.03) set({ playhead: 0 });
    set({ isPlaying: !state.isPlaying });
  },

  mutateProject: (recipe, history = true) => {
    const state = get();
    if (!state.project) return;
    const snapshot = history && !state.suspendHistory ? cloneProject(state.project) : null;
    const next = produce(state.project, (draft) => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });
    set((current) => ({
      project: next,
      history: snapshot ? [...current.history.slice(-(HISTORY_LIMIT - 1)), snapshot] : current.history,
      future: snapshot ? [] : current.future
    }));
    scheduleSave(next);
  },

  checkpoint: () => {
    const project = get().project;
    if (!project) return;
    set((state) => ({
      history: [...state.history.slice(-(HISTORY_LIMIT - 1)), cloneProject(project)],
      future: []
    }));
  },
  beginEdit: () => {
    get().checkpoint();
    set({ suspendHistory: true });
  },
  endEdit: () => set({ suspendHistory: false }),

  undo: () => {
    const state = get();
    if (!state.history.length || !state.project) return;
    const previous = state.history[state.history.length - 1];
    set({
      project: previous,
      history: state.history.slice(0, -1),
      future: [cloneProject(state.project), ...state.future].slice(0, HISTORY_LIMIT),
      selectedClipIds: state.selectedClipIds.filter((id) => previous.clips.some((clip) => clip.id === id)),
      selectedKeyframe: null,
      playhead: clamp(state.playhead, 0, projectDuration(previous))
    });
    scheduleSave(previous);
  },
  redo: () => {
    const state = get();
    if (!state.future.length || !state.project) return;
    const next = state.future[0];
    set({
      project: next,
      future: state.future.slice(1),
      history: [...state.history, cloneProject(state.project)].slice(-HISTORY_LIMIT),
      selectedClipIds: state.selectedClipIds.filter((id) => next.clips.some((clip) => clip.id === id)),
      selectedKeyframe: null,
      playhead: clamp(state.playhead, 0, projectDuration(next))
    });
    scheduleSave(next);
  },

  addAssetToTimeline: (assetId, at, trackId) => {
    const state = get();
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset || !state.project) return;
    const preferredTrack = trackId || trackForKind(state.project, asset.kind);
    const naturalDuration = asset.kind === 'image' ? 5 : Math.min(asset.duration || 5, 12);
    const desiredStart = at ?? state.playhead;
    const clip = createMediaClip(asset, preferredTrack, desiredStart);
    get().mutateProject((project) => {
      if (asset.kind === 'audio') {
        const track = findFreeTrack(project, 'audio', desiredStart, naturalDuration, preferredTrack);
        clip.trackId = track;
        clip.start = Math.max(0, desiredStart);
      } else {
        clip.start = findFreeStart(project, clip.trackId, desiredStart, naturalDuration);
      }
      project.clips.push(clip);
    });
    set({ selectedClipIds: [clip.id], selectedAssetId: assetId });
    get().addToast(`Added “${asset.name}” to the timeline`, 'success');
  },

  addText: (presetId, text) => {
    const state = get();
    if (!state.project) return;
    const clip = presetToClip(presetId, state.playhead, text);
    clip.start = state.playhead;
    get().mutateProject((project) => {
      clip.trackId = findFreeTrack(project, 'text', clip.start, clip.duration, clip.trackId);
      project.clips.push(clip);
    });
    set({ selectedClipIds: [clip.id], activePanel: 'text' });
  },

  addClipsToTimeline: (clips) => {
    const state = get();
    if (!state.project || !clips.length) return;
    get().mutateProject((project) => {
      for (const clip of clips) {
        const kind: TrackKind = clip.kind === 'text' ? 'text' : clip.kind === 'audio' ? 'audio' : clip.kind === 'video' || clip.kind === 'image' ? 'video' : 'overlay';
        clip.trackId = findFreeTrack(project, kind, clip.start, clip.duration, clip.trackId);
        project.clips.push(clip);
      }
    });
    const earliest = Math.min(...clips.map((clip) => clip.start));
    set({ selectedClipIds: clips.map((clip) => clip.id), playhead: Math.max(0, earliest + 0.8) });
  },

  addSticker: (sticker) => {
    const state = get();
    if (!state.project) return;
    const clip = createStickerClip(sticker, state.playhead);
    clip.start = state.playhead;
    clip.x = state.project.width > state.project.height ? 0.52 : 0;
    clip.y = state.project.width > state.project.height ? -0.32 : -0.2;
    get().mutateProject((project) => {
      clip.trackId = findFreeTrack(project, 'overlay', clip.start, clip.duration, clip.trackId);
      project.clips.push(clip);
    });
    set({ selectedClipIds: [clip.id] });
  },

  addShape: (shape) => {
    const state = get();
    if (!state.project) return;
    const clip = createShapeClip(shape, state.playhead);
    clip.start = state.playhead;
    get().mutateProject((project) => {
      clip.trackId = findFreeTrack(project, 'overlay', clip.start, clip.duration, clip.trackId);
      project.clips.push(clip);
    });
    set({ selectedClipIds: [clip.id] });
  },

  addCaption: (text, start, duration = 3) => {
    const state = get();
    if (!state.project) return;
    const captionStart = start ?? state.playhead;
    get().mutateProject((project) => {
      const trackId = ensureCaptionTrack(project);
      const clip = createTextClip(text, captionStart, {
        trackId,
        duration,
        y: 0.37,
        x: 0,
        caption: true
      }, captionStyle());
      clip.start = findFreeStart(project, trackId, captionStart, duration);
      project.clips.push(clip);
    });
    set({ selectedClipIds: [], activePanel: 'captions' });
  },

  selectAllClips: () => {
    const project = get().project;
    if (!project) return;
    set({ selectedClipIds: project.clips.map((clip) => clip.id), selectedKeyframe: null });
  },

  setSelectedClipIds: (ids) => {
    const project = get().project;
    if (!project) return;
    const valid = ids.filter((id) => project.clips.some((clip) => clip.id === id));
    set({ selectedClipIds: valid, selectedKeyframe: null });
  },

  extractAudio: (clipId) => {
    const state = get();
    const project = state.project;
    const clip = project?.clips.find((item) => item.id === clipId);
    if (!project || !clip) return;
    if (clip.kind !== 'video' || !clip.assetId) {
      state.addToast('Select a video clip to extract audio', 'info');
      return;
    }
    const asset = state.assets.find((item) => item.id === clip.assetId);
    if (!asset || asset.hasAudio === false) {
      state.addToast('This video has no audio track', 'info');
      return;
    }
    let audioId = '';
    get().mutateProject((draft) => {
      const audioTracks = draft.tracks.filter((track) => track.kind === 'audio' && !track.locked);
      const bottom = audioTracks[audioTracks.length - 1];
      const trackId = bottom && trackIsFree(draft, bottom.id, clip.start, clip.duration)
        ? bottom.id
        : addTrackForKind(draft, 'audio');
      const audio = clipDefaults({
        ...clip,
        id: uid('clip'),
        kind: 'audio',
        trackId,
        name: `${clip.name} — audio`,
        effects: [],
        adjust: undefined,
        text: undefined,
        sticker: undefined,
        shape: undefined,
        shapeColor: undefined,
        transition: undefined,
        fadeIn: 0,
        fadeOut: 0,
        kenBurns: false,
        keyframes: clip.keyframes
          .filter((frame) => frame.property === 'volume')
          .map((frame) => ({ ...frame, id: uid('kf') }))
      });
      audioId = audio.id;
      draft.clips.push(audio);
    });
    if (audioId) {
      set({ selectedClipIds: [audioId], selectedKeyframe: null, activePanel: 'audio' });
      state.addToast('Audio extracted to a new bottom track', 'success');
    }
  },

  importCaptions: (entries, replace = false) => {
    if (!entries.length) return;
    get().mutateProject((project) => {
      if (replace) project.clips = project.clips.filter((clip) => !clip.caption);
      const trackId = ensureCaptionTrack(project);
      for (const entry of entries) {
        const duration = Math.max(0.4, entry.end - entry.start);
        const clip = createTextClip(entry.text.trim(), entry.start, {
          trackId,
          duration,
          y: 0.37,
          x: 0,
          caption: true
        }, captionStyle());
        project.clips.push(clip);
      }
    });
    get().addToast(`Added ${entries.length} caption${entries.length === 1 ? '' : 's'}`, 'success');
  },

  updateCaptionStyles: (patch) => {
    get().mutateProject((project) => {
      for (const clip of project.clips) {
        if (clip.caption && clip.text) clip.text = { ...clip.text, ...patch };
      }
    });
  },

  updateClip: (clipId, patch, history = true) => {
    const playhead = get().playhead;
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (!clip) return;
      Object.assign(clip, patch);
      autoKeyDirect(clip, playhead, Object.keys(patch));
      if (patch.adjust) {
        const local = playhead - clip.start;
        if (useSettingsStore.getState().autoKeyframe && local > 0.001 && local < clip.duration) {
          for (const [key, value] of Object.entries(patch.adjust)) {
            if (typeof value === 'number') upsertKeyframe(clip, `adjust.${key}`, local, value, 'easeInOut');
          }
        }
      }
    }, history);
  },
  updateClipDeep: (clipId, recipe, history = true) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (clip) recipe(clip);
    }, history);
  },
  updateTextStyle: (clipId, patch, history = true) => {
    const playhead = get().playhead;
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (!clip?.text) return;
      Object.assign(clip.text, patch);
      if (useSettingsStore.getState().autoKeyframe) {
        const local = playhead - clip.start;
        if (local > 0.001 && local < clip.duration) {
          const textChannels: Record<string, string> = {
            fontSize: 'text.fontSize',
            letterSpacing: 'text.letterSpacing',
            backgroundOpacity: 'text.backgroundOpacity'
          };
          for (const [key, value] of Object.entries(patch)) {
            const channel = textChannels[key];
            if (channel && typeof value === 'number') upsertKeyframe(clip, channel, local, value, 'easeInOut');
          }
        }
      }
    }, history);
  },
  toggleEffect: (clipId, effectId) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (!clip) return;
      const existing = clip.effects.find((effect) => effect.type === effectId);
      if (existing) {
        const channel = effectChannelId(existing);
        clip.effects = clip.effects.filter((effect) => effect.id !== existing.id);
        clip.keyframes = clip.keyframes.filter((frame) => frame.property !== channel);
      } else ensureEffectLayer(clip, effectId);
    });
  },
  setFilter: (clipId, filter, intensity) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (!clip) return;
      clip.filter = filter;
      if (typeof intensity === 'number') clip.filterIntensity = intensity;
    });
  },
  setEffectIntensity: (clipId, effectType, value, history = false) => {
    const playhead = get().playhead;
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      const effect = clip?.effects.find((layer) => layer.type === effectType);
      if (!clip || !effect) return;
      effect.intensity = clamp(value, 0, 100);
      if (useSettingsStore.getState().autoKeyframe) {
        const local = playhead - clip.start;
        if (local > 0.001 && local < clip.duration) upsertKeyframe(clip, effectChannelId(effect), local, effect.intensity, 'easeInOut');
      }
    }, history);
  },
  addEffectFade: (clipId, effectType, direction) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      const effect = clip?.effects.find((layer) => layer.type === effectType);
      if (!clip || !effect) return;
      const property = effectChannelId(effect);
      const hold = fadeDuration(clip);
      if (direction === 'in') {
        upsertKeyframe(clip, property, 0, 0, 'easeOut');
        upsertKeyframe(clip, property, hold, effect.intensity, 'easeInOut');
      } else {
        upsertKeyframe(clip, property, Math.max(0, clip.duration - hold), effect.intensity, 'easeInOut');
        upsertKeyframe(clip, property, clip.duration, 0, 'easeIn');
      }
    });
    get().addToast(direction === 'in' ? 'Effect fade-in added' : 'Effect fade-out added', 'success');
  },
  addClipFade: (clipId, kind) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (!clip) return;
      const property = kind === 'audio' ? 'volume' : 'opacity';
      const full = kind === 'audio' ? clip.volume : clip.opacity;
      const hold = fadeDuration(clip);
      upsertKeyframe(clip, property, 0, 0, 'easeOut');
      upsertKeyframe(clip, property, hold, full, 'easeInOut');
      upsertKeyframe(clip, property, Math.max(hold, clip.duration - hold), full, 'easeInOut');
      upsertKeyframe(clip, property, clip.duration, 0, 'easeIn');
    });
    get().addToast(kind === 'audio' ? 'Volume fade added' : 'Opacity fade added', 'success');
  },
  setTransition: (clipId, type, duration = 0.7) => {
    const project = get().project;
    const clip = project?.clips.find((item) => item.id === clipId);
    if (!project || !clip) return;
    const trackClips = project.clips.filter((item) => item.trackId === clip.trackId).sort((a, b) => a.start - b.start);
    if (trackClips[0]?.id === clip.id) {
      get().addToast('Add a clip before this one to use a transition', 'info');
      return;
    }
    get().updateClip(clipId, { transition: { type, duration } });
  },
  addKeyframe: (clipId, property) => {
    const state = get();
    const clip = state.project?.clips.find((item) => item.id === clipId);
    if (!clip) return;
    const time = state.playhead - clip.start;
    if (time < 0 || time > clip.duration) {
      get().addToast('Move the playhead over the clip to add a keyframe', 'info');
      return;
    }
    get().addKeyframeAt(clipId, property, time);
    get().addToast(`Keyframe added at ${time.toFixed(2)}s`, 'success');
  },
  removeKeyframe: (clipId, keyframeId) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      if (clip) clip.keyframes = clip.keyframes.filter((frame) => frame.id !== keyframeId);
    });
    set((current) => ({ selectedKeyframe: current.selectedKeyframe?.keyframeId === keyframeId ? null : current.selectedKeyframe }));
  },
  updateKeyframe: (clipId, keyframeId, patch, history = true) => {
    get().mutateProject((project) => {
      const clip = findClip(project, clipId);
      const frame = clip?.keyframes.find((item) => item.id === keyframeId);
      if (frame) {
        Object.assign(frame, patch);
        if (clip) {
          frame.time = Math.max(0, Math.min(clip.duration, frame.time));
          clip.keyframes.sort((a, b) => a.time - b.time);
        }
      }
    }, history);
  },

  splitSelected: (at) => {
    const state = get();
    if (!state.project) return;
    const time = at ?? state.playhead;
    const project = state.project;
    const selectedClips = project.clips.filter((clip) => state.selectedClipIds.includes(clip.id));
    let targets = selectedClips.filter((clip) => time > clip.start + 0.12 && time < clip.start + clip.duration - 0.12);
    if (!selectedClips.length) {
      targets = project.clips.filter((clip) => time > clip.start + 0.12 && time < clip.start + clip.duration - 0.12 && !project.tracks.find((track) => track.id === clip.trackId)?.locked);
    }
    if (!targets.length) {
      get().addToast('Move the playhead inside a clip to split it', 'info');
      return;
    }
    const newIds: string[] = [];
    get().mutateProject((draft) => {
      for (const target of targets) {
        const original = findClip(draft, target.id);
        if (!original) continue;
        const leftDuration = time - original.start;
        const right: Clip = cloneProject({ ...project, clips: [original], tracks: [], width: 1, height: 1, fps: 30, background: '', name: '', id: '', createdAt: '', updatedAt: '' }).clips[0];
        right.id = uid('clip');
        right.start = time;
        right.duration = original.duration - leftDuration;
        right.trimIn = original.trimIn + leftDuration * original.speed;
        right.transition = undefined;
        right.fadeIn = 0;
        right.keyframes = original.keyframes
          .filter((frame) => frame.time >= leftDuration)
          .map((frame) => ({ ...frame, id: uid('kf'), time: frame.time - leftDuration }));
        original.duration = leftDuration;
        original.fadeOut = 0;
        original.keyframes = original.keyframes.filter((frame) => frame.time < leftDuration);
        draft.clips.push(right);
        newIds.push(right.id);
      }
    });
    set({ selectedClipIds: newIds });
    get().addToast(`Split ${targets.length} clip${targets.length === 1 ? '' : 's'}`, 'success');
  },

  deleteSelected: () => {
    const state = get();
    if (!state.project || !state.selectedClipIds.length) return;
    const lockedTracks = new Set(state.project.tracks.filter((track) => track.locked).map((track) => track.id));
    const removable = state.selectedClipIds.filter((id) => {
      const clip = state.project!.clips.find((item) => item.id === id);
      return clip && !lockedTracks.has(clip.trackId);
    });
    if (!removable.length) {
      get().addToast('Those clips are on a locked track', 'info');
      return;
    }
    get().mutateProject((project) => {
      project.clips = project.clips.filter((clip) => !removable.includes(clip.id));
    });
    set((current) => ({ selectedClipIds: [], selectedKeyframe: current.selectedKeyframe && removable.includes(current.selectedKeyframe.clipId) ? null : current.selectedKeyframe }));
  },

  duplicateSelected: () => {
    const state = get();
    if (!state.project || !state.selectedClipIds.length) return;
    const copies: Clip[] = [];
    get().mutateProject((project) => {
      for (const id of state.selectedClipIds) {
        const source = findClip(project, id);
        if (!source) continue;
        const copy = cloneProject({ ...project, clips: [source], tracks: [], width: 1, height: 1, fps: 30, background: '', name: '', id: '', createdAt: '', updatedAt: '' }).clips[0];
        copy.id = uid('clip');
        copy.start = findFreeStart(project, source.trackId, source.start + source.duration, source.duration);
        project.clips.push(copy);
        copies.push(copy);
      }
    });
    set({ selectedClipIds: copies.map((clip) => clip.id) });
  },

  copySelected: () => {
    const state = get();
    const clip = state.project?.clips.find((item) => state.selectedClipIds.includes(item.id));
    if (clip) {
      set({ clipboard: cloneProject({ ...state.project!, clips: [clip], tracks: [], width: 1, height: 1, fps: 30, background: '', name: '', id: '', createdAt: '', updatedAt: '' }).clips[0] });
      get().addToast('Clip copied', 'info');
    }
  },
  paste: () => {
    const state = get();
    if (!state.clipboard || !state.project) return;
    const source = state.clipboard;
    const copy = cloneProject({ ...state.project, clips: [source], tracks: [], width: 1, height: 1, fps: 30, background: '', name: '', id: '', createdAt: '', updatedAt: '' }).clips[0];
    copy.id = uid('clip');
    copy.start = findFreeStart(state.project, source.trackId, state.playhead, source.duration);
    get().mutateProject((project) => { project.clips.push(copy); });
    set({ selectedClipIds: [copy.id] });
  },

  updateTrack: (trackId, patch, history = true) => {
    get().mutateProject((project) => {
      const track = project.tracks.find((item) => item.id === trackId);
      if (track) Object.assign(track, patch);
    }, history);
  },
  addTrack: (kind) => {
    const state = get();
    if (!state.project) return;
    const id = uid('track');
    const name = kind === 'audio'
      ? `Audio ${state.project.tracks.filter((track) => track.kind === 'audio').length + 1}`
      : kind === 'text'
        ? `Titles ${state.project.tracks.filter((track) => track.kind === 'text').length + 1}`
        : kind === 'overlay' ? `Overlay ${state.project.tracks.filter((track) => track.kind === 'overlay').length + 1}` : `Video ${state.project.tracks.filter((track) => track.kind === 'video').length + 1}`;
    get().mutateProject((project) => {
      const track: Track = { id, name, kind, muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: { low: 0, mid: 0, high: 0 } };
      if (kind === 'audio') project.tracks.push(track);
      else if (kind === 'video') {
        const audioIndex = project.tracks.findIndex((item) => item.kind === 'audio');
        project.tracks.splice(audioIndex === -1 ? project.tracks.length : audioIndex, 0, track);
      } else project.tracks.unshift(track);
    });
  },
  reorderTrack: (sourceId, targetId, position) => {
    if (sourceId === targetId) return;
    get().mutateProject((project) => {
      const from = project.tracks.findIndex((track) => track.id === sourceId);
      const target = project.tracks.findIndex((track) => track.id === targetId);
      if (from === -1 || target === -1) return;
      const [track] = project.tracks.splice(from, 1);
      let to = project.tracks.findIndex((item) => item.id === targetId);
      if (to === -1) to = project.tracks.length;
      if (position === 'after') to += 1;
      project.tracks.splice(to, 0, track);
    });
  },
  removeTrack: (trackId) => {
    const state = get();
    if (!state.project) return;
    const track = state.project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    if (state.project.tracks.filter((item) => item.kind === track.kind).length <= 1) {
      get().addToast('Keep at least one track of this type', 'info');
      return;
    }
    get().mutateProject((project) => {
      project.tracks = project.tracks.filter((item) => item.id !== trackId);
      project.clips = project.clips.filter((clip) => clip.trackId !== trackId);
    });
    set((current) => ({
      selectedClipIds: current.selectedClipIds.filter((id) => state.project!.clips.some((clip) => clip.id === id && clip.trackId !== trackId)),
      selectedKeyframe: current.selectedKeyframe?.clipId && state.project!.clips.some((clip) => clip.id === current.selectedKeyframe!.clipId && clip.trackId !== trackId) ? current.selectedKeyframe : null
    }));
  },

  setProjectName: (name) => {
    get().mutateProject((project) => { project.name = name.slice(0, 80) || 'Untitled project'; });
  },
  setAspect: (width, height) => {
    get().mutateProject((project) => { project.width = width; project.height = height; });
  },
  setBackground: (color) => {
    get().mutateProject((project) => { project.background = color; });
  },
  setFps: (fps) => {
    get().mutateProject((project) => { project.fps = clamp(fps, 12, 60); });
  },
  newProject: () => {
    const state = get();
    const project = blankProject(state.assets);
    set({ project, history: [], future: [], selectedClipIds: [], selectedKeyframe: null, playhead: 0, isPlaying: false, activePanel: 'media' });
    scheduleSave(project);
    get().addToast('New project created', 'success');
  },
  importProject: (data) => {
    try {
      const project = migrateProject(validateProject(data));
      get().checkpoint();
      set({ project, selectedClipIds: [], selectedKeyframe: null, playhead: 0, isPlaying: false });
      scheduleSave(project);
      get().addToast(`Opened “${project.name}”`, 'success');
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : 'Could not open project', 'error');
    }
  },
  exportProjectFile: () => {
    const project = get().project;
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'lumacut-project'}.lumacut`;
    a.click();
    URL.revokeObjectURL(url);
    get().addToast('Project file downloaded', 'success');
  },
  saveProjectToServer: async () => {
    const project = get().project;
    if (!project) return;
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      if (!response.ok) throw new Error('Server rejected the project');
      get().addToast('Project saved to disk', 'success');
    } catch {
      get().addToast('Could not save to disk — your browser copy is safe', 'error');
    }
  },

  addToast: (message, kind = 'info') => {
    const toast: Toast = { id: uid('toast'), message, kind };
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }));
    const timer = setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== toast.id) }));
      toastTimers.delete(toast.id);
    }, 3400);
    toastTimers.set(toast.id, timer);
  },
  dismissToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  openExport: () => set((state) => ({
    exportOpen: true,
    exportProgress: { status: 'idle', percent: 0, message: '' },
    exportResult: null,
    isPlaying: false,
    exportSettings: {
      ...state.exportSettings,
      ...useSettingsStore.getState().exportDefaults,
      name: (state.project?.name || 'lumacut-export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lumacut-export'
    }
  })),
  closeExport: () => set({ exportOpen: false }),
  setExportSettings: (patch) => set((state) => ({ exportSettings: { ...state.exportSettings, ...patch } })),
  setExportProgress: (patch) => set((state) => ({ exportProgress: { ...state.exportProgress, ...patch } })),
  setExportResult: (result) => set({ exportResult: result }),
  loadExportHistory: async () => {
    try {
      const response = await fetch('/api/exports');
      if (response.ok) set({ exportHistory: await response.json() });
    } catch {
      // ignore
    }
  }
}));

export const selectSelectedClip = (state: EditorState): Clip | null => {
  if (!state.project) return null;
  return state.project.clips.find((clip) => clip.id === state.selectedClipIds[0]) || null;
};

export const selectSelectedAsset = (state: EditorState): MediaAsset | null =>
  state.assets.find((asset) => asset.id === state.selectedAssetId) || null;

export { STORAGE_KEY, HISTORY_LIMIT };

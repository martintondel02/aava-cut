import { create } from 'zustand';
import type { TextStyle } from '../types';

export type ThemeMode = 'system' | 'dark' | 'light';
export type Accent = 'mint' | 'blue' | 'amber' | 'rose';
export type Density = 'comfortable' | 'compact';
export type PreviewQuality = 'auto' | 'full' | 'half';
export type VisualizerStyle = 'spectrum' | 'waveform' | 'radial';

export interface ExportDefaults {
  resolution: '720p' | '1080p' | '4k';
  fps: 24 | 30 | 60;
  format: 'mp4' | 'webm';
  quality: 'standard' | 'high';
  hardwareAcceleration: boolean;
  codec: 'auto' | 'h264' | 'hevc' | 'av1';
  bitDepth: 8 | 10;
  hdr: boolean;
}

export interface SettingsValues {
  theme: ThemeMode;
  accent: Accent;
  scale: number;
  density: Density;
  reduceMotion: boolean;
  previewQuality: PreviewQuality;
  visualizer: boolean;
  visualizerStyle: VisualizerStyle;
  loopPlayback: boolean;
  showWaveforms: boolean;
  followPlayhead: boolean;
  rippleDelete: boolean;
  captionAnimation: TextStyle['animation'];
  pixabayApiKey: string;
  leftPanelWidth: number;
  rightPanelWidth: number;
  agentBridgeEnabled: boolean;
  agentBridgeToken: string;
  autoExpandKeyframes: boolean;
  autoKeyframe: boolean;
  exportDefaults: ExportDefaults;
}

export interface SettingsState extends SettingsValues {
  open: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  update: (patch: Partial<SettingsValues>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  theme: 'system',
  accent: 'mint',
  scale: 100,
  density: 'comfortable',
  reduceMotion: false,
  previewQuality: 'auto',
  visualizer: true,
  visualizerStyle: 'spectrum',
  loopPlayback: false,
  showWaveforms: true,
  followPlayhead: true,
  rippleDelete: true,
  captionAnimation: 'pop',
  pixabayApiKey: '',
  leftPanelWidth: 340,
  rightPanelWidth: 340,
  agentBridgeEnabled: false,
  agentBridgeToken: '',
  autoExpandKeyframes: true,
  autoKeyframe: false,
  exportDefaults: { resolution: '1080p', fps: 30, format: 'mp4', quality: 'standard', hardwareAcceleration: true, codec: 'auto', bitDepth: 8, hdr: false }
};

const STORAGE_KEY = 'lumacut.settings.v1';

function readSettings(): SettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SettingsValues>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      scale: Math.min(140, Math.max(80, Number(parsed.scale) || DEFAULT_SETTINGS.scale)),
      leftPanelWidth: Math.min(640, Math.max(260, Number(parsed.leftPanelWidth) || DEFAULT_SETTINGS.leftPanelWidth)),
      rightPanelWidth: Math.min(640, Math.max(280, Number(parsed.rightPanelWidth) || DEFAULT_SETTINGS.rightPanelWidth)),
      exportDefaults: { ...DEFAULT_SETTINGS.exportDefaults, ...(parsed.exportDefaults || {}) }
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(values: SettingsValues) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Private browsing or quota errors should never break the editor.
  }
}

function valuesOf(state: SettingsState): SettingsValues {
  return {
    theme: state.theme,
    accent: state.accent,
    scale: state.scale,
    density: state.density,
    reduceMotion: state.reduceMotion,
    previewQuality: state.previewQuality,
    visualizer: state.visualizer,
    visualizerStyle: state.visualizerStyle,
    loopPlayback: state.loopPlayback,
    showWaveforms: state.showWaveforms,
    followPlayhead: state.followPlayhead,
    rippleDelete: state.rippleDelete,
    captionAnimation: state.captionAnimation,
    pixabayApiKey: state.pixabayApiKey,
    leftPanelWidth: state.leftPanelWidth,
    rightPanelWidth: state.rightPanelWidth,
    agentBridgeEnabled: state.agentBridgeEnabled,
    agentBridgeToken: state.agentBridgeToken,
    autoExpandKeyframes: state.autoExpandKeyframes,
    autoKeyframe: state.autoKeyframe,
    exportDefaults: state.exportDefaults
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...readSettings(),
  open: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
  update: (patch) => {
    set((state) => {
      const next = {
        ...valuesOf(state),
        ...patch,
        scale: patch.scale !== undefined ? Math.min(140, Math.max(80, patch.scale)) : state.scale,
        exportDefaults: { ...state.exportDefaults, ...(patch.exportDefaults || {}) }
      };
      persist(next);
      return next;
    });
  },
  reset: () => {
    persist(DEFAULT_SETTINGS);
    set(DEFAULT_SETTINGS);
  }
}));

export function resolvedTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyAppearance(values: SettingsValues) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(values.theme);
  root.dataset.themeMode = values.theme;
  root.dataset.accent = values.accent;
  root.dataset.density = values.density;
  root.dataset.reduceMotion = String(values.reduceMotion);
  root.dataset.scale = values.scale >= 130 ? 'large' : values.scale >= 115 ? 'medium' : 'normal';
  root.style.setProperty('--ui-scale', String(values.scale / 100));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', root.dataset.theme === 'light' ? '#f4f7f5' : '#080a0d');
}

export { STORAGE_KEY as SETTINGS_STORAGE_KEY };

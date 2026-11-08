import type { Clip, MediaAsset, Project, TextStyle, Track } from '../types';
import { TEXT_PRESETS } from '../types';
import { uid } from './utils';

export function baseTextStyle(overrides: Partial<TextStyle> = {}): TextStyle {
  return {
    content: 'Your text here',
    fontFamily: 'Montserrat',
    fontSize: 84,
    fontWeight: 700,
    color: '#ffffff',
    highlightColor: '#72f5d1',
    align: 'center',
    lineHeight: 1.12,
    letterSpacing: 0,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: true,
    background: '#000000',
    backgroundOpacity: 0,
    paddingX: 26,
    paddingY: 16,
    radius: 12,
    uppercase: false,
    italic: false,
    animation: 'none',
    maxWidth: 0.82,
    ...overrides
  };
}

export function clipDefaults(overrides: Partial<Clip>): Clip {
  return {
    id: uid('clip'),
    trackId: 'track-main',
    kind: 'video',
    name: 'Clip',
    start: 0,
    duration: 5,
    trimIn: 0,
    speed: 1,
    volume: 1,
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    blend: 'source-over',
    filter: 'none',
    filterIntensity: 65,
    effects: [],
    adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 },
    kenBurns: false,
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    keyframes: [],
    ...overrides
  };
}

export function createMediaClip(asset: MediaAsset, trackId: string, start: number, overrides: Partial<Clip> = {}): Clip {
  const isAudio = asset.kind === 'audio';
  const natural = asset.kind === 'image' ? 5 : (asset.duration || 5);
  return clipDefaults({
    kind: asset.kind,
    trackId,
    name: asset.name,
    assetId: asset.id,
    start: Math.max(0, start),
    duration: Math.max(0.25, natural),
    trimIn: 0,
    volume: isAudio ? 0.75 : 0.65,
    audioFadeIn: isAudio ? 0.2 : 0,
    audioFadeOut: isAudio ? 0.4 : 0,
    kenBurns: asset.kind === 'image',
    ...overrides
  });
}

export function createTextClip(
  text: string,
  start: number,
  overrides: Partial<Clip> = {},
  style: Partial<TextStyle> = {}
): Clip {
  return clipDefaults({
    kind: 'text',
    trackId: 'track-text',
    name: text.replace(/\n/g, ' ').slice(0, 40),
    start,
    duration: 4,
    text: baseTextStyle({ content: text, ...style }),
    ...overrides
  });
}

export function presetToClip(presetId: string, start: number, text?: string): Clip {
  const preset = TEXT_PRESETS.find((item) => item.id === presetId) || TEXT_PRESETS[0];
  return createTextClip(text || preset.sample, start, {
    name: preset.name,
    duration: 4,
    x: 0,
    y: 0
  }, {
    ...preset.style,
    content: text || preset.sample,
    fontFamily: preset.style.fontFamily,
    fontWeight: preset.style.fontWeight,
    fontSize: preset.style.fontSize,
    color: preset.style.color,
    highlightColor: preset.style.highlightColor,
    letterSpacing: preset.style.letterSpacing,
    lineHeight: preset.style.lineHeight,
    align: preset.style.align,
    strokeWidth: preset.style.strokeWidth,
    shadow: preset.style.shadow,
    uppercase: preset.style.uppercase,
    backgroundOpacity: preset.style.backgroundOpacity,
    ...(preset.style.background ? { background: preset.style.background } : {})
  });
}

export function createStickerClip(sticker: string, start: number, overrides: Partial<Clip> = {}): Clip {
  return clipDefaults({
    kind: 'sticker',
    trackId: 'track-overlay',
    name: `Sticker ${sticker}`,
    sticker,
    start,
    duration: 4,
    x: 0.55,
    y: -0.34,
    scale: 0.55,
    ...overrides
  });
}

export function createShapeClip(shape: NonNullable<Clip['shape']>, start: number, overrides: Partial<Clip> = {}): Clip {
  return clipDefaults({
    kind: 'shape',
    trackId: 'track-overlay',
    name: `${shape[0].toUpperCase()}${shape.slice(1)}`,
    shape,
    shapeColor: '#72f5d1',
    start,
    duration: 4,
    x: 0,
    y: 0,
    scale: 0.5,
    ...overrides
  });
}

export function makeTracks(): Track[] {
  const eq = () => ({ low: 0, mid: 0, high: 0 });
  return [
    { id: 'track-text', name: 'Titles', kind: 'text', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: eq() },
    { id: 'track-overlay', name: 'Overlay', kind: 'overlay', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: eq() },
    { id: 'track-main', name: 'Main Track', kind: 'video', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: eq() },
    { id: 'track-audio', name: 'Soundtrack', kind: 'audio', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: eq() },
    { id: 'track-sfx', name: 'Sound FX', kind: 'audio', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: eq() }
  ];
}

export function blankProject(assets: MediaAsset[]): Project {
  const now = new Date().toISOString();
  return {
    id: uid('project'),
    version: 2,
    name: 'Untitled project',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#03070b',
    masterEq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    tracks: makeTracks(),
    clips: [],
    createdAt: now,
    updatedAt: now
  };
}

export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

export function isMissingAsset(project: Project, assets: MediaAsset[]): string[] {
  const ids = new Set(assets.map((asset) => asset.id));
  return Array.from(new Set(project.clips.filter((clip) => clip.assetId && !ids.has(clip.assetId)).map((clip) => clip.assetId!)));
}

export function supportsTrack(track: Track, kind: Clip['kind']): boolean {
  if (track.kind === 'audio') return kind === 'audio';
  if (track.kind === 'video') return kind === 'video' || kind === 'image';
  if (track.kind === 'text') return kind === 'text' || kind === 'sticker' || kind === 'shape';
  return kind !== 'audio';
}

export function defaultTrackFor(project: Project, kind: Clip['kind']): string {
  if (kind === 'audio') return project.tracks.find((track) => track.kind === 'audio')?.id || 'track-audio';
  if (kind === 'text') return project.tracks.find((track) => track.kind === 'text')?.id || 'track-text';
  if (kind === 'sticker' || kind === 'shape') return project.tracks.find((track) => track.kind === 'overlay')?.id || 'track-overlay';
  return project.tracks.find((track) => track.kind === 'video')?.id || 'track-main';
}

export function trackForKind(project: Project, kind: Clip['kind'], preferred?: string): string {
  if (preferred) {
    const track = project.tracks.find((item) => item.id === preferred);
    if (track && supportsTrack(track, kind)) return track.id;
  }
  return defaultTrackFor(project, kind);
}

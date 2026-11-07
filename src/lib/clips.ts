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
  const natural = isAudio ? asset.duration || 5 : asset.kind === 'image' ? 5 : Math.min(asset.duration || 5, 12);
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
  return [
    { id: 'track-text', name: 'Titles', kind: 'text', muted: false, hidden: false, locked: false },
    { id: 'track-overlay', name: 'Overlay', kind: 'overlay', muted: false, hidden: false, locked: false },
    { id: 'track-main', name: 'Main Track', kind: 'video', muted: false, hidden: false, locked: false },
    { id: 'track-audio', name: 'Soundtrack', kind: 'audio', muted: false, hidden: false, locked: false },
    { id: 'track-sfx', name: 'Sound FX', kind: 'audio', muted: false, hidden: false, locked: false }
  ];
}

export function seedProject(assets: MediaAsset[]): Project {
  const now = new Date().toISOString();
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const has = (id: string) => byId.has(id);
  const clips: Clip[] = [];

  const mainScenes = [
    { asset: 'demo-aurora', start: 0, duration: 7, filter: 'cinematic', filterIntensity: 75, effects: ['grain'] },
    { asset: 'demo-sunset', start: 7, duration: 7, filter: 'warm', filterIntensity: 65, effects: ['light-leak'], transition: { type: 'fade', duration: 0.8 } },
    { asset: 'demo-coast', start: 14, duration: 7, filter: 'cool', filterIntensity: 60, effects: ['bokeh'], transition: { type: 'fade', duration: 0.7 } },
    { asset: 'demo-neon', start: 21, duration: 7, filter: 'vivid', filterIntensity: 55, effects: ['grain'], transition: { type: 'zoom', duration: 0.8 } }
  ];

  for (const scene of mainScenes) {
    const asset = byId.get(scene.asset);
    if (!asset) continue;
    clips.push(createMediaClip(asset, 'track-main', scene.start, {
      duration: scene.duration,
      filter: scene.filter,
      filterIntensity: scene.filterIntensity,
      effects: scene.effects,
      transition: scene.transition,
      volume: 0.25
    }));
  }

  // Opening typography
  clips.push(createTextClip('A LUMACUT FILM', 0.9, {
    trackId: 'track-overlay',
    duration: 3.3,
    x: 0,
    y: -0.37,
    animationIn: { type: 'fade', duration: 0.7 },
    animationOut: { type: 'fade', duration: 0.6 }
  }, {
    fontFamily: 'Montserrat',
    fontWeight: 600,
    fontSize: 30,
    letterSpacing: 8,
    uppercase: true,
    color: '#d9fff4',
    shadow: false,
    maxWidth: 0.7
  }));

  clips.push(createTextClip('CHASE\nTHE LIGHT', 1.65, {
    duration: 4.65,
    x: 0,
    y: 0.015,
    animationIn: { type: 'zoom', duration: 1.1 },
    animationOut: { type: 'fade', duration: 0.7 }
  }, {
    fontFamily: 'Montserrat',
    fontWeight: 900,
    fontSize: 154,
    letterSpacing: -3,
    lineHeight: 0.9,
    uppercase: true,
    color: '#ffffff',
    shadow: true,
    maxWidth: 0.8
  }));

  clips.push(createTextClip('Golden hour,\nslowed down.', 8.15, {
    duration: 4.6,
    x: -0.03,
    y: 0.03,
    animationIn: { type: 'fade', duration: 0.9 },
    animationOut: { type: 'fade', duration: 0.8 }
  }, {
    fontFamily: 'Luma Serif',
    fontWeight: 400,
    fontSize: 92,
    lineHeight: 1.02,
    color: '#fff8eb',
    shadow: true,
    maxWidth: 0.8
  }));

  const pip = byId.get('demo-portrait');
  if (pip) {
    clips.push(createMediaClip(pip, 'track-overlay', 9.1, {
      duration: 3.7,
      x: 0.61,
      y: 0.03,
      scale: 0.34,
      rotation: -2.5,
      filter: 'warm',
      filterIntensity: 40,
      opacity: 1,
      kenBurns: true,
      animationIn: { type: 'slide-left', duration: 0.65 },
      animationOut: { type: 'fade', duration: 0.5 }
    }));
  }

  clips.push(createStickerClip('✦', 7.15, {
    duration: 1.8,
    x: 0.62,
    y: -0.37,
    scale: 0.75,
    opacity: 0.9,
    animationIn: { type: 'zoom', duration: 0.6 },
    animationOut: { type: 'fade', duration: 0.35 }
  }));

  clips.push(createTextClip('breathe in.\nbreathe out.', 15.0, {
    duration: 4.8,
    x: -0.12,
    y: 0.26,
    animationIn: { type: 'slide-up', duration: 0.8 },
    animationOut: { type: 'fade', duration: 0.7 }
  }, {
    fontFamily: 'Open Sans',
    fontWeight: 600,
    fontSize: 57,
    lineHeight: 1.18,
    color: '#ffffff',
    align: 'left',
    shadow: true,
    maxWidth: 0.55
  }));

  clips.push(createTextClip('CITY\nAFTERGLOW', 21.75, {
    duration: 3.7,
    x: 0,
    y: 0.0,
    animationIn: { type: 'zoom', duration: 0.8 },
    animationOut: { type: 'fade', duration: 0.55 }
  }, {
    fontFamily: 'Montserrat',
    fontWeight: 900,
    fontSize: 132,
    letterSpacing: 9,
    lineHeight: 0.91,
    uppercase: true,
    color: '#ffffff',
    shadow: true,
    maxWidth: 0.82
  }));

  clips.push(createTextClip('make something\nworth watching', 25.65, {
    duration: 2.1,
    x: 0,
    y: 0.03,
    animationIn: { type: 'fade', duration: 0.5 },
    animationOut: { type: 'fade', duration: 0.3 }
  }, {
    fontFamily: 'Luma Serif',
    fontWeight: 400,
    fontSize: 68,
    lineHeight: 1.05,
    color: '#fff4e2',
    shadow: true,
    maxWidth: 0.68
  }));

  // Original score + transition sound design
  const ambient = byId.get('demo-ambient');
  if (ambient) {
    clips.push(createMediaClip(ambient, 'track-audio', 0, {
      duration: 28,
      volume: 0.34,
      audioFadeIn: 1.4,
      audioFadeOut: 2.6,
      name: 'Slow Orbit — LumaCut Score'
    }));
  }
  const whoosh = byId.get('demo-whoosh');
  if (whoosh) {
    [6.3, 13.3, 20.3].forEach((start, index) => {
      clips.push(createMediaClip(whoosh, 'track-sfx', start, {
        duration: 1.4,
        volume: 0.52,
        audioFadeIn: 0.08,
        audioFadeOut: 0.25,
        name: `Air Whoosh ${index + 1}`
      }));
    });
  }
  const riser = byId.get('demo-riser');
  if (riser) {
    clips.push(createMediaClip(riser, 'track-sfx', 24.2, {
      duration: 3,
      volume: 0.35,
      audioFadeIn: 0.2,
      audioFadeOut: 0.4,
      name: 'Night Riser'
    }));
  }

  return {
    id: 'lumacut-demo-film',
    name: 'Chase the Light',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#03070b',
    tracks: makeTracks(),
    clips,
    createdAt: now,
    updatedAt: now
  };
}

export function blankProject(assets: MediaAsset[]): Project {
  const now = new Date().toISOString();
  return {
    id: uid('project'),
    name: 'Untitled project',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#03070b',
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

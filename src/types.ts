export type AssetKind = 'video' | 'image' | 'audio';
export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'sticker' | 'shape';
export type TrackKind = 'video' | 'overlay' | 'text' | 'audio';
export type PanelTab = 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'filters' | 'captions' | 'templates';
export type BlendMode = 'source-over' | 'screen' | 'multiply' | 'overlay' | 'soft-light' | 'lighten' | 'darken' | 'color-dodge';
export type EasingId = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'springSoft' | 'springSnappy' | 'bounce';

export interface EffectLayer {
  id: string;
  type: string;
  enabled: boolean;
  intensity: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  source: 'demo' | 'upload';
  url: string;
  thumbnail: string | null;
  duration: number;
  width: number;
  height: number;
  hasAudio?: boolean;
  size?: number;
  createdAt?: string;
  peaks?: number[];
  analysis?: {
    sceneCuts: number[];
    silences: Array<[number, number]>;
    loudness?: { meanDb: number; peakDb: number };
    blankSpans: Array<[number, number]>;
    staticSpans: Array<[number, number]>;
    screenRecording: boolean;
    contentBox?: { x: number; y: number; width: number; height: number } | null;
    computedAt: string;
  };
  folder?: string;
}

export interface Keyframe {
  id: string;
  property: string;
  time: number;
  value: number;
  easing: EasingId;
}

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  highlightColor: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  background: string;
  backgroundOpacity: number;
  paddingX: number;
  paddingY: number;
  radius: number;
  uppercase: boolean;
  italic: boolean;
  animation: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'zoom' | 'typewriter';
  maxWidth: number;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  assetId?: string;
  start: number;
  duration: number;
  trimIn: number;
  speed: number;
  volume: number;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  crop?: { x: number; y: number; width: number; height: number };
  flipH?: boolean;
  flipV?: boolean;
  blend: BlendMode;
  filter: string;
  filterIntensity: number;
  effects: EffectLayer[];
  adjust?: { brightness: number; contrast: number; saturation: number; temperature: number; hue: number };
  kenBurns?: boolean;
  fadeIn: number;
  fadeOut: number;
  audioFadeIn: number;
  audioFadeOut: number;
  animationIn?: { type: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom' | 'spin'; duration: number };
  animationOut?: { type: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom' | 'spin'; duration: number };
  transition?: { type: string; duration: number };
  text?: TextStyle;
  sticker?: string;
  shape?: 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'arrow' | 'sparkle';
  shapeColor?: string;
  keyframes: Keyframe[];
  locked?: boolean;
  caption?: boolean;
}

export interface TrackEq {
  low: number;
  mid: number;
  high: number;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  solo?: boolean;
  gain?: number;
  eq?: TrackEq;
  color?: string;
}

export interface Project {
  id: string;
  version: number;
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  masterEq?: number[];
  tracks: Track[];
  clips: Clip[];
  createdAt: string;
  updatedAt: string;
}

export type ExportCodec = 'auto' | 'h264' | 'hevc' | 'av1';

export interface ExportSettings {
  resolution: '1080p' | '720p' | '4k';
  fps: 24 | 30 | 60;
  format: 'mp4' | 'webm';
  quality: 'standard' | 'high';
  hardwareAcceleration: boolean;
  codec: ExportCodec;
  bitDepth: 8 | 10;
  hdr: boolean;
  name: string;
}

export type HardwareCodec = 'h264' | 'hevc' | 'av1' | 'vp9';

export interface HardwareEncoderInfo {
  codec: HardwareCodec;
  encoder: string;
  label: string;
  backend: 'vaapi' | 'amf' | 'vulkan';
  renderNode?: string;
  profile?: string[];
  tenBit?: boolean;
}

export interface CodecCapability {
  codec: 'h264' | 'hevc' | 'av1' | 'vp9';
  label: string;
  formats: Array<'mp4' | 'webm'>;
  maxBitDepth: 8 | 10;
  hdr: boolean;
  software: string | null;
  hardware: HardwareEncoderInfo | null;
}

export interface HardwareCapabilities {
  detected: boolean;
  vendor: string | null;
  gpuNames: string[];
  backend: string;
  renderNodes: string[];
  encoders: HardwareEncoderInfo[];
  preferredFor: { mp4: HardwareEncoderInfo | null; webm: HardwareEncoderInfo | null };
  preferred: HardwareEncoderInfo | null;
  probedAt: string;
}

export interface ServerCapabilities {
  version: string;
  hardware: HardwareCapabilities;
  software: { h264: string; hevc: string | null; av1: string | null; vp9: string };
  codecs: Record<'h264' | 'hevc' | 'av1', CodecCapability>;
}

export interface ExportResult {
  url: string;
  filename: string;
  path: string;
  size: number;
  format: string;
  hardware?: boolean;
  codec?: string;
  encoder?: string;
  bitDepth?: number;
  hdr?: boolean;
  acceleration?: string;
}

export const ASPECT_PRESETS = [
  { id: '16:9', label: 'Landscape', width: 1920, height: 1080, icon: '▭' },
  { id: '9:16', label: 'Portrait', width: 1080, height: 1920, icon: '▯' },
  { id: '1:1', label: 'Square', width: 1080, height: 1080, icon: '□' },
  { id: '4:5', label: 'Social', width: 1080, height: 1350, icon: '▯' },
  { id: '21:9', label: 'Cinema', width: 2560, height: 1080, icon: '▬' }
] as const;

export const FONT_OPTIONS = [
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Open Sans', value: 'Open Sans' },
  { label: 'Luma Serif', value: 'Luma Serif' },
  { label: 'Liberation Sans', value: 'Liberation Sans' },
  { label: 'DejaVu Sans', value: 'DejaVu Sans' },
  { label: 'Monospace', value: 'DejaVu Sans Mono' }
];

export const FILTERS = [
  { id: 'none', name: 'Original', css: '', tint: '' },
  { id: 'cinematic', name: 'Cinematic', css: 'contrast(1.12) saturate(0.86) brightness(0.96)', tint: 'rgba(14,28,46,.14)' },
  { id: 'warm', name: 'Golden', css: 'sepia(.18) saturate(1.22) contrast(1.04) brightness(1.03)', tint: 'rgba(255,154,68,.08)' },
  { id: 'cool', name: 'Arctic', css: 'saturate(.92) contrast(1.06) hue-rotate(8deg) brightness(1.02)', tint: 'rgba(62,150,255,.12)' },
  { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.12) brightness(1.02)', tint: '' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.42) saturate(.82) contrast(.94) brightness(1.04)', tint: 'rgba(255,196,128,.08)' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.55) contrast(1.1)', tint: '' },
  { id: 'soft', name: 'Soft', css: 'saturate(1.04) contrast(.92) brightness(1.06) blur(.3px)', tint: 'rgba(255,235,220,.05)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.45) brightness(.9)', tint: '' },
  { id: 'dream', name: 'Dream', css: 'saturate(1.15) contrast(.86) brightness(1.08) blur(.6px)', tint: 'rgba(255,160,210,.1)' }
];

export const EFFECTS = [
  { id: 'grain', name: 'Film Grain', accent: '#f2c78f' },
  { id: 'light-leak', name: 'Light Leak', accent: '#ff8b5d' },
  { id: 'sparkles', name: 'Sparkles', accent: '#ffe8a3' },
  { id: 'snow', name: 'Snowfall', accent: '#dff4ff' },
  { id: 'bokeh', name: 'Bokeh', accent: '#9fe9d7' },
  { id: 'vhs', name: 'VHS', accent: '#ff7cc8' },
  { id: 'glitch', name: 'Glitch', accent: '#64f5e1' },
  { id: 'confetti', name: 'Confetti', accent: '#ffca6e' }
];

export const TRANSITIONS = [
  { id: 'fade', name: 'Dissolve' },
  { id: 'black', name: 'Fade to Black' },
  { id: 'white', name: 'White Flash' },
  { id: 'slide-left', name: 'Slide Left' },
  { id: 'slide-right', name: 'Slide Right' },
  { id: 'slide-up', name: 'Slide Up' },
  { id: 'zoom', name: 'Zoom Punch' },
  { id: 'blur', name: 'Blur Through' },
  { id: 'whip', name: 'Whip Pan' },
  { id: 'spin', name: 'Spiral' }
];

export const TEXT_PRESETS = [
  {
    id: 'editorial',
    name: 'Editorial',
    sample: 'A story in motion',
    style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 112, color: '#ffffff', highlightColor: '#72f5d1', letterSpacing: -2, lineHeight: 0.98, align: 'center' as const, strokeWidth: 0, shadow: true, uppercase: false, backgroundOpacity: 0 }
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    sample: 'CHASE THE LIGHT',
    style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 94, color: '#ffffff', highlightColor: '#72f5d1', letterSpacing: 8, lineHeight: 1.05, align: 'center' as const, strokeWidth: 0, shadow: true, uppercase: true, backgroundOpacity: 0 }
  },
  {
    id: 'serif',
    name: 'Quiet Serif',
    sample: 'Golden hour',
    style: { fontFamily: 'Luma Serif', fontWeight: 400, fontSize: 120, color: '#fff6e8', highlightColor: '#ffd39b', letterSpacing: -2, lineHeight: 1.0, align: 'center' as const, strokeWidth: 0, shadow: true, uppercase: false, backgroundOpacity: 0 }
  },
  {
    id: 'boxed',
    name: 'Boxed',
    sample: 'NEW CHAPTER',
    style: { fontFamily: 'Open Sans', fontWeight: 700, fontSize: 70, color: '#0b1117', highlightColor: '#0b1117', letterSpacing: 3, lineHeight: 1.1, align: 'center' as const, strokeWidth: 0, shadow: false, uppercase: true, background: '#eafff8', backgroundOpacity: 0.94 }
  },
  {
    id: 'outline',
    name: 'Outline',
    sample: 'AFTERGLOW',
    style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 116, color: 'transparent', highlightColor: '#72f5d1', letterSpacing: 4, lineHeight: 1.0, align: 'center' as const, strokeWidth: 2, shadow: false, uppercase: true, backgroundOpacity: 0 }
  },
  {
    id: 'caption',
    name: 'Caption',
    sample: 'the little things',
    style: { fontFamily: 'Open Sans', fontWeight: 600, fontSize: 54, color: '#ffffff', highlightColor: '#ffcf75', letterSpacing: 0, lineHeight: 1.3, align: 'center' as const, strokeWidth: 0, shadow: true, uppercase: false, backgroundOpacity: 0.42 }
  }
];

export const STICKERS = ['✦', '✨', '🌅', '🌊', '🔥', '❤️', '⭐️', '🎬', '💫', '🪩', '🌿', '☀️', '🌙', '🎞️', '🫧', '🎧', '⚡️', '💎', '🦋', '🌸', '🧡', '📼', '🛸', '🎯'];

export const STICKER_SHAPES: { id: Clip['shape']; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'star', label: 'Star' },
  { id: 'heart', label: 'Heart' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'sparkle', label: 'Sparkle' }
];

export const AUDIO_TRACK_COLORS = ['#3ac7a0', '#5f8dff', '#c77dff', '#ffb54d'];

export const CANVAS_DESIGN_HEIGHT = 1080;

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export type CaptionJobStatus = 'queued' | 'preparing' | 'downloading' | 'transcribing' | 'parsing' | 'done' | 'error' | 'cancelled';

export interface CaptionJob {
  id: string;
  status: CaptionJobStatus;
  progress: number;
  message: string;
  error: string | null;
  result: {
    cues: CaptionCue[];
    language: string;
    model: string;
    modelLabel: string;
    device: string;
    duration: number;
  } | null;
  model: string;
  language: string;
  source: 'mix' | 'clip';
  device: 'auto' | 'cpu';
  createdAt: string;
}

export interface CaptionModelInfo {
  id: string;
  label: string;
  quality: 'accurate' | 'fast';
  description: string;
  fileName: string;
  size: number;
  installed: boolean;
}

export interface CaptionCapabilities {
  version: string;
  runtime: {
    available: boolean;
    vulkan: boolean;
    cpu: boolean;
    version: string | null;
    path: string | null;
  };
  device: {
    detected: boolean;
    label: string | null;
    preferred: string;
  };
  models: CaptionModelInfo[];
  vadInstalled: boolean;
  activeJobId: string | null;
}

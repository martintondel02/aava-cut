import type { Clip, EasingId, EffectLayer } from '../types';
import { EFFECTS } from '../types';
import { clamp, uid } from './utils';

export interface KeyframeChannel {
  id: string;
  label: string;
  group: string;
  color: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  get: (clip: Clip) => number;
  set: (clip: Clip, value: number) => void;
}

export const EASING_OPTIONS: Array<{ value: EasingId; label: string; short: string }> = [
  { value: 'linear', label: 'Linear', short: 'Lin' },
  { value: 'easeIn', label: 'Ease in', short: 'In' },
  { value: 'easeOut', label: 'Ease out', short: 'Out' },
  { value: 'easeInOut', label: 'Ease in / out', short: 'In/Out' },
  { value: 'springSoft', label: 'Spring · soft', short: 'Spring' },
  { value: 'springSnappy', label: 'Spring · snappy', short: 'Snap' },
  { value: 'bounce', label: 'Bounce', short: 'Bounce' }
];

const GROUP_COLORS: Record<string, string> = {
  Transform: '#72f5d1',
  Color: '#ffc76b',
  Effects: '#b99aff',
  Audio: '#68a8ff',
  Text: '#ff91ad'
};

export function applyEasing(t: number, easing: EasingId | string = 'linear'): number {
  const x = clamp(t, 0, 1);
  if (easing === 'easeIn') return x * x * x;
  if (easing === 'easeOut') return 1 - (1 - x) ** 3;
  if (easing === 'easeInOut') return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  if (easing === 'springSoft' || easing === 'springSnappy') {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const damping = easing === 'springSnappy' ? 9 : 6;
    const frequency = easing === 'springSnappy' ? 14 : 9;
    const raw = 1 - Math.exp(-damping * x) * Math.cos(frequency * x);
    const end = 1 - Math.exp(-damping) * Math.cos(frequency);
    return raw - (end - 1) * x;
  }
  if (easing === 'bounce') {
    const n1 = 7.5625;
    const d1 = 2.75;
    let value = x;
    if (value < 1 / d1) return n1 * value * value;
    if (value < 2 / d1) { value -= 1.5 / d1; return n1 * value * value + 0.75; }
    if (value < 2.5 / d1) { value -= 2.25 / d1; return n1 * value * value + 0.9375; }
    value -= 2.625 / d1;
    return n1 * value * value + 0.984375;
  }
  return x;
}

export function sampleEasing(easing: EasingId | string, samples = 24): number[] {
  return Array.from({ length: samples + 1 }, (_, index) => applyEasing(index / samples, easing));
}

export function interpolateKeyframes(frames: Clip['keyframes'], property: string, time: number, fallback: number): number {
  const list = frames.filter((frame) => frame.property === property).sort((a, b) => a.time - b.time);
  if (!list.length) return fallback;
  if (list.length === 1) return time >= list[0].time ? list[0].value : fallback;
  if (time <= list[0].time) return list[0].value;
  if (time >= list[list.length - 1].time) return list[list.length - 1].value;
  for (let index = 0; index < list.length - 1; index++) {
    const from = list[index];
    const to = list[index + 1];
    if (time >= from.time && time <= to.time) {
      const progress = (time - from.time) / Math.max(0.0001, to.time - from.time);
      return from.value + (to.value - from.value) * applyEasing(progress, to.easing);
    }
  }
  return fallback;
}

export function makeEffectLayer(type: string, intensity = 65): EffectLayer {
  return { id: uid('fx'), type, intensity, enabled: true };
}

export function ensureEffectLayer(clip: Clip, type: string): EffectLayer {
  const existing = clip.effects.find((effect) => effect.type === type);
  if (existing) return existing;
  const effect = makeEffectLayer(type);
  clip.effects.push(effect);
  return effect;
}

export function removeEffectLayer(clip: Clip, type: string): void {
  clip.effects = clip.effects.filter((effect) => effect.type !== type);
}

export function effectChannelId(effect: EffectLayer): string {
  return `effect.${effect.id}.intensity`;
}

export function channelForClip(clip: Clip, id: string): KeyframeChannel | undefined {
  return channelsForClip(clip).find((channel) => channel.id === id);
}

const BASE_CHANNELS: KeyframeChannel[] = [
  { id: 'x', label: 'Position X', group: 'Transform', color: GROUP_COLORS.Transform, min: -1, max: 1, step: 0.005, get: (clip) => clip.x, set: (clip, value) => { clip.x = value; } },
  { id: 'y', label: 'Position Y', group: 'Transform', color: GROUP_COLORS.Transform, min: -1, max: 1, step: 0.005, get: (clip) => clip.y, set: (clip, value) => { clip.y = value; } },
  { id: 'scale', label: 'Scale', group: 'Transform', color: GROUP_COLORS.Transform, min: 0.04, max: 8, step: 0.01, suffix: '×', get: (clip) => clip.scale, set: (clip, value) => { clip.scale = value; } },
  { id: 'rotation', label: 'Rotation', group: 'Transform', color: GROUP_COLORS.Transform, min: -360, max: 360, step: 0.5, suffix: '°', get: (clip) => clip.rotation, set: (clip, value) => { clip.rotation = value; } },
  { id: 'opacity', label: 'Opacity', group: 'Transform', color: GROUP_COLORS.Transform, min: 0, max: 1, step: 0.01, get: (clip) => clip.opacity, set: (clip, value) => { clip.opacity = value; } },
  { id: 'filterIntensity', label: 'Filter intensity', group: 'Color', color: GROUP_COLORS.Color, min: 0, max: 100, step: 1, suffix: '%', get: (clip) => clip.filterIntensity, set: (clip, value) => { clip.filterIntensity = value; } },
  { id: 'adjust.brightness', label: 'Brightness', group: 'Color', color: GROUP_COLORS.Color, min: -60, max: 60, step: 1, suffix: '%', get: (clip) => clip.adjust?.brightness || 0, set: (clip, value) => { clip.adjust = { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), brightness: value }; } },
  { id: 'adjust.contrast', label: 'Contrast', group: 'Color', color: GROUP_COLORS.Color, min: -60, max: 60, step: 1, suffix: '%', get: (clip) => clip.adjust?.contrast || 0, set: (clip, value) => { clip.adjust = { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), contrast: value }; } },
  { id: 'adjust.saturation', label: 'Saturation', group: 'Color', color: GROUP_COLORS.Color, min: -100, max: 100, step: 1, suffix: '%', get: (clip) => clip.adjust?.saturation || 0, set: (clip, value) => { clip.adjust = { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), saturation: value }; } },
  { id: 'adjust.temperature', label: 'Temperature', group: 'Color', color: GROUP_COLORS.Color, min: -100, max: 100, step: 1, suffix: '%', get: (clip) => clip.adjust?.temperature || 0, set: (clip, value) => { clip.adjust = { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), temperature: value }; } },
  { id: 'adjust.hue', label: 'Hue', group: 'Color', color: GROUP_COLORS.Color, min: -90, max: 90, step: 1, suffix: '°', get: (clip) => clip.adjust?.hue || 0, set: (clip, value) => { clip.adjust = { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), hue: value }; } },
  { id: 'volume', label: 'Volume', group: 'Audio', color: GROUP_COLORS.Audio, min: 0, max: 1, step: 0.01, get: (clip) => clip.volume, set: (clip, value) => { clip.volume = value; } }
];

const TEXT_CHANNELS: KeyframeChannel[] = [
  { id: 'text.fontSize', label: 'Font size', group: 'Text', color: GROUP_COLORS.Text, min: 8, max: 300, step: 1, suffix: 'px', get: (clip) => clip.text?.fontSize || 84, set: (clip, value) => { if (clip.text) clip.text.fontSize = value; } },
  { id: 'text.letterSpacing', label: 'Letter spacing', group: 'Text', color: GROUP_COLORS.Text, min: -20, max: 40, step: 0.5, suffix: 'px', get: (clip) => clip.text?.letterSpacing || 0, set: (clip, value) => { if (clip.text) clip.text.letterSpacing = value; } },
  { id: 'text.backgroundOpacity', label: 'Text box opacity', group: 'Text', color: GROUP_COLORS.Text, min: 0, max: 1, step: 0.01, get: (clip) => clip.text?.backgroundOpacity || 0, set: (clip, value) => { if (clip.text) clip.text.backgroundOpacity = value; } }
];

export function channelsForClip(clip: Clip): KeyframeChannel[] {
  const channels: KeyframeChannel[] = [];
  if (clip.kind !== 'audio') {
    channels.push(...BASE_CHANNELS.slice(0, 5));
    channels.push(...BASE_CHANNELS.slice(5, 11));
  }
  if (clip.kind === 'audio' || clip.kind === 'video') channels.push(BASE_CHANNELS[11]);
  if (clip.text) channels.push(...TEXT_CHANNELS);
  for (const effect of clip.effects) {
    const definition = EFFECTS.find((item) => item.id === effect.type);
    channels.push({
      id: effectChannelId(effect),
      label: `FX · ${definition?.name || effect.type}`,
      group: 'Effects',
      color: GROUP_COLORS.Effects,
      min: 0,
      max: 100,
      step: 1,
      suffix: '%',
      get: (target) => target.effects.find((item) => item.id === effect.id)?.intensity ?? effect.intensity,
      set: (target, value) => {
        const layer = target.effects.find((item) => item.id === effect.id);
        if (layer) layer.intensity = value;
      }
    });
  }
  return channels;
}

export function valueAt(clip: Clip, property: string, local: number, fallback: number): number {
  return interpolateKeyframes(clip.keyframes, property, local, fallback);
}

export function channelValueAt(clip: Clip, channel: KeyframeChannel, local: number): number {
  return valueAt(clip, channel.id, local, channel.get(clip));
}

export function animatedClipValue(clip: Clip, property: string, local: number): number {
  const channel = channelForClip(clip, property);
  if (!channel) return 0;
  return channelValueAt(clip, channel, local);
}

export function propertyLabel(clip: Clip, property: string): string {
  return channelForClip(clip, property)?.label || property;
}

export function propertyColor(clip: Clip, property: string): string {
  return channelForClip(clip, property)?.color || GROUP_COLORS.Transform;
}

export function channelKeyframes(clip: Clip, channelId: string): Clip['keyframes'] {
  return clip.keyframes.filter((frame) => frame.property === channelId).sort((a, b) => a.time - b.time);
}

export function hasKeyframes(clip: Clip): boolean {
  return clip.keyframes.length > 0;
}

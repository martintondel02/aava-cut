import type { Clip, EasingId, EffectLayer, Keyframe, Project } from '../types';
import { uid } from './utils';
import { makeEffectLayer } from './keyframes';

const VALID_EASING = new Set<EasingId>(['linear', 'easeIn', 'easeOut', 'easeInOut', 'springSoft', 'springSnappy', 'bounce']);

function normalizeEffect(effect: string | EffectLayer): EffectLayer {
  if (typeof effect === 'string') return makeEffectLayer(effect, 65);
  return {
    id: effect.id || uid('fx'),
    type: effect.type || 'grain',
    enabled: effect.enabled !== false,
    intensity: Number.isFinite(effect.intensity) ? effect.intensity : 65
  };
}

function normalizeKeyframe(frame: Partial<Keyframe>, index: number, clip: Clip): Keyframe | null {
  if (!frame || typeof frame.property !== 'string' || !Number.isFinite(frame.time) || !Number.isFinite(frame.value)) return null;
  let easing = (frame.easing || 'easeInOut') as string;
  if (easing === 'spring') easing = 'springSoft';
  if (easing === 'ease-in') easing = 'easeIn';
  if (easing === 'ease-out') easing = 'easeOut';
  if (easing === 'ease-in-out') easing = 'easeInOut';
  return {
    id: frame.id || uid(`kf${index}`),
    property: frame.property,
    time: Math.max(0, Math.min(clip.duration, Number(frame.time))),
    value: Number(frame.value),
    easing: VALID_EASING.has(easing as EasingId) ? (easing as EasingId) : 'easeInOut'
  };
}

/**
 * Migrates a 1.0 project (string effects, four easing names) to the 1.1
 * animation schema. The migration is deliberately permissive: importing a
 * slightly malformed project should salvage every clip it can.
 */
export function migrateProject(input: Project): Project {
  const project = JSON.parse(JSON.stringify(input)) as Project & { version?: number };
  const version = Number(project.version) || 1;
  if (!Array.isArray(project.tracks)) project.tracks = [];
  if (!Array.isArray(project.clips)) project.clips = [];

  for (const track of project.tracks) {
    track.solo = Boolean(track.solo);
    track.gain = Number.isFinite(track.gain) ? track.gain : 1;
    track.eq = { low: 0, mid: 0, high: 0, ...(track.eq || {}) };
  }

  for (const clip of project.clips as Clip[]) {
    const effects = Array.isArray(clip.effects) ? clip.effects : [];
    clip.effects = (effects as Array<string | EffectLayer>).map(normalizeEffect);
    clip.keyframes = (Array.isArray(clip.keyframes) ? clip.keyframes : [])
      .map((frame, index) => normalizeKeyframe(frame, index, clip))
      .filter((frame): frame is Keyframe => Boolean(frame));
    clip.adjust = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      hue: 0,
      ...(clip.adjust || {})
    };
    clip.filterIntensity = Number.isFinite(clip.filterIntensity) ? clip.filterIntensity : 65;
    clip.fadeIn = Number.isFinite(clip.fadeIn) ? clip.fadeIn : 0;
    clip.fadeOut = Number.isFinite(clip.fadeOut) ? clip.fadeOut : 0;
    clip.audioFadeIn = Number.isFinite(clip.audioFadeIn) ? clip.audioFadeIn : 0;
    clip.audioFadeOut = Number.isFinite(clip.audioFadeOut) ? clip.audioFadeOut : 0;
    clip.volume = Number.isFinite(clip.volume) ? clip.volume : 0.8;
    clip.opacity = Number.isFinite(clip.opacity) ? clip.opacity : 1;
    clip.scale = Number.isFinite(clip.scale) ? clip.scale : 1;
  }

  if (!Array.isArray(project.masterEq) || project.masterEq.length !== 10) {
    project.masterEq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  project.version = Math.max(2, version);
  return project;
}

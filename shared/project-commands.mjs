/**
 * Headless, validated project commands for LumaCut's future agent bridge.
 *
 * The editor UI still owns its interactive store, but this module is the first
 * shared editing surface: deterministic operations over the same Project JSON.
 * All-or-nothing semantics: if any command fails, the original project is returned.
 */

import crypto from 'node:crypto';

const CLIP_PATCH_KEYS = new Set([
  'name', 'volume', 'opacity', 'audioFadeIn', 'audioFadeOut', 'speed',
  'x', 'y', 'scale', 'rotation', 'filter', 'filterIntensity', 'locked'
]);

const TRACK_PATCH_KEYS = new Set(['name', 'muted', 'solo', 'gain', 'locked', 'hidden']);

export const AGENT_COMMANDS = [
  { type: 'clip.move', description: 'Move a clip to an absolute start time and optional track.' },
  { type: 'clip.trim', description: 'Set a clip start, duration and/or source trim-in.' },
  { type: 'clip.split', description: 'Split a clip at an absolute timeline time.' },
  { type: 'clip.delete', description: 'Delete clips; ripple closes gaps on the same track.' },
  { type: 'clip.set', description: 'Set safe clip properties such as volume, opacity or fades.' },
  { type: 'clip.add', description: 'Add a media-library asset to a compatible track.' },
  { type: 'track.set', description: 'Mute, solo, lock or set the gain of a track.' }
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const round = (value) => Number(value.toFixed(4));
const fail = (message) => { throw new Error(message); };
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function validateProject(project) {
  if (!project || typeof project !== 'object') fail('A project object is required.');
  if (!Array.isArray(project.clips)) fail('Project clips must be an array.');
  if (!Array.isArray(project.tracks)) fail('Project tracks must be an array.');
  return project;
}

function trackAccepts(track, kind) {
  if (track.kind === 'audio') return kind === 'audio';
  if (track.kind === 'video') return kind === 'video' || kind === 'image';
  if (track.kind === 'overlay') return kind === 'video' || kind === 'image' || kind === 'text' || kind === 'sticker' || kind === 'shape';
  if (track.kind === 'text') return kind === 'text' || kind === 'sticker' || kind === 'shape';
  return false;
}

function findClip(project, clipId) {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) fail(`Clip "${clipId}" was not found.`);
  const track = project.tracks.find((item) => item.id === clip.trackId);
  if (track?.locked) fail(`Track "${track.name}" is locked.`);
  return clip;
}

function findTrack(project, trackId) {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) fail(`Track "${trackId}" was not found.`);
  if (track.locked) fail(`Track "${track.name}" is locked.`);
  return track;
}

function overlaps(project, trackId, start, duration, exceptId = '') {
  return project.clips.some((clip) => clip.id !== exceptId
    && clip.trackId === trackId
    && start < clip.start + clip.duration - 0.001
    && start + duration > clip.start + 0.001);
}

function requireStart(value) {
  if (!isNumber(value) || value < 0) fail('start must be a non-negative number.');
  return round(value);
}

function requireDuration(value) {
  if (!isNumber(value) || value < 0.1) fail('duration must be at least 0.1 seconds.');
  return round(value);
}

function getAsset(assets, assetId) {
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) fail(`Asset "${assetId}" was not found.`);
  return asset;
}

function makeMediaClip(asset, trackId, start, overrides = {}) {
  const isAudio = asset.kind === 'audio';
  const natural = isAudio ? Math.min(asset.duration || 5, 12) : asset.kind === 'image' ? 5 : Math.min(asset.duration || 5, 12);
  return {
    id: `clip_${crypto.randomUUID()}`,
    trackId,
    kind: asset.kind,
    name: asset.name || 'Clip',
    assetId: asset.id,
    start,
    duration: natural,
    trimIn: 0,
    speed: 1,
    volume: isAudio ? 0.75 : 0.65,
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
    kenBurns: asset.kind === 'image',
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: isAudio ? 0.2 : 0,
    audioFadeOut: isAudio ? 0.4 : 0,
    keyframes: [],
    ...overrides
  };
}

function applyClipMove(project, command) {
  const clip = findClip(project, command.clipId);
  const start = requireStart(command.start);
  const trackId = command.trackId || clip.trackId;
  const track = findTrack(project, trackId);
  if (!trackAccepts(track, clip.kind)) fail(`Clip "${clip.name}" cannot move to a ${track.kind} track.`);
  if (overlaps(project, trackId, start, clip.duration, clip.id)) fail(`Clip "${clip.name}" would overlap another clip.`);
  clip.trackId = trackId;
  clip.start = start;
}

function applyClipTrim(project, command) {
  const clip = findClip(project, command.clipId);
  const start = command.start === undefined ? clip.start : requireStart(command.start);
  const duration = command.duration === undefined ? clip.duration : requireDuration(command.duration);
  const trimIn = command.trimIn === undefined ? clip.trimIn : Math.max(0, Number(command.trimIn));
  if (!isNumber(trimIn)) fail('trimIn must be a non-negative number.');
  if (overlaps(project, clip.trackId, start, duration, clip.id)) fail(`Clip "${clip.name}" would overlap another clip.`);
  clip.start = start;
  clip.duration = duration;
  clip.trimIn = round(trimIn);
  clip.keyframes = (clip.keyframes || []).filter((frame) => frame.time <= duration + 0.001);
}

function applyClipSplit(project, command) {
  const clip = findClip(project, command.clipId);
  if (!isNumber(command.at)) fail('at must be a timeline second.');
  const local = round(command.at - clip.start);
  if (local <= 0.1 || local >= clip.duration - 0.1) fail('Split time must be inside the clip.');
  const keyframes = clip.keyframes || [];
  const right = clone(clip);
  right.id = `clip_${crypto.randomUUID()}`;
  right.start = round(command.at);
  right.duration = round(clip.duration - local);
  right.trimIn = round(clip.trimIn + local * clip.speed);
  right.keyframes = keyframes.filter((frame) => frame.time > local).map((frame) => ({ ...frame, id: `kf_${crypto.randomUUID()}`, time: round(frame.time - local) }));
  right.transition = undefined;
  clip.duration = local;
  clip.keyframes = keyframes.filter((frame) => frame.time <= local);
  project.clips.push(right);
}

function applyClipDelete(project, command) {
  if (!Array.isArray(command.clipIds) || !command.clipIds.length) fail('clipIds must be a non-empty array.');
  const ids = new Set(command.clipIds);
  const removed = project.clips.filter((clip) => ids.has(clip.id));
  if (removed.length !== ids.size) fail('One or more clips were not found.');
  const ranges = new Map();
  for (const commandClip of removed) {
    const list = ranges.get(commandClip.trackId) || [];
    list.push({ start: commandClip.start, end: commandClip.start + commandClip.duration });
    ranges.set(commandClip.trackId, list);
  }
  project.clips = project.clips.filter((clip) => !ids.has(clip.id));
  if (command.ripple === false) return;
  for (const [trackId, list] of ranges) {
    for (const range of list.sort((a, b) => b.start - a.start)) {
      const shift = range.end - range.start;
      for (const clip of project.clips) {
        if (clip.trackId === trackId && clip.start >= range.end - 0.001) clip.start = round(Math.max(0, clip.start - shift));
      }
    }
  }
}

function applyClipSet(project, command) {
  const clip = findClip(project, command.clipId);
  if (!command.patch || typeof command.patch !== 'object') fail('patch is required.');
  for (const [key, value] of Object.entries(command.patch)) {
    if (!CLIP_PATCH_KEYS.has(key)) fail(`Property "${key}" is not editable.`);
    if (key === 'volume') {
      if (!isNumber(value) || value < 0 || value > 10) fail('volume must be between 0 and 10.');
    } else if (key === 'opacity') {
      if (!isNumber(value) || value < 0 || value > 1) fail('opacity must be between 0 and 1.');
    } else if (key === 'filterIntensity') {
      if (!isNumber(value) || value < 0 || value > 100) fail('filterIntensity must be between 0 and 100.');
    } else if (key === 'audioFadeIn' || key === 'audioFadeOut') {
      if (!isNumber(value) || value < 0 || value > clip.duration) fail(`${key} is out of range.`);
    } else if (key === 'speed') {
      if (!isNumber(value) || value < 0.25 || value > 4) fail('speed must be between 0.25 and 4.');
    }
    clip[key] = value;
  }
}

function applyClipAdd(project, command, assets) {
  const asset = getAsset(assets, command.assetId);
  const start = requireStart(command.start ?? 0);
  const track = command.trackId ? findTrack(project, command.trackId) : project.tracks.find((item) => !item.locked && trackAccepts(item, asset.kind));
  if (!track) fail(`No track accepts a ${asset.kind} clip.`);
  if (!trackAccepts(track, asset.kind)) fail(`Track "${track.name}" does not accept ${asset.kind}.`);
  const duration = command.duration === undefined
    ? (asset.kind === 'image' ? 5 : Math.min(asset.duration || 5, 12))
    : requireDuration(command.duration);
  if (overlaps(project, track.id, start, duration)) fail('The new clip would overlap another clip.');
  const clip = makeMediaClip(asset, track.id, start, {
    duration,
    trimIn: command.trimIn === undefined ? 0 : Math.max(0, Number(command.trimIn)),
    ...(command.volume === undefined ? {} : { volume: Math.max(0, Math.min(10, Number(command.volume))) })
  });
  project.clips.push(clip);
}

function applyTrackSet(project, command) {
  const track = findTrack(project, command.trackId);
  if (!command.patch || typeof command.patch !== 'object') fail('patch is required.');
  for (const [key, value] of Object.entries(command.patch)) {
    if (!TRACK_PATCH_KEYS.has(key)) fail(`Track property "${key}" is not editable.`);
    if (key === 'gain' && (!isNumber(value) || value < 0 || value > 10)) fail('gain must be between 0 and 10.');
    if (key === 'name' && (typeof value !== 'string' || !value.trim())) fail('name must be non-empty.');
    track[key] = value;
  }
}

function applyOne(project, command, assets) {
  if (!command || typeof command.type !== 'string') fail('Each command needs a type.');
  switch (command.type) {
    case 'clip.move': applyClipMove(project, command); break;
    case 'clip.trim': applyClipTrim(project, command); break;
    case 'clip.split': applyClipSplit(project, command); break;
    case 'clip.delete': applyClipDelete(project, command); break;
    case 'clip.set': applyClipSet(project, command); break;
    case 'clip.add': applyClipAdd(project, command, assets); break;
    case 'track.set': applyTrackSet(project, command); break;
    default: fail(`Unknown command "${command.type}".`);
  }
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffProjects(before, after) {
  const beforeClips = new Map((before.clips || []).map((clip) => [clip.id, clip]));
  const afterClips = new Map((after.clips || []).map((clip) => [clip.id, clip]));
  const added = [...afterClips.values()].filter((clip) => !beforeClips.has(clip.id)).map((clip) => ({ id: clip.id, name: clip.name, start: clip.start }));
  const removed = [...beforeClips.values()].filter((clip) => !afterClips.has(clip.id)).map((clip) => ({ id: clip.id, name: clip.name, start: clip.start }));
  const changed = [];
  for (const [id, next] of afterClips) {
    const previous = beforeClips.get(id);
    if (!previous) continue;
    const fields = Object.keys(next).filter((key) => !same(previous[key], next[key]));
    if (fields.length) changed.push({ id, name: next.name, fields, start: next.start });
  }
  const beforeTracks = new Map((before.tracks || []).map((track) => [track.id, track]));
  const tracksChanged = (after.tracks || []).filter((track) => beforeTracks.has(track.id) && Object.keys(track).some((key) => !same(beforeTracks.get(track.id)[key], track[key])));
  return {
    clips: { added, removed, changed },
    tracks: { changed: tracksChanged.map((track) => track.id) },
    summary: [
      added.length ? `${added.length} added` : '',
      removed.length ? `${removed.length} removed` : '',
      changed.length ? `${changed.length} changed` : ''
    ].filter(Boolean).join(', ')
  };
}

export function applyCommands(project, commands, { assets = [] } = {}) {
  const original = clone(validateProject(project));
  if (!Array.isArray(commands)) return { ok: false, project: original, diff: null, errors: [{ index: -1, message: 'commands must be an array.' }] };
  const draft = clone(original);
  for (let index = 0; index < commands.length; index += 1) {
    try {
      applyOne(draft, commands[index], assets);
    } catch (error) {
      return { ok: false, project: original, diff: null, errors: [{ index, type: commands[index]?.type || null, message: String(error?.message || error) }] };
    }
  }
  draft.updatedAt = new Date().toISOString();
  return { ok: true, project: draft, diff: diffProjects(original, draft), errors: [] };
}

import type { Clip, Project } from '../types';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatTime(seconds: number, withFrames = false, fps = 30): string {
  const safe = Math.max(0, seconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe % 1) * fps);
  if (withFrames) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Math.max(0, seconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe % 1) * fps);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

export function formatBytes(bytes = 0): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function projectDuration(project: Project): number {
  const end = project.clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  return Math.max(1, end);
}

export function clipsForTrack(project: Project, trackId: string): Clip[] {
  return project.clips.filter((clip) => clip.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function activeClipAt(project: Project, time: number): Clip | undefined {
  return project.clips.find((clip) => time >= clip.start && time < clip.start + clip.duration);
}

export function findFreeStart(project: Project, trackId: string, desired: number, duration: number): number {
  const clips = clipsForTrack(project, trackId);
  if (!clips.length) return Math.max(0, desired);
  const overlapping = clips.find((clip) => desired < clip.start + clip.duration && desired + duration > clip.start);
  if (!overlapping) return Math.max(0, desired);
  return Math.max(...clips.map((clip) => clip.start + clip.duration));
}

export function snapTime(value: number, candidates: number[], threshold: number): number {
  let best = value;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function getClipLabel(clip: Clip): string {
  if (clip.kind === 'text') return clip.text?.content.replace(/\n/g, ' ') || 'Text';
  return clip.name;
}

export function ease(t: number, type: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' = 'linear'): number {
  const x = clamp(t, 0, 1);
  if (type === 'easeIn') return x * x * x;
  if (type === 'easeOut') return 1 - (1 - x) ** 3;
  if (type === 'easeInOut') return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  return x;
}

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const number = Number.parseInt(full, 16);
  if (Number.isNaN(number)) return `rgba(255,255,255,${alpha})`;
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function readableFileSize(size = 0): string {
  return formatBytes(size);
}

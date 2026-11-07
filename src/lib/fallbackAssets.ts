import type { MediaAsset } from '../types';

const demos: Array<[string, string, string, MediaAsset['kind'], number, number, number, string]> = [
  ['demo-aurora', 'Aurora Drift', 'aurora.mp4', 'video', 7, 1920, 1080, 'aurora-thumb.jpg'],
  ['demo-sunset', 'Golden Hour', 'sunset.mp4', 'video', 7, 1920, 1080, 'sunset-thumb.jpg'],
  ['demo-coast', 'Coastal Air', 'coast.mp4', 'video', 7, 1920, 1080, 'coast-thumb.jpg'],
  ['demo-neon', 'Neon District', 'neon.mp4', 'video', 7, 1920, 1080, 'neon-thumb.jpg'],
  ['demo-portrait', 'Quiet Peaks', 'portrait.jpg', 'image', 0, 1080, 1350, 'portrait-thumb.jpg'],
  ['demo-still', 'Aurora Still', 'aurora-still.jpg', 'image', 0, 1920, 1080, 'aurora-still-thumb.jpg'],
  ['demo-ambient', 'Slow Orbit', 'ambient.mp3', 'audio', 48, 0, 0, ''],
  ['demo-whoosh', 'Air Whoosh', 'whoosh.mp3', 'audio', 1.4, 0, 0, ''],
  ['demo-riser', 'Night Riser', 'riser.mp3', 'audio', 3, 0, 0, '']
];

export const FALLBACK_ASSETS: MediaAsset[] = demos.map(([id, name, file, kind, duration, width, height, thumb]) => ({
  id,
  name,
  kind,
  source: 'demo',
  url: `/demo/${file}`,
  thumbnail: thumb ? `/demo/${thumb}` : null,
  duration,
  width,
  height,
  peaks: []
}));

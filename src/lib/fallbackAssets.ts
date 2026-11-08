import type { MediaAsset } from '../types';

// Packaged builds start with an empty media library. User imports are stored
// by the local media server and are never bundled with the application.
export const FALLBACK_ASSETS: MediaAsset[] = [];

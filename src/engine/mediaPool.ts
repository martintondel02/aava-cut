import type { Clip, MediaAsset, Project } from '../types';
import { clamp } from '../lib/utils';

interface Entry {
  clipId: string;
  assetId: string;
  element: HTMLMediaElement;
  gain: GainNode | null;
  source: MediaElementAudioSourceNode | null;
}

interface ImageEntry {
  image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
}

const isVisualClip = (clip: Clip) => clip.kind === 'video' || clip.kind === 'image';
const isMediaClip = (clip: Clip) => clip.kind === 'audio' || clip.kind === 'video';

function findPreviousClip(project: Project, clip: Clip): Clip | undefined {
  const siblings = project.clips
    .filter((item) => item.trackId === clip.trackId && item.id !== clip.id && item.start < clip.start)
    .sort((a, b) => b.start - a.start);
  const previous = siblings[0];
  if (!previous) return undefined;
  if (Math.abs(previous.start + previous.duration - clip.start) > 0.08) return undefined;
  return previous;
}

export interface TransitionContext {
  previous: Clip;
  current: Clip;
  progress: number;
}

export function getTransitionAt(project: Project, clip: Clip, time: number): TransitionContext | null {
  if (!clip.transition || clip.transition.duration <= 0) return null;
  const previous = findPreviousClip(project, clip);
  if (!previous) return null;
  const local = time - clip.start;
  if (local < 0 || local >= clip.transition.duration) return null;
  return { previous, current: clip, progress: clamp(local / clip.transition.duration, 0, 1) };
}

export function isClipVisibleAt(project: Project, clip: Clip, time: number): boolean {
  if (time >= clip.start && time < clip.start + clip.duration) return true;
  if (!clip.transition) return false;
  const previous = findPreviousClip(project, clip);
  if (!previous) return false;
  return time >= clip.start && time < clip.start + clip.transition.duration;
}

function fadeFactor(time: number, clip: Clip, kind: 'visual' | 'audio'): number {
  const local = time - clip.start;
  let factor = 1;
  const fadeIn = kind === 'audio' ? clip.audioFadeIn : clip.fadeIn;
  const fadeOut = kind === 'audio' ? clip.audioFadeOut : clip.fadeOut;
  if (fadeIn > 0) factor *= clamp(local / fadeIn, 0, 1);
  if (fadeOut > 0) factor *= clamp((clip.duration - local) / fadeOut, 0, 1);
  return factor;
}

export class MediaPool {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  private entries = new Map<string, Entry>();
  private images = new Map<string, ImageEntry>();
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private host: HTMLDivElement | null = null;
  private captureDest: MediaStreamAudioDestinationNode | null = null;
  private capturing = false;
  onMediaUpdate: (() => void) | null = null;
  private lastMasterVolume = 0.8;

  ensureHost() {
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.id = 'lumacut-media-pool';
      this.host.style.cssText = 'position:fixed;left:-4px;bottom:-4px;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;';
      document.body.appendChild(this.host);
    }
    return this.host;
  }

  ensureContext(): AudioContext {
    if (!this.context) {
      const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.lastMasterVolume;
      this.connectOutput();
    }
    if (this.context.state === 'suspended') void this.context.resume();
    for (const entry of this.entries.values()) this.connectEntry(entry);
    return this.context;
  }

  private connectOutput() {
    if (!this.context || !this.master) return;
    try { this.master.disconnect(); } catch {}
    if (this.capturing && this.captureDest) {
      this.master.connect(this.captureDest);
    } else {
      this.master.connect(this.context.destination);
    }
  }

  private connectEntry(entry: Entry) {
    if (!this.context || !this.master || entry.source) return;
    try {
      const source = this.sources.get(entry.element) || this.context.createMediaElementSource(entry.element);
      this.sources.set(entry.element, source);
      const gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.master);
      entry.source = source;
      entry.gain = gain;
    } catch {
      // Some media elements cannot be routed through Web Audio; native playback still works.
    }
  }

  setMasterVolume(volume: number) {
    if (this.capturing) {
      if (this.master && this.context) this.master.gain.value = 1;
      return;
    }
    this.lastMasterVolume = clamp(volume, 0, 1);
    if (this.master && this.context) this.master.gain.value = this.lastMasterVolume;
  }

  getElement(clipId: string): HTMLMediaElement | null {
    return this.entries.get(clipId)?.element || null;
  }

  ensureElement(clip: Clip, asset: MediaAsset): HTMLMediaElement {
    const existing = this.entries.get(clip.id);
    if (existing && existing.assetId === asset.id) return existing.element;
    if (existing) {
      existing.element.pause();
      existing.element.remove();
      this.entries.delete(clip.id);
    }
    const host = this.ensureHost();
    const element = document.createElement(isMediaClip(clip) && clip.kind === 'audio' ? 'audio' : 'video') as HTMLMediaElement;
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
      element.style.cssText = 'width:2px;height:2px;';
    } else {
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
    }
    element.src = asset.url;
    element.load();
    host.appendChild(element);
    const entry: Entry = { clipId: clip.id, assetId: asset.id, element, gain: null, source: null };
    this.entries.set(clip.id, entry);
    if (this.context) this.connectEntry(entry);
    const notify = () => this.onMediaUpdate?.();
    element.addEventListener('loadeddata', notify);
    element.addEventListener('seeked', notify);
    element.addEventListener('canplay', notify);
    element.addEventListener('error', notify);
    return element;
  }

  getImage(asset: MediaAsset): HTMLImageElement | null {
    let entry = this.images.get(asset.id);
    if (!entry) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      entry = { image, ready: false, failed: false };
      image.onload = () => {
        entry!.ready = true;
        this.onMediaUpdate?.();
      };
      image.onerror = () => {
        entry!.failed = true;
        this.onMediaUpdate?.();
      };
      image.src = asset.url;
      this.images.set(asset.id, entry);
    }
    return entry.ready ? entry.image : null;
  }

  imageFailed(asset: MediaAsset): boolean {
    return this.images.get(asset.id)?.failed || false;
  }

  private collectActive(project: Project, time: number): Array<{ clip: Clip; previous?: Clip; transitionProgress?: number }> {
    const visible = new Map<string, { clip: Clip; previous?: Clip; transitionProgress?: number }>();
    const hiddenTracks = new Set(project.tracks.filter((track) => track.hidden).map((track) => track.id));
    for (const clip of project.clips) {
      if (!isMediaClip(clip)) continue;
      if (clip.kind === 'video' && hiddenTracks.has(clip.trackId)) continue;
      if (time >= clip.start && time < clip.start + clip.duration) {
        visible.set(clip.id, { clip });
      }
    }
    for (const clip of project.clips) {
      if (!clip.transition || clip.kind !== 'video') continue;
      const previous = findPreviousClip(project, clip);
      if (!previous) continue;
      const local = time - clip.start;
      if (local >= 0 && local < clip.transition.duration) {
        if (!visible.has(previous.id)) {
          visible.set(previous.id, { clip: previous, previous: undefined, transitionProgress: local / clip.transition.duration });
        }
      }
    }
    return Array.from(visible.values());
  }

  sync(project: Project, time: number, playing: boolean, masterVolume: number, assets: MediaAsset[] = []) {
    this.setMasterVolume(masterVolume);
    const tracks = new Map(project.tracks.map((track) => [track.id, track]));
    const active = this.collectActive(project, time);
    if (assets.length) {
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      for (const item of active) {
        const asset = item.clip.assetId ? byId.get(item.clip.assetId) : null;
        if (asset) this.ensureElement(item.clip, asset);
      }
    }
    const activeIds = new Set(active.map((item) => item.clip.id));
    for (const [clipId, entry] of this.entries) {
      if (!activeIds.has(clipId)) {
        if (!entry.element.paused) entry.element.pause();
        if (entry.gain && this.context) entry.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
      }
    }
    for (const item of active) {
      const { clip, transitionProgress } = item;
      const entry = this.entries.get(clip.id);
      if (!entry) continue;
      const track = tracks.get(clip.trackId);
      if (track?.muted) {
        if (entry.gain && this.context) entry.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
        continue;
      }
      const local = clamp(time - clip.start, 0, clip.duration);
      let sourceTime: number;
      if (transitionProgress !== undefined) {
        sourceTime = clip.trimIn + clip.duration * clip.speed - 0.02;
      } else {
        sourceTime = clip.trimIn + local * clip.speed;
      }
      const element = entry.element;
      try {
        if (playing && transitionProgress === undefined) {
          element.playbackRate = clamp(clip.speed, 0.25, 4);
          if (element.paused) {
            if (Math.abs(element.currentTime - sourceTime) > 0.35) element.currentTime = Math.max(0, sourceTime);
            void element.play().catch(() => {});
          } else if (Math.abs(element.currentTime - sourceTime) > 0.5) {
            element.currentTime = Math.max(0, sourceTime);
          }
        } else {
          if (!element.paused) element.pause();
          if (Math.abs(element.currentTime - sourceTime) > 0.045) element.currentTime = Math.max(0, sourceTime);
        }
      } catch {
        // Media metadata can still be loading.
      }
      if (entry.gain && this.context) {
        let factor = fadeFactor(time, clip, 'audio') * clamp(clip.volume, 0, 1);
        if (clip.kind === 'video' && !clip.assetId) factor = 0;
        if (transitionProgress !== undefined) factor *= clamp(1 - transitionProgress, 0, 1);
        if (clip.transition && time >= clip.start) {
          const localTransition = time - clip.start;
          if (localTransition < clip.transition.duration) factor *= clamp(localTransition / clip.transition.duration, 0, 1);
        }
        entry.gain.gain.setTargetAtTime(factor, this.context.currentTime, 0.015);
      } else if (!this.context) {
        element.volume = clamp(clip.volume * (tracks.get(clip.trackId)?.muted ? 0 : 1), 0, 1);
      }
    }
  }

  pauseAll() {
    for (const entry of this.entries.values()) {
      try { entry.element.pause(); } catch {}
    }
  }

  async prepare(project: Project, time: number, assets: MediaAsset[]): Promise<void> {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const tracks = new Map(project.tracks.map((track) => [track.id, track]));
    const waitFor: Array<Promise<void>> = [];
    const active = project.clips.filter((clip) => (clip.kind === 'video' || clip.kind === 'audio') && time >= clip.start && time < clip.start + clip.duration);
    for (const clip of active) {
      if (tracks.get(clip.trackId)?.hidden) continue;
      const asset = clip.assetId ? byId.get(clip.assetId) : null;
      if (!asset) continue;
      const element = this.ensureElement(clip, asset);
      const sourceTime = clip.trimIn + (time - clip.start) * clip.speed;
      try { element.pause(); element.currentTime = Math.max(0, sourceTime); } catch {}
      waitFor.push(new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          element.removeEventListener('seeked', finish);
          element.removeEventListener('canplay', finish);
          element.removeEventListener('loadeddata', finish);
          resolve();
        };
        element.addEventListener('seeked', finish, { once: true });
        element.addEventListener('canplay', finish, { once: true });
        element.addEventListener('loadeddata', finish, { once: true });
        setTimeout(finish, 1800);
        if (element.readyState >= 2) finish();
      }));
    }
    await Promise.all(waitFor);
  }

  beginCapture(): MediaStream | null {
    const context = this.ensureContext();
    if (!this.captureDest) this.captureDest = context.createMediaStreamDestination();
    this.capturing = true;
    if (this.master) this.master.gain.value = 1;
    this.connectOutput();
    return this.captureDest.stream;
  }

  endCapture() {
    this.capturing = false;
    if (this.context && this.master) this.master.gain.value = this.lastMasterVolume;
    this.connectOutput();
  }

  async resume() {
    await this.ensureContext().resume();
  }

  setPreviewMaster(volume: number) {
    this.setMasterVolume(volume);
  }

  cleanup(validClipIds: Set<string>) {
    for (const [clipId, entry] of this.entries) {
      if (!validClipIds.has(clipId)) {
        try { entry.element.pause(); } catch {}
        entry.element.remove();
        this.entries.delete(clipId);
      }
    }
  }

  async seekElement(clip: Clip, asset: MediaAsset, time: number) {
    const element = this.ensureElement(clip, asset);
    try {
      element.pause();
      element.currentTime = Math.max(0, time);
    } catch {}
  }

  isVisual(clip: Clip) {
    return isVisualClip(clip);
  }
}

export const mediaPool = new MediaPool();

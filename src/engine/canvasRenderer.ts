import type { Clip, Keyframe, MediaAsset, Project, TextStyle } from '../types';
import { FILTERS } from '../types';
import { clamp, ease, hexToRgba } from '../lib/utils';
import { getTransitionAt, mediaPool } from './mediaPool';

type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

interface AnimatedValues {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

interface TransitionStyle {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  blur: number;
  wipe?: number;
}

interface DrawOptions {
  alpha?: number;
  dx?: number;
  dy?: number;
  extraScale?: number;
  extraRotation?: number;
  blur?: number;
  wipe?: number;
  frozen?: boolean;
}

const TRACK_RANK: Record<string, number> = { video: 0, overlay: 1, text: 2 };

function rand(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function interpolate(frames: Keyframe[], property: Keyframe['property'], time: number, fallback: number): number {
  const list = frames.filter((frame) => frame.property === property).sort((a, b) => a.time - b.time);
  if (!list.length) return fallback;
  if (list.length === 1) return time >= list[0].time ? list[0].value : fallback;
  if (time <= list[0].time) return list[0].value;
  if (time >= list[list.length - 1].time) return list[list.length - 1].value;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    if (time >= a.time && time <= b.time) {
      const progress = (time - a.time) / Math.max(0.0001, b.time - a.time);
      return a.value + (b.value - a.value) * ease(progress, b.easing as Easing);
    }
  }
  return fallback;
}

function animatedValues(clip: Clip, local: number): AnimatedValues {
  let scale = clip.scale;
  let rotation = clip.rotation;
  let alpha = 1;
  let offsetX = 0;
  let offsetY = 0;

  const applyAnimation = (type: string, duration: number, entering: boolean) => {
    if (!duration || type === 'none') return;
    const progress = entering
      ? ease(clamp(local / duration, 0, 1), 'easeOut')
      : ease(clamp((clip.duration - local) / duration, 0, 1), 'easeOut');
    if (progress >= 1) return;
    const remaining = 1 - progress;
    if (type === 'fade') alpha *= progress;
    if (type === 'slide-left') offsetX -= remaining * 0.16;
    if (type === 'slide-right') offsetX += remaining * 0.16;
    if (type === 'slide-up') offsetY += remaining * 0.12;
    if (type === 'slide-down') offsetY -= remaining * 0.12;
    if (type === 'zoom') scale *= 0.72 + 0.28 * progress;
    if (type === 'spin') rotation += remaining * 22 * (entering ? -1 : 1);
    if (type !== 'fade' && type !== 'zoom' && !type.startsWith('slide')) alpha *= progress;
  };

  if (clip.animationIn) applyAnimation(clip.animationIn.type, clip.animationIn.duration, true);
  if (clip.animationOut) applyAnimation(clip.animationOut.type, clip.animationOut.duration, false);

  if (clip.fadeIn > 0) alpha *= clamp(local / clip.fadeIn, 0, 1);
  if (clip.fadeOut > 0) alpha *= clamp((clip.duration - local) / clip.fadeOut, 0, 1);

  const x = interpolate(clip.keyframes, 'x', local, clip.x) + offsetX;
  const y = interpolate(clip.keyframes, 'y', local, clip.y) + offsetY;
  scale = interpolate(clip.keyframes, 'scale', local, scale);
  rotation = interpolate(clip.keyframes, 'rotation', local, rotation);
  alpha *= interpolate(clip.keyframes, 'opacity', local, 1);

  return { x, y, scale, rotation, opacity: clamp(alpha, 0, 1) };
}

function filterFor(id: string, intensity: number, extraBlur = 0, adjust?: Clip['adjust']): string {
  const amount = clamp(intensity / 100, 0, 1);
  const table: Record<string, { brightness: number; contrast: number; saturate: number; sepia: number; grayscale: number; hue: number; blur: number }> = {
    cinematic: { brightness: 0.96, contrast: 1.12, saturate: 0.86, sepia: 0, grayscale: 0, hue: 0, blur: 0 },
    warm: { brightness: 1.03, contrast: 1.04, saturate: 1.22, sepia: 0.18, grayscale: 0, hue: 0, blur: 0 },
    cool: { brightness: 1.02, contrast: 1.06, saturate: 0.92, sepia: 0, grayscale: 0, hue: 8, blur: 0 },
    mono: { brightness: 1.02, contrast: 1.12, saturate: 1, sepia: 0, grayscale: 1, hue: 0, blur: 0 },
    vintage: { brightness: 1.04, contrast: 0.94, saturate: 0.82, sepia: 0.42, grayscale: 0, hue: 0, blur: 0 },
    vivid: { brightness: 1, contrast: 1.1, saturate: 1.55, sepia: 0, grayscale: 0, hue: 0, blur: 0 },
    soft: { brightness: 1.06, contrast: 0.92, saturate: 1.04, sepia: 0, grayscale: 0, hue: 0, blur: 0.4 },
    noir: { brightness: 0.9, contrast: 1.45, saturate: 1, sepia: 0, grayscale: 1, hue: 0, blur: 0 },
    dream: { brightness: 1.08, contrast: 0.86, saturate: 1.15, sepia: 0, grayscale: 0, hue: 0, blur: 0.7 }
  };
  const target = table[id];
  const a = adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 };
  if (!target && !a.brightness && !a.contrast && !a.saturation && !a.hue && extraBlur <= 0.01) return 'none';
  const lerp = (base: number, value: number) => base + (value - base) * amount;
  const base = target || { brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0, blur: 0 };
  const brightness = lerp(1, base.brightness) * (1 + (a.brightness / 100) * 0.6);
  const contrast = lerp(1, base.contrast) * (1 + (a.contrast / 100) * 0.5);
  const saturation = lerp(1, base.saturate) * (1 + (a.saturation / 100));
  const hue = lerp(0, base.hue) + a.hue * 1.2;
  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${Math.max(0, saturation).toFixed(3)})`,
    `sepia(${lerp(0, base.sepia).toFixed(3)})`,
    `grayscale(${lerp(0, base.grayscale).toFixed(3)})`,
    `hue-rotate(${hue.toFixed(2)}deg)`
  ];
  const blur = Math.max(extraBlur, lerp(0, base.blur));
  if (blur > 0.01) parts.push(`blur(${blur.toFixed(2)}px)`);
  return parts.join(' ');
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else if (ctx.measureText(word).width > maxWidth) {
        if (line) {
          lines.push(line);
          line = '';
        }
        let chunk = '';
        for (const char of Array.from(word)) {
          if (ctx.measureText(chunk + char).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function lineWidth(ctx: CanvasRenderingContext2D, line: string, letterSpacing: number): number {
  if (!letterSpacing) return ctx.measureText(line).width;
  let total = 0;
  for (const char of Array.from(line)) total += ctx.measureText(char).width + letterSpacing;
  return Math.max(0, total - letterSpacing);
}

function drawSpacedLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, spacing: number, stroke: boolean) {
  if (!spacing) {
    if (stroke) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    return;
  }
  let cursor = x;
  for (const char of Array.from(line)) {
    if (stroke) ctx.strokeText(char, cursor, y);
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

function drawShape(ctx: CanvasRenderingContext2D, clip: Clip, size: number) {
  const color = clip.shapeColor || '#72f5d1';
  ctx.fillStyle = color;
  ctx.beginPath();
  if (clip.shape === 'circle') {
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  } else if (clip.shape === 'square') {
    roundedRect(ctx, -size / 2, -size / 2, size, size, size * 0.08);
  } else if (clip.shape === 'triangle') {
    ctx.moveTo(0, -size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.lineTo(-size / 2, size / 2);
    ctx.closePath();
  } else if (clip.shape === 'star' || clip.shape === 'sparkle') {
    const points = clip.shape === 'sparkle' ? 4 : 5;
    const outer = size / 2;
    const inner = clip.shape === 'sparkle' ? outer * 0.17 : outer * 0.44;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outer : inner;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (clip.shape === 'heart') {
    ctx.moveTo(0, size * 0.33);
    ctx.bezierCurveTo(-size * 0.72, -size * 0.14, -size * 0.34, -size * 0.55, 0, -size * 0.22);
    ctx.bezierCurveTo(size * 0.34, -size * 0.55, size * 0.72, -size * 0.14, 0, size * 0.33);
    ctx.closePath();
  } else if (clip.shape === 'arrow') {
    ctx.moveTo(-size / 2, 0);
    ctx.lineTo(size * 0.2, -size * 0.32);
    ctx.lineTo(size * 0.2, -size * 0.13);
    ctx.lineTo(size / 2, -size * 0.13);
    ctx.lineTo(size / 2, size * 0.13);
    ctx.lineTo(size * 0.2, size * 0.13);
    ctx.lineTo(size * 0.2, size * 0.32);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  }
  ctx.fill();
}

export class CanvasRenderer {
  private noise: HTMLCanvasElement | null = null;
  private thumbnails = new Map<string, HTMLImageElement>();

  private getThumbnail(asset: MediaAsset): HTMLImageElement | null {
    if (!asset.thumbnail) return null;
    const existing = this.thumbnails.get(asset.id);
    if (existing) return existing.complete && existing.naturalWidth ? existing : null;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = asset.thumbnail;
    image.onload = () => mediaPool.onMediaUpdate?.();
    this.thumbnails.set(asset.id, image);
    return null;
  }

  private ensureNoise(): HTMLCanvasElement {
    if (this.noise) return this.noise;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 135;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.floor(Math.random() * 255);
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 55;
    }
    ctx.putImageData(image, 0, 0);
    this.noise = canvas;
    return canvas;
  }

  draw(canvas: HTMLCanvasElement, project: Project, time: number, assets: MediaAsset[], playing = false, masterVolume = 1) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    mediaPool.sync(project, time, playing, masterVolume, assets);
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = project.background || '#03070b';
    ctx.fillRect(0, 0, width, height);

    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    const tracks = project.tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.kind !== 'audio' && !track.hidden)
      .sort((a, b) => (TRACK_RANK[a.track.kind] ?? 0) - (TRACK_RANK[b.track.kind] ?? 0) || a.index - b.index);

    const activeEffectClips: Clip[] = [];
    for (const { track } of tracks) {
      const trackClips = project.clips.filter((clip) => clip.trackId === track.id);
      const current = trackClips.filter((clip) => time >= clip.start && time < clip.start + clip.duration);
      for (const clip of current) {
        const transition = getTransitionAt(project, clip, time);
        if (transition) {
          const progress = transition.progress;
          const styles = this.transitionStyles(clip.transition!.type, progress, width, height);
          this.drawClip(ctx, project, transition.previous, transition.previous.start + transition.previous.duration - 0.02, assetMap, styles.previous, true);
          this.drawClip(ctx, project, clip, time, assetMap, styles.current);
        } else {
          this.drawClip(ctx, project, clip, time, assetMap, null);
        }
        if (clip.effects.length) activeEffectClips.push(clip);
      }
    }

    const effectIds = new Set<string>();
    for (const clip of activeEffectClips) for (const effect of clip.effects) effectIds.add(effect);
    for (const effect of effectIds) this.drawEffect(ctx, effect, width, height, time);

    // Very light cinematic vignette keeps the preview feeling like a finished grade.
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

  }

  private transitionStyles(type: string, progress: number, width: number, height: number): { previous: TransitionStyle; current: TransitionStyle } {
    const p = ease(progress, 'easeInOut');
    const base = (): TransitionStyle => ({ alpha: 1, dx: 0, dy: 0, scale: 1, rotation: 0, blur: 0 });
    const prev = base();
    const curr = base();
    if (type === 'fade') {
      prev.alpha = 1 - p;
      curr.alpha = p;
    } else if (type === 'black') {
      prev.alpha = 1 - Math.min(1, p * 2);
      curr.alpha = Math.max(0, p * 2 - 1);
    } else if (type === 'white') {
      prev.alpha = 1 - Math.min(1, p * 2);
      curr.alpha = Math.max(0, p * 2 - 1);
    } else if (type === 'slide-left') {
      prev.dx = -p * width;
      curr.dx = (1 - p) * width;
    } else if (type === 'slide-right') {
      prev.dx = p * width;
      curr.dx = -(1 - p) * width;
    } else if (type === 'slide-up') {
      prev.dy = -p * height;
      curr.dy = (1 - p) * height;
    } else if (type === 'zoom') {
      prev.alpha = 1 - p;
      prev.scale = 1 + p * 0.28;
      curr.alpha = p;
      curr.scale = 0.78 + p * 0.22;
    } else if (type === 'blur') {
      prev.alpha = 1 - p;
      prev.blur = p * 22;
      curr.alpha = p;
      curr.blur = (1 - p) * 22;
    } else if (type === 'whip') {
      prev.dx = -p * width * 1.15;
      prev.blur = p * 18;
      curr.dx = (1 - p) * width * 1.15;
      curr.blur = (1 - p) * 18;
    } else if (type === 'spin') {
      prev.alpha = 1 - p;
      prev.rotation = p * 18;
      prev.scale = 1 + p * 0.1;
      curr.alpha = p;
      curr.rotation = -(1 - p) * 18;
      curr.scale = 1 - (1 - p) * 0.12;
    }
    return { previous: prev, current: curr };
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    project: Project,
    clip: Clip,
    time: number,
    assets: Map<string, MediaAsset>,
    transition: TransitionStyle | null,
    frozen = false
  ) {
    const local = frozen ? clip.duration : clamp(time - clip.start, 0, clip.duration);
    const values = animatedValues(clip, local);
    const alpha = values.opacity * (transition?.alpha ?? 1);
    if (alpha <= 0.001) return;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.globalCompositeOperation = clip.blend || 'source-over';
    const cx = width / 2 + values.x * width + (transition?.dx ?? 0);
    const cy = height / 2 + values.y * height + (transition?.dy ?? 0);
    ctx.translate(cx, cy);
    ctx.rotate(((values.rotation + (transition?.rotation ?? 0)) * Math.PI) / 180);
    const effectiveScale = values.scale * (transition?.scale ?? 1);
    if (clip.kind === 'text') {
      this.drawText(ctx, clip, local, effectiveScale, width, height);
    } else if (clip.kind === 'sticker') {
      this.drawSticker(ctx, clip, effectiveScale, height);
    } else if (clip.kind === 'shape') {
      this.drawShapeClip(ctx, clip, effectiveScale, height);
    } else {
      const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
      if (asset) this.drawMedia(ctx, clip, asset, local, effectiveScale, width, height, transition?.blur ?? 0);
    }
    ctx.restore();
    if (transition?.wipe !== undefined) {
      // Wipe clipping is applied by re-drawing under a clip region when needed.
    }
  }

  private drawMedia(
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    asset: MediaAsset,
    local: number,
    scale: number,
    width: number,
    height: number,
    extraBlur: number
  ) {
    if (!asset.width || !asset.height) return;
    const sourceTime = clamp(clip.trimIn + local * clip.speed, 0, Math.max(0.001, asset.duration));
    let source: CanvasImageSource | null = null;
    if (asset.kind === 'image') {
      source = mediaPool.getImage(asset);
    } else {
      const element = mediaPool.getElement(clip.id);
      if (element instanceof HTMLVideoElement && element.readyState >= 2) source = element;
      if (!source) source = this.getThumbnail(asset);
    }
    if (!source) {
      // A calm placeholder while the first frame decodes.
      const gradient = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
      gradient.addColorStop(0, '#0b1c2a');
      gradient.addColorStop(0.5, '#152f3f');
      gradient.addColorStop(1, '#071018');
      ctx.fillStyle = gradient;
      ctx.fillRect(-width / 2 * scale, -height / 2 * scale, width * scale, height * scale);
      return;
    }
    const cover = Math.max(width / asset.width, height / asset.height);
    let drawWidth = asset.width * cover * scale;
    let drawHeight = asset.height * cover * scale;
    let extraX = 0;
    if (clip.kenBurns && asset.kind === 'image') {
      const progress = clamp(local / Math.max(0.1, clip.duration), 0, 1);
      const kb = 1 + progress * 0.055;
      drawWidth *= kb;
      drawHeight *= kb;
      extraX = (progress - 0.5) * width * 0.015;
    }
    ctx.save();
    if (clip.flipH) ctx.scale(-1, 1);
    if (clip.flipV) ctx.scale(1, -1);
    const filter = filterFor(clip.filter, clip.filterIntensity, extraBlur, clip.adjust);
    if (filter !== 'none') ctx.filter = filter;
    try {
      ctx.drawImage(source, -drawWidth / 2 + extraX, -drawHeight / 2, drawWidth, drawHeight);
    } catch {
      // Video frame may be momentarily unavailable while seeking.
    }
    ctx.restore();
    const temperature = clip.adjust?.temperature || 0;
    if (Math.abs(temperature) > 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = Math.min(0.5, Math.abs(temperature) / 180);
      ctx.fillStyle = temperature > 0 ? '#ff9b4a' : '#5f8dff';
      ctx.fillRect(-drawWidth / 2 + extraX, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    }
    const preset = FILTERS.find((item) => item.id === clip.filter);
    if (preset?.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = clamp(clip.filterIntensity / 100, 0, 1) * 0.75;
      ctx.fillStyle = preset.tint;
      ctx.fillRect(-drawWidth / 2 + extraX, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    }
    void sourceTime;
  }

  private drawText(ctx: CanvasRenderingContext2D, clip: Clip, local: number, scale: number, width: number, height: number) {
    const style = clip.text;
    if (!style) return;
    const fontScale = height / 1080;
    let content = style.uppercase ? style.content.toUpperCase() : style.content;
    let styleAlpha = 1;
    let offsetY = 0;
    let extraScale = 1;
    if (style.animation && style.animation !== 'none') {
      const p = ease(clamp(local / 0.65, 0, 1), 'easeOut');
      if (style.animation === 'fade') styleAlpha = p;
      if (style.animation === 'slide-up') { styleAlpha = p; offsetY = (1 - p) * 0.035 * height; }
      if (style.animation === 'slide-down') { styleAlpha = p; offsetY = -(1 - p) * 0.035 * height; }
      if (style.animation === 'zoom') { styleAlpha = p; extraScale = 0.9 + 0.1 * p; }
      if (style.animation === 'typewriter') {
        const characters = Array.from(content);
        const visible = Math.floor((local / Math.max(0.2, clip.duration * 0.65)) * characters.length);
        content = characters.slice(0, clamp(visible, 1, characters.length)).join('');
      }
    }
    if (!content) return;
    const fontSize = style.fontSize * fontScale;
    ctx.save();
    ctx.globalAlpha *= styleAlpha;
    ctx.scale(scale * extraScale, scale * extraScale);
    ctx.translate(0, offsetY);
    ctx.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${fontSize}px ${style.fontFamily}, "DejaVu Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const spacing = style.letterSpacing * fontScale;
    const maxWidth = Math.max(40, style.maxWidth * width);
    const lines = wrapLines(ctx, content, maxWidth);
    const lineHeight = fontSize * style.lineHeight;
    const measured = lines.map((line) => lineWidth(ctx, line, spacing));
    const blockWidth = Math.max(1, ...measured);
    const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
    const padX = style.paddingX * fontScale;
    const padY = style.paddingY * fontScale;
    if (style.backgroundOpacity > 0.001) {
      ctx.save();
      ctx.fillStyle = hexToRgba(style.background || '#000000', style.backgroundOpacity);
      roundedRect(ctx, -blockWidth / 2 - padX, -blockHeight / 2 - padY, blockWidth + padX * 2, blockHeight + padY * 2, style.radius * fontScale);
      ctx.fill();
      ctx.restore();
    }
    if (style.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = fontSize * 0.16;
      ctx.shadowOffsetY = fontSize * 0.035;
    }
    const fillColor = style.color;
    const strokeWidth = style.strokeWidth * fontScale * 2;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const y = -blockHeight / 2 + lineHeight / 2 + i * lineHeight;
      let startX = -blockWidth / 2;
      if (style.align === 'center') startX = -measured[i] / 2;
      if (style.align === 'right') startX = blockWidth / 2 - measured[i];
      ctx.fillStyle = fillColor;
      if (strokeWidth > 0) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        drawSpacedLine(ctx, line, startX, y, spacing, true);
      }
      if (fillColor && fillColor !== 'transparent') drawSpacedLine(ctx, line, startX, y, spacing, false);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.restore();
  }

  private drawSticker(ctx: CanvasRenderingContext2D, clip: Clip, scale: number, height: number) {
    if (!clip.sticker) return;
    const fontSize = height * 0.17;
    ctx.scale(scale, scale);
    ctx.font = `${fontSize}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 18;
    ctx.fillText(clip.sticker, 0, 0);
  }

  private drawShapeClip(ctx: CanvasRenderingContext2D, clip: Clip, scale: number, height: number) {
    ctx.scale(scale, scale);
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 24;
    drawShape(ctx, clip, height * 0.16);
  }

  private drawEffect(ctx: CanvasRenderingContext2D, id: string, width: number, height: number, time: number) {
    if (id === 'grain') {
      const noise = this.ensureNoise();
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.11;
      const offsetX = Math.floor(rand(Math.floor(time * 12)) * noise.width);
      const offsetY = Math.floor(rand(Math.floor(time * 12) + 9) * noise.height);
      for (let x = -offsetX; x < width; x += noise.width) {
        for (let y = -offsetY; y < height; y += noise.height) ctx.drawImage(noise, x, y);
      }
      ctx.restore();
    } else if (id === 'light-leak') {
      const x = ((time * 0.08) % 1) * width;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gradient = ctx.createRadialGradient(x, height * 0.25, 0, x, height * 0.25, width * 0.55);
      gradient.addColorStop(0, 'rgba(255,170,90,.3)');
      gradient.addColorStop(0.35, 'rgba(255,95,105,.16)');
      gradient.addColorStop(1, 'rgba(255,70,130,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (id === 'sparkles') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 26; i++) {
        const seed = i * 7.3;
        const x = rand(seed) * width;
        const y = rand(seed + 3) * height;
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * (1.1 + rand(seed + 6)) + seed));
        const size = (3 + rand(seed + 2) * 10) * twinkle;
        ctx.globalAlpha = twinkle * 0.85;
        ctx.fillStyle = i % 3 === 0 ? '#ffe4a3' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.quadraticCurveTo(x, y, x + size, y);
        ctx.quadraticCurveTo(x, y, x, y + size);
        ctx.quadraticCurveTo(x, y, x - size, y);
        ctx.quadraticCurveTo(x, y, x, y - size);
        ctx.fill();
      }
      ctx.restore();
    } else if (id === 'snow') {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 65; i++) {
        const seed = i * 11.7;
        const speed = 0.025 + rand(seed + 4) * 0.06;
        const y = ((rand(seed + 1) + time * speed) % 1.1) * height - height * 0.05;
        const x = rand(seed) * width + Math.sin(time + i) * 18;
        const size = 1.2 + rand(seed + 5) * 4;
        ctx.globalAlpha = 0.35 + rand(seed + 8) * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (id === 'bokeh') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 18; i++) {
        const seed = i * 4.9;
        const x = rand(seed) * width + Math.sin(time * 0.15 + i) * 40;
        const y = rand(seed + 1) * height + Math.cos(time * 0.2 + i) * 24;
        const radius = 16 + rand(seed + 2) * 70;
        const color = i % 3 === 0 ? '116,245,209' : i % 3 === 1 ? '255,194,126' : '160,170,255';
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(${color},${0.12 + rand(seed + 7) * 0.12})`);
        gradient.addColorStop(0.7, `rgba(${color},.045)`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (id === 'vhs') {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000000';
      for (let y = 0; y < height; y += 5) ctx.fillRect(0, y, width, 2);
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#72f5d1';
      ctx.fillRect(0, 0, width, height);
      const band = ((time * 0.22) % 1) * height;
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, band, width, height * 0.03);
      ctx.restore();
    } else if (id === 'glitch') {
      ctx.save();
      const pulse = Math.sin(time * 9) * 0.5 + 0.5;
      if (pulse > 0.55) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ff2a79';
        ctx.fillRect(0, height * 0.2, width, height * 0.02);
        ctx.fillStyle = '#3cf7df';
        ctx.fillRect(0, height * 0.72, width, height * 0.018);
      }
      const sliceY = Math.floor(rand(Math.floor(time * 8)) * height);
      const sliceH = 6 + Math.floor(rand(Math.floor(time * 8) + 2) * 32);
      try { ctx.drawImage(ctx.canvas, 0, sliceY, width, sliceH, Math.sin(time * 20) * 22, sliceY, width, sliceH); } catch {}
      ctx.restore();
    } else if (id === 'confetti') {
      ctx.save();
      const colors = ['#ff7a90', '#ffd166', '#72f5d1', '#8f9dff', '#ff9f68'];
      for (let i = 0; i < 55; i++) {
        const seed = i * 8.1;
        const speed = 0.045 + rand(seed + 2) * 0.08;
        const y = ((rand(seed + 1) + time * speed) % 1.12) * height;
        const x = rand(seed) * width + Math.sin(time * 1.5 + i) * 30;
        const size = 4 + rand(seed + 4) * 9;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * (1 + rand(seed + 7)) + i);
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = 0.8;
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        ctx.restore();
      }
      ctx.restore();
    }
  }
}

export const canvasRenderer = new CanvasRenderer();

export function clipVisualState(clip: Clip, local: number): AnimatedValues {
  return animatedValues(clip, local);
}

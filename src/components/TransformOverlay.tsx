import { useEffect, useRef, useState } from 'react';
import type { Clip, Project } from '../types';
import { useEditorStore } from '../store/editorStore';
import { clipVisualState } from '../engine/canvasRenderer';
import { clamp } from '../lib/utils';

type DragMode = 'move' | 'scale' | 'rotate';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  startAngle: number;
  startDistance: number;
  origX: number;
  origY: number;
  origScale: number;
  origRotation: number;
}

const HANDLES = [
  { id: 'nw', x: 0, y: 0 },
  { id: 'ne', x: 1, y: 0 },
  { id: 'sw', x: 0, y: 1 },
  { id: 'se', x: 1, y: 1 }
] as const;

export function TransformOverlay({
  clip, project, frameWidth, frameHeight
}: {
  clip: Clip;
  project: Project;
  frameWidth: number;
  frameHeight: number;
}) {
  const playhead = useEditorStore((state) => state.playhead);
  const beginEdit = useEditorStore((state) => state.beginEdit);
  const endEdit = useEditorStore((state) => state.endEdit);
  const updateClip = useEditorStore((state) => state.updateClip);
  const [drag, setDrag] = useState<DragState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const local = clamp(playhead - clip.start, 0, clip.duration);
  const state = clipVisualState(clip, local);
  const scale = state.scale;
  const rotation = state.rotation;
  const centerX = (0.5 + state.x) * frameWidth;
  const centerY = (0.5 + state.y) * frameHeight;

  let boxWidth = project.width * scale;
  let boxHeight = project.height * scale;
  if (clip.kind === 'text') {
    const style = clip.text;
    if (style) {
      const fontSize = style.fontSize * (project.height / 1080) * scale;
      const lines = style.content.split('\n');
      let longest = 1;
      for (const line of lines) longest = Math.max(longest, line.length);
      boxWidth = Math.min(style.maxWidth * project.width * scale, longest * fontSize * 0.54 + style.paddingX * 2 * scale);
      boxHeight = Math.max(1, lines.length) * fontSize * style.lineHeight + style.paddingY * 2 * scale;
    }
  } else if (clip.kind === 'sticker') {
    boxWidth = project.height * 0.17 * scale;
    boxHeight = boxWidth;
  } else if (clip.kind === 'shape') {
    boxWidth = project.height * 0.16 * scale;
    boxHeight = boxWidth;
  }
  const displayWidth = Math.max(18, (boxWidth / project.width) * frameWidth);
  const displayHeight = Math.max(18, (boxHeight / project.height) * frameHeight);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (drag.mode === 'move') {
        const nextX = drag.origX + (event.clientX - drag.startX) / frameWidth;
        const nextY = drag.origY + (event.clientY - drag.startY) / frameHeight;
        updateClip(clip.id, { x: Number(nextX.toFixed(4)), y: Number(nextY.toFixed(4)) }, false);
      } else if (drag.mode === 'scale') {
        const distance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
        const nextScale = clamp((drag.origScale * distance) / Math.max(1, drag.startDistance), 0.04, 8);
        updateClip(clip.id, { scale: Number(nextScale.toFixed(4)) }, false);
      } else {
        const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX);
        let delta = ((angle - drag.startAngle) * 180) / Math.PI;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        updateClip(clip.id, { rotation: Math.round(drag.origRotation + delta) }, false);
      }
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      endEdit();
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, clip.id, frameWidth, frameHeight, updateClip, endEdit]);

  const startDrag = (mode: DragMode, event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (clip.locked) return;
    const parent = overlayRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const cx = rect.left + centerX;
    const cy = rect.top + centerY;
    beginEdit();
    setDrag({
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX: cx,
      centerY: cy,
      startAngle: Math.atan2(event.clientY - cy, event.clientX - cx),
      startDistance: Math.hypot(event.clientX - cx, event.clientY - cy),
      origX: state.x,
      origY: state.y,
      origScale: scale,
      origRotation: rotation
    });
  };

  return (
    <div className="transform-overlay" ref={overlayRef} aria-hidden="true">
      <div
        className={`transform-box ${drag ? 'is-dragging' : ''}`}
        style={{
          left: centerX,
          top: centerY,
          width: displayWidth,
          height: displayHeight,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`
        }}
        onPointerDown={(event) => startDrag('move', event)}
      >
        <span className="transform-label">{clip.name}</span>
        {HANDLES.map((handle) => (
          <span
            key={handle.id}
            className={`transform-handle handle-${handle.id}`}
            style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%` }}
            onPointerDown={(event) => startDrag('scale', event)}
          />
        ))}
        <span className="transform-rotate-stem" />
        <span className="transform-handle handle-rotate" onPointerDown={(event) => startDrag('rotate', event)}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </span>
      </div>
    </div>
  );
}

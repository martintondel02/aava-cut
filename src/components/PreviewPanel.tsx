import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, ChevronsLeft, ChevronsRight, Grid3X3, Maximize2, Pause, Play, ScanLine,
  StepBack, StepForward, Volume2, VolumeX
} from 'lucide-react';
import { useEditorStore, selectSelectedClip } from '../store/editorStore';
import { formatTime, formatTimecode, projectDuration } from '../lib/utils';
import { canvasRenderer } from '../engine/canvasRenderer';
import { mediaPool } from '../engine/mediaPool';
import type { Clip, Project } from '../types';
import { TransformOverlay } from './TransformOverlay';

export function PreviewPanel() {
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const playhead = useEditorStore((state) => state.playhead);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const masterVolume = useEditorStore((state) => state.masterVolume);
  const showSafeArea = useEditorStore((state) => state.showSafeArea);
  const showGrid = useEditorStore((state) => state.showGrid);
  const selectedClip = useEditorStore(selectSelectedClip);
  const exportOpen = useEditorStore((state) => state.exportOpen);
  const togglePlayback = useEditorStore((state) => state.togglePlayback);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setMasterVolume = useEditorStore((state) => state.setMasterVolume);
  const setShowSafeArea = useEditorStore((state) => state.setShowSafeArea);
  const setShowGrid = useEditorStore((state) => state.setShowGrid);
  const selectClip = useEditorStore((state) => state.selectClip);

  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState({ width: 640, height: 360 });
  const latest = useRef({ project, assets, playhead, isPlaying, masterVolume });
  latest.current = { project, assets, playhead, isPlaying, masterVolume };

  const duration = project ? projectDuration(project) : 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const current = latest.current;
    if (!canvas || !current.project) return;
    canvasRenderer.draw(canvas, current.project, current.playhead, current.assets, current.isPlaying, current.masterVolume);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const longEdge = 1280;
    const ratio = project.width / project.height;
    let width = ratio >= 1 ? longEdge : Math.round(longEdge * ratio);
    let height = ratio >= 1 ? Math.round(longEdge / ratio) : longEdge;
    width = Math.max(2, width - (width % 2));
    height = Math.max(2, height - (height % 2));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [project?.width, project?.height]);

  useEffect(() => {
    draw();
  }, [project, playhead, isPlaying, masterVolume, draw]);

  useEffect(() => {
    if (exportOpen) {
      mediaPool.onMediaUpdate = null;
      return;
    }
    mediaPool.onMediaUpdate = draw;
    void document.fonts.ready.then(draw);
    draw();
    return () => {
      if (mediaPool.onMediaUpdate === draw) mediaPool.onMediaUpdate = null;
    };
  }, [draw, exportOpen]);

  useEffect(() => () => mediaPool.pauseAll(), []);

  useEffect(() => {
    if (isPlaying && project) {
      void mediaPool.ensureContext().resume();
    }
  }, [isPlaying, project?.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !project) return;
    const compute = () => {
      const paddingX = window.innerWidth < 1280 ? 34 : 52;
      const paddingY = 36;
      const availableWidth = Math.max(180, stage.clientWidth - paddingX * 2);
      const availableHeight = Math.max(120, stage.clientHeight - paddingY * 2);
      const scale = Math.min(availableWidth / project.width, availableHeight / project.height);
      setFrame({ width: Math.max(120, project.width * scale), height: Math.max(80, project.height * scale) });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(stage);
    window.addEventListener('resize', compute);
    return () => { observer.disconnect(); window.removeEventListener('resize', compute); };
  }, [project?.width, project?.height]);

  const toggle = () => {
    if (!project) return;
    if (!isPlaying) void mediaPool.ensureContext().resume();
    togglePlayback();
  };

  const step = (direction: number) => {
    if (!project) return;
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(duration, playhead + direction / project.fps)));
  };

  const jump = (toEnd: boolean) => {
    setPlaying(false);
    setPlayhead(toEnd ? duration : 0);
  };

  const snapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-frame-${formatTimecode(playhead).replace(/:/g, '-')}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const fullscreen = () => {
    shellRef.current?.requestFullscreen?.();
  };

  if (!project) {
    return <div className="preview-panel preview-loading"><div className="loading-ring" /></div>;
  }

  const ratioLabel = project.width / project.height > 1.5 ? 'WIDESCREEN' : project.width === project.height ? 'SQUARE' : 'VERTICAL';

  return (
    <section className={`preview-panel ${isPlaying ? 'is-playing' : ''}`}>
      <div className="preview-head">
        <div className="preview-head-left">
          <span className="program-dot" />
          <span className="eyebrow">Program monitor</span>
          <span className="preview-head-divider" />
          <span className="preview-meta">{project.width} × {project.height}</span>
          <span className="preview-meta">{project.fps} fps</span>
          <span className="preview-format-badge">{ratioLabel}</span>
        </div>
        <div className="preview-head-right">
          <button type="button" className={`icon-btn ${showSafeArea ? 'is-active' : ''}`} title="Safe margins" onClick={() => setShowSafeArea(!showSafeArea)}>
            <ScanLine size={16} />
          </button>
          <button type="button" className={`icon-btn ${showGrid ? 'is-active' : ''}`} title="Rule of thirds" onClick={() => setShowGrid(!showGrid)}>
            <Grid3X3 size={16} />
          </button>
          <button type="button" className="icon-btn" title="Save current frame" onClick={snapshot}>
            <Camera size={16} />
          </button>
          <button type="button" className="icon-btn" title="Fullscreen preview" onClick={fullscreen}>
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      <div className="preview-stage" ref={stageRef}>
        <div className="preview-stage-glow" />
        <div
          className="canvas-shell"
          ref={shellRef}
          style={{ width: `${frame.width}px`, height: `${frame.height}px` }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) selectClip(null);
          }}
        >
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            onPointerDown={() => selectClip(null)}
          />
          {showGrid && (
            <div className="overlay-grid" aria-hidden="true">
              <span className="v1" /><span className="v2" /><span className="h1" /><span className="h2" />
            </div>
          )}
          {showSafeArea && (
            <div className="overlay-safe" aria-hidden="true">
              <div className="safe-outer" />
              <div className="safe-inner" />
            </div>
          )}
          {selectedClip && !isPlaying && playhead >= selectedClip.start && playhead < selectedClip.start + selectedClip.duration && (
            <TransformOverlay
              clip={selectedClip}
              project={project}
              frameWidth={frame.width}
              frameHeight={frame.height}
            />
          )}
          <div className="canvas-furniture">
            <span className="canvas-tc">{formatTimecode(playhead, project.fps)}</span>
            <span className="canvas-status">{isPlaying ? 'PLAYING' : 'READY'}</span>
          </div>
          {!isPlaying && <div className="canvas-watermark">{project.name}</div>}
        </div>
      </div>

      <div className="transport">
        <div className="transport-time">
          <span className="transport-current">{formatTimecode(playhead, project.fps)}</span>
          <span className="transport-duration">/ {formatTimecode(duration, project.fps)}</span>
          <span className="transport-frame">{Math.round(playhead * project.fps)}f</span>
        </div>
        <div className="transport-controls">
          <button type="button" className="transport-btn" title="Jump to start (Home)" onClick={() => jump(false)}>
            <ChevronsLeft size={18} />
          </button>
          <button type="button" className="transport-btn" title="Previous frame (←)" onClick={() => step(-1)}>
            <StepBack size={17} />
          </button>
          <button type="button" className="play-button" onClick={toggle} title="Play / pause (Space)">
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" className="transport-btn" title="Next frame (→)" onClick={() => step(1)}>
            <StepForward size={17} />
          </button>
          <button type="button" className="transport-btn" title="Jump to end (End)" onClick={() => jump(true)}>
            <ChevronsRight size={18} />
          </button>
        </div>
        <div className="transport-right">
          <button type="button" className="transport-btn volume-btn" title={masterVolume ? 'Mute preview' : 'Unmute preview'} onClick={() => setMasterVolume(masterVolume ? 0 : 0.8)}>
            {masterVolume ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <input
            type="range"
            className="volume-range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            title="Preview volume"
            onChange={(event) => setMasterVolume(Number(event.target.value))}
            style={{ '--range-progress': `${masterVolume * 100}%` } as React.CSSProperties}
          />
        </div>
      </div>
    </section>
  );
}

function estimateTextBox(clip: Clip, project: Project): { width: number; height: number } {
  const style = clip.text;
  if (!style) return { width: project.width * 0.4, height: project.height * 0.15 };
  const fontSize = style.fontSize * (project.height / 1080) * clip.scale;
  const maxWidth = style.maxWidth * project.width;
  const lines = style.content.split('\n');
  let longest = 1;
  for (const line of lines) longest = Math.max(longest, line.length);
  const estimatedWidth = Math.min(maxWidth, longest * fontSize * 0.54 + style.paddingX * 2);
  const estimatedHeight = Math.max(1, lines.length) * fontSize * style.lineHeight + style.paddingY * 2;
  return { width: Math.max(80, estimatedWidth), height: Math.max(44, estimatedHeight) };
}

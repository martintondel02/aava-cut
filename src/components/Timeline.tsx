import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, ChevronDown, Copy, CopyPlus, Diamond, Eye, EyeOff, Film, GripVertical, Layers, Lock, Magnet, Maximize2, Minus,
  MoreHorizontal, MoveLeft, Music2, Plus, Scissors, Trash2, Type, Unlock, Volume2, VolumeX, X, ZoomIn, ZoomOut
} from 'lucide-react';
import type { Clip, Keyframe, MediaAsset, Project, Track, TrackKind } from '../types';
import { useEditorStore } from '../store/editorStore';
import { clamp, formatTime, formatTimecode, projectDuration, snapTime } from '../lib/utils';
import { supportsTrack } from '../lib/clips';
import { EASING_OPTIONS, channelForClip, channelsForClip, propertyColor, propertyLabel } from '../lib/keyframes';
import type { KeyframeChannel } from '../lib/keyframes';
import { useSettingsStore } from '../store/settingsStore';
import { TimelineWaveform } from './Waveform';

const RULER_HEIGHT = 30;
const TRACK_HEIGHT: Record<TrackKind, number> = { text: 42, overlay: 46, video: 60, audio: 48 };
const TRACK_COLORS: Record<TrackKind, string> = { text: '#ffc76b', overlay: '#b99aff', video: '#62e6c1', audio: '#68a8ff' };
const TRACK_PALETTE = ['#62e6c1', '#68a8ff', '#b99aff', '#ffc76b', '#ff91ad', '#ff9f6b'];

type DragMode = 'move' | 'trim-left' | 'trim-right';

let draggingTrackId: string | null = null;

interface ClipDrag {
  pointerId: number;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  origStart: number;
  origEnd: number;
  origDuration: number;
  origTrimIn: number;
  origTrackId: string;
  origKeyframes: Keyframe[];
}

function trackHeight(track: Track): number {
  return TRACK_HEIGHT[track.kind];
}

function buildSnapCandidates(project: Project, clipId: string, playhead: number): number[] {
  const values = [0, playhead];
  for (const clip of project.clips) {
    if (clip.id === clipId) continue;
    values.push(clip.start, clip.start + clip.duration);
  }
  return values;
}

function overlaps(project: Project, clipId: string, trackId: string, start: number, duration: number): boolean {
  return project.clips.some((clip) =>
    clip.id !== clipId &&
    clip.trackId === trackId &&
    start < clip.start + clip.duration - 0.02 &&
    start + duration > clip.start + 0.02
  );
}

export function Timeline() {
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const playhead = useEditorStore((state) => state.playhead);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const zoom = useEditorStore((state) => state.zoom);
  const snapping = useEditorStore((state) => state.snapping);
  const showWaveforms = useSettingsStore((state) => state.showWaveforms);
  const agentRuntime = useEditorStore((state) => state.agentRuntime);
  const uiScale = useSettingsStore((state) => state.scale / 100);
  const selectedClipIds = useEditorStore((state) => state.selectedClipIds);
  const selectedKeyframe = useEditorStore((state) => state.selectedKeyframe);
  const selectKeyframe = useEditorStore((state) => state.selectKeyframe);
  const updateKeyframe = useEditorStore((state) => state.updateKeyframe);
  const removeKeyframe = useEditorStore((state) => state.removeKeyframe);
  const addKeyframeAt = useEditorStore((state) => state.addKeyframeAt);
  const addKeyframe = useEditorStore((state) => state.addKeyframe);
  const autoExpandKeyframes = useSettingsStore((state) => state.autoExpandKeyframes);
  const setZoom = useEditorStore((state) => state.setZoom);
  const setTimelineHeight = useEditorStore((state) => state.setTimelineHeight);
  const followPlayhead = useSettingsStore((state) => state.followPlayhead);
  const rippleDelete = useSettingsStore((state) => state.rippleDelete);
  const updateSettings = useSettingsStore((state) => state.update);
  const setSnapping = useEditorStore((state) => state.setSnapping);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const selectClip = useEditorStore((state) => state.selectClip);
  const setSelectedClipIds = useEditorStore((state) => state.setSelectedClipIds);
  const splitSelected = useEditorStore((state) => state.splitSelected);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const copySelected = useEditorStore((state) => state.copySelected);
  const addText = useEditorStore((state) => state.addText);
  const addTrack = useEditorStore((state) => state.addTrack);
  const updateClip = useEditorStore((state) => state.updateClip);
  const updateTrack = useEditorStore((state) => state.updateTrack);
  const removeTrack = useEditorStore((state) => state.removeTrack);
  const reorderTrack = useEditorStore((state) => state.reorderTrack);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const extractAudio = useEditorStore((state) => state.extractAudio);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const fitOnce = useRef<string | null>(null);
  const previousTrackCount = useRef<number | null>(null);
  const scrubbing = useRef(false);
  const scrubPointer = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ trackId: string; time: number } | null>(null);
  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [keyframeMenuOpen, setKeyframeMenuOpen] = useState(false);
  const [cornerAddOpen, setCornerAddOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const addTrackRef = useRef<HTMLDivElement>(null);
  const keyframeMenuRef = useRef<HTMLDivElement>(null);
  const cornerAddRef = useRef<HTMLDivElement>(null);

  const duration = project ? projectDuration(project) : 10;
  const selectedClip = project?.clips.find((clip) => clip.id === selectedClipIds[0]) || null;
  const selectedFrame = selectedClip && selectedKeyframe?.clipId === selectedClip.id
    ? selectedClip.keyframes.find((frame) => frame.id === selectedKeyframe.keyframeId) || null
    : null;
  const selectedChannel = selectedClip && selectedFrame ? channelForClip(selectedClip, selectedFrame.property) : null;
  const selectedLanes = selectedClip && autoExpandKeyframes
    ? channelsForClip(selectedClip).filter((channel) => selectedClip.keyframes.some((frame) => frame.property === channel.id))
    : [];
  const expandedTrackId = selectedLanes.length ? selectedClip!.trackId : null;
  const keyframeLaneExtra = selectedLanes.length * 15 + 20;
  const tracks = useMemo(() => project?.tracks || [], [project?.tracks]);
  const trackLayout = useMemo(() => {
    let cursor = 0;
    return tracks.map((track) => {
      const baseHeight = trackHeight(track);
      const extra = track.id === expandedTrackId ? keyframeLaneExtra : 0;
      const height = baseHeight + extra;
      const item = { track, height, top: cursor, baseHeight, extra };
      cursor += height;
      return item;
    });
  }, [tracks, expandedTrackId, keyframeLaneExtra]);
  const tracksHeight = trackLayout.reduce((sum, item) => sum + item.height, 0);
  const contentWidth = Math.max((duration + 7) * zoom, Math.max(480, viewportWidth));

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const update = () => setViewportWidth(scroll.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || Math.abs(event.deltaY) < 0.01) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = scroller.getBoundingClientRect();
      const localX = (event.clientX - rect.left) / uiScale;
      const pointerX = localX + scroller.scrollLeft;
      const timeAtPointer = pointerX / Math.max(1, zoom);
      const nextZoom = clamp(zoom * Math.exp(-event.deltaY * 0.0016), 12, 220);
      if (Math.abs(nextZoom - zoom) < 0.01) return;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, timeAtPointer * nextZoom - localX);
        });
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [zoom, uiScale, setZoom]);

  const fitToView = useCallback(() => {
    const viewport = scrollRef.current?.clientWidth || 1200;
    const next = clamp((viewport - 54) / Math.max(1, duration + 2), 12, 220);
    setZoom(next);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [duration, setZoom]);

  useEffect(() => {
    if (!project) return;
    if (fitOnce.current !== project.id) {
      fitOnce.current = project.id;
      requestAnimationFrame(fitToView);
    }
  }, [project?.id, fitToView]);

  useEffect(() => {
    if (previousTrackCount.current === null) {
      previousTrackCount.current = tracks.length;
      const needed = RULER_HEIGHT + tracksHeight + 48;
      const current = useEditorStore.getState().timelineHeight;
      if (current < needed) setTimelineHeight(Math.min(400, needed + 2));
      return;
    }
    if (tracks.length > previousTrackCount.current) {
      const needed = RULER_HEIGHT + tracksHeight + 48;
      const current = useEditorStore.getState().timelineHeight;
      if (current < needed) setTimelineHeight(Math.min(400, needed + 2));
    }
    previousTrackCount.current = tracks.length;
  }, [tracks.length, tracksHeight, setTimelineHeight]);

  useEffect(() => {
    if (!isPlaying || !scrollRef.current || !followPlayhead) return;
    const scroll = scrollRef.current;
    const x = playhead * zoom;
    const viewLeft = scroll.scrollLeft;
    const visible = scroll.clientWidth;
    if (x > viewLeft + visible - 60) scroll.scrollLeft = Math.max(0, x - visible + 180);
    else if (x < viewLeft + 24) scroll.scrollLeft = Math.max(0, x - 80);
  }, [playhead, isPlaying, zoom, followPlayhead]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  useEffect(() => {
    if (!addTrackOpen) return;
    const close = (event: PointerEvent) => {
      if (!addTrackRef.current?.contains(event.target as Node)) setAddTrackOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [addTrackOpen]);

  useEffect(() => {
    if (!keyframeMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!keyframeMenuRef.current?.contains(event.target as Node)) setKeyframeMenuOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [keyframeMenuOpen]);

  useEffect(() => {
    if (!cornerAddOpen) return;
    const close = (event: PointerEvent) => {
      if (!cornerAddRef.current?.contains(event.target as Node)) setCornerAddOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [cornerAddOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null); };
    const onPointer = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.context-menu')) setContextMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [contextMenu]);

  const timeFromClientX = useCallback((clientX: number): number => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp((clientX - rect.left) / (zoom * uiScale), 0, duration + 6);
  }, [zoom, duration, uiScale]);

  const trackIdFromClientY = useCallback((clientY: number): string | null => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const localY = (clientY - rect.top) / uiScale;
    for (const item of trackLayout) {
      if (localY >= item.top && localY < item.top + item.height) return item.track.id;
    }
    return null;
  }, [trackLayout, uiScale]);

  const beginMarquee = (event: React.PointerEvent) => {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return;
    const target = event.target as HTMLElement;
    if (target.closest('.timeline-clip, .timeline-playhead, .ruler-playhead')) return;
    const content = contentRef.current;
    if (!content) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = content.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / uiScale;
    const startY = (event.clientY - rect.top) / uiScale;
    const base: string[] = [];
    let moved = false;
    const update = (clientX: number, clientY: number) => {
      const x = (clientX - rect.left) / uiScale;
      const y = (clientY - rect.top) / uiScale;
      if (!moved && Math.hypot(x - startX, y - startY) < 4) return;
      moved = true;
      const box = {
        left: Math.min(startX, x), top: Math.min(startY, y),
        right: Math.max(startX, x), bottom: Math.max(startY, y)
      };
      setMarquee({ x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top });
      const hits: string[] = [];
      content.querySelectorAll<HTMLElement>('.timeline-clip[data-clip-id]').forEach((node) => {
        const id = node.dataset.clipId;
        if (!id) return;
        const nodeRect = node.getBoundingClientRect();
        const left = (nodeRect.left - rect.left) / uiScale;
        const top = (nodeRect.top - rect.top) / uiScale;
        const right = (nodeRect.right - rect.left) / uiScale;
        const bottom = (nodeRect.bottom - rect.top) / uiScale;
        if (right >= box.left && left <= box.right && bottom >= box.top && top <= box.bottom) hits.push(id);
      });
      setSelectedClipIds([...new Set([...base, ...hits])]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setMarquee(null);
    };
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const beginScrub = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setPlaying(false);
    const update = (clientX: number) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPlayhead(clamp((clientX - rect.left) / (zoom * uiScale), 0, duration));
    };
    update(event.clientX);
    scrubbing.current = true;
    scrubPointer.current = event.pointerId;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== scrubPointer.current) return;
      update(moveEvent.clientX);
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== scrubPointer.current) return;
      scrubbing.current = false;
      scrubPointer.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleDrop = (event: React.DragEvent, track: Track, height: number) => {
    event.preventDefault();
    const assetId = event.dataTransfer.getData('application/x-lumacut-asset') || event.dataTransfer.getData('text/plain');
    const rect = contentRef.current?.getBoundingClientRect();
    const time = rect ? clamp((event.clientX - rect.left) / (zoom * uiScale), 0, duration + 5) : playhead;
    setDropTarget(null);
    if (assetId) {
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) return;
      const targetTrack = canDropOnTrack(asset, track) ? track.id : undefined;
      addAssetToTimeline(assetId, time, targetTrack);
    }
    void height;
  };

  const contextClip = project && contextMenu ? project.clips.find((clip) => clip.id === contextMenu.clipId) || null : null;
  const contextAsset = contextClip?.assetId ? assets.find((asset) => asset.id === contextClip.assetId) || null : null;
  const canExtractAudio = Boolean(contextClip && contextClip.kind === 'video' && contextAsset?.hasAudio !== false);

  const tickStep = chooseTickStep(zoom);
  const ticks = [];
  for (let t = 0; t <= duration + 7; t += tickStep) ticks.push(t);
  const minorStep = tickStep / 5;
  const minorTicks = [];
  for (let t = 0; t <= duration + 7; t += minorStep) minorTicks.push(t);

  if (!project) return null;

  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div className="timeline-tool-group">
          <button type="button" className="timeline-tool" onClick={() => splitSelected()} title="Split at playhead (B)">
            <Scissors size={15} /><span>Split</span>
          </button>
          <button type="button" className="timeline-tool" onClick={duplicateSelected} disabled={!selectedClipIds.length} title="Duplicate (Ctrl+D)">
            <CopyPlus size={15} /><span>Duplicate</span>
          </button>
          <button type="button" className="timeline-tool" onClick={copySelected} disabled={!selectedClipIds.length} title="Copy (Ctrl+C)">
            <Copy size={15} />
          </button>
          <button type="button" className="timeline-tool" onClick={deleteSelected} disabled={!selectedClipIds.length} title="Delete (Del)">
            <Trash2Icon />
          </button>
          <span className="toolbar-divider" />
          <button type="button" className="timeline-tool" onClick={() => addText('editorial', 'Your text here')} title="Add text at playhead">
            <Type size={15} /><span>Text</span>
          </button>
          <div className="add-track-wrap" ref={addTrackRef}>
            <button type="button" className="timeline-tool" onClick={() => setAddTrackOpen(!addTrackOpen)} title="Add a track">
              <Plus size={15} /><span>Track</span><ChevronDown size={11} />
            </button>
            {addTrackOpen && (
              <div className="popover add-track-menu">
                {(['video', 'overlay', 'text', 'audio'] as TrackKind[]).map((kind) => (
                  <button key={kind} type="button" onClick={() => { addTrack(kind); setAddTrackOpen(false); }}>
                    {kind === 'video' ? <Film size={14} /> : kind === 'overlay' ? <Layers size={14} /> : kind === 'text' ? <Type size={14} /> : <Music2 size={14} />}
                    {kind === 'video' ? 'Video track' : kind === 'overlay' ? 'Overlay track' : kind === 'text' ? 'Text track' : 'Audio track'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="keyframe-tool-wrap" ref={keyframeMenuRef}>
            <button type="button" className="timeline-tool" disabled={!selectedClip} onClick={() => setKeyframeMenuOpen(!keyframeMenuOpen)} title="Add a keyframe to the selected clip">
              <Diamond size={14} /><span>Keyframe</span><ChevronDown size={10} />
            </button>
            {keyframeMenuOpen && selectedClip && (
              <div className="popover keyframe-menu">
                <div className="popover-label">Add at playhead</div>
                {Array.from(new Set(channelsForClip(selectedClip).map((channel) => channel.group))).map((group) => (
                  <div className="keyframe-menu-group" key={group}>
                    <span>{group}</span>
                    {channelsForClip(selectedClip).filter((channel) => channel.group === group).map((channel) => {
                      const count = selectedClip.keyframes.filter((frame) => frame.property === channel.id).length;
                      return (
                        <button type="button" key={channel.id} onClick={() => { addKeyframe(selectedClip.id, channel.id); setKeyframeMenuOpen(false); }}>
                          <i style={{ background: channel.color }} />
                          <span>{channel.label}</span>
                          {count > 0 && <em>{count}</em>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedFrame && selectedClip && selectedChannel && (
          <div className="keyframe-selection-pill" style={{ '--kf-color': selectedChannel.color } as React.CSSProperties}>
            <Diamond size={10} />
            <span className="kf-pill-label">{selectedChannel.label}</span>
            <span className="kf-pill-time">{selectedFrame.time.toFixed(2)}s</span>
            <select
              value={selectedFrame.easing}
              title="Keyframe easing"
              onChange={(event) => updateKeyframe(selectedClip.id, selectedFrame.id, { easing: event.target.value as Keyframe['easing'] })}
            >
              {EASING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" className="kf-pill-remove" title="Remove keyframe" onClick={() => removeKeyframe(selectedClip.id, selectedFrame.id)}><Trash2 size={11} /></button>
            <button type="button" className="kf-pill-close" title="Clear keyframe selection" onClick={() => selectKeyframe(selectedClip.id, null)}><X size={11} /></button>
          </div>
        )}

        <div className="timeline-tool-group timeline-tool-right">
          <button type="button" className={`timeline-tool ${rippleDelete ? 'is-active' : ''}`} onClick={() => updateSettings({ rippleDelete: !rippleDelete })} title="Ripple delete: close gaps on the same track">
            <MoveLeft size={14} /> <span>Ripple</span>
          </button>
          <button type="button" className={`timeline-tool icon-only ${snapping ? 'is-active' : ''}`} onClick={() => setSnapping(!snapping)} title="Toggle snapping">
            <Magnet size={15} />
          </button>
          <span className="toolbar-divider" />
          <button type="button" className="timeline-tool icon-only" onClick={() => setZoom(clamp(zoom * 0.8, 12, 220))} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <input
            type="range"
            className="timeline-zoom-range"
            min={12}
            max={220}
            value={zoom}
            title="Timeline zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
            style={{ '--range-progress': `${((zoom - 12) / 208) * 100}%` } as React.CSSProperties}
          />
          <button type="button" className="timeline-tool icon-only" onClick={() => setZoom(clamp(zoom * 1.25, 12, 220))} title="Zoom in">
            <ZoomIn size={15} />
          </button>
          <button type="button" className="timeline-tool icon-only" onClick={fitToView} title="Fit timeline to view">
            <Maximize2 size={15} />
          </button>
          <span className="zoom-readout">{Math.round(zoom)} px/s</span>
        </div>
      </div>

      <div className="timeline-body">
        <div className="timeline-sidebar-pane">
          <div className="timeline-corner" style={{ height: RULER_HEIGHT }}>
            <span>TRACKS</span>
            <button type="button" className="corner-add" title="Add track" onClick={() => setCornerAddOpen(!cornerAddOpen)}><Plus size={13} /></button>
          </div>
          {cornerAddOpen && (
            <div className="popover corner-track-menu" ref={cornerAddRef}>
              {(['video', 'overlay', 'text', 'audio'] as TrackKind[]).map((kind) => (
                <button key={kind} type="button" onClick={() => { addTrack(kind); setCornerAddOpen(false); }}>
                  {kind === 'video' ? <Film size={14} /> : kind === 'overlay' ? <Layers size={14} /> : kind === 'text' ? <Type size={14} /> : <Music2 size={14} />}
                  {kind === 'video' ? 'Video track' : kind === 'overlay' ? 'Overlay track' : kind === 'text' ? 'Text track' : 'Audio track'}
                </button>
              ))}
            </div>
          )}
          <div className="timeline-sidebar-list" ref={sidebarListRef}>
            {trackLayout.map(({ track, height }) => (
              <TrackHeader
                key={track.id}
                track={track}
                height={height}
                clipCount={project.clips.filter((clip) => clip.trackId === track.id).length}
                onToggle={(patch) => updateTrack(track.id, patch)}
                onRemove={() => removeTrack(track.id)}
                onRename={(name) => updateTrack(track.id, { name })}
                onReorder={(sourceId, targetId, position) => reorderTrack(sourceId, targetId, position)}
              />
            ))}
          </div>
        </div>

        <div
          className="timeline-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            if (sidebarListRef.current) sidebarListRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
        >
          <div
            className="timeline-inner"
            style={{ width: contentWidth, height: RULER_HEIGHT + tracksHeight }}
          >
            <div
              className="timeline-ruler"
              ref={rulerRef}
              style={{ width: contentWidth, height: RULER_HEIGHT }}
              onPointerDown={beginScrub}
            >
              {minorTicks.map((time) => (
                <span key={`minor-${time}`} className="ruler-minor" style={{ left: time * zoom }} />
              ))}
              {ticks.map((time) => (
                <span key={time} className="ruler-tick" style={{ left: time * zoom }}>
                  <span className="ruler-label">{formatRulerLabel(time, tickStep)}</span>
                </span>
              ))}
              <span className="ruler-playhead" style={{ left: playhead * zoom }}><span /></span>
            </div>

            <div
              className="timeline-content"
              ref={contentRef}
              style={{ width: contentWidth, height: tracksHeight }}
              onPointerDown={beginMarquee}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                const trackId = trackIdFromClientY(event.clientY);
                if (trackId) setDropTarget({ trackId, time: timeFromClientX(event.clientX) });
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const trackId = trackIdFromClientY(event.clientY) || project.tracks[0]?.id;
                const track = project.tracks.find((item) => item.id === trackId);
                if (track) handleDrop(event, track, trackHeight(track));
              }}
            >
              {trackLayout.map(({ track, height, top }) => (
                <div
                  key={track.id}
                  className={`track-row track-${track.kind} ${track.hidden ? 'is-hidden' : ''} ${dropTarget?.trackId === track.id ? 'is-drop-target' : ''}`}
                  style={{ top, height }}
                  onClick={(event) => {
                    if (!scrubbing.current && !event.ctrlKey && !event.metaKey) setPlayhead(clamp(timeFromClientX(event.clientX), 0, duration));
                  }}
                >
                  <div className="track-row-grid" />
                  {dropTarget?.trackId === track.id && <span className="drop-indicator" style={{ left: dropTarget.time * zoom }} />}
                </div>
              ))}

              {project.clips.map((clip) => {
                const layout = trackLayout.find((item) => item.track.id === clip.trackId);
                if (!layout) return null;
                return (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    project={project}
                    assets={assets}
                    track={layout.track}
                    height={clip.id === selectedClip?.id && selectedLanes.length ? layout.height : layout.baseHeight}
                    top={layout.top}
                    zoom={zoom}
                    selected={selectedClipIds.includes(clip.id)}
                    keyframeLanes={clip.id === selectedClip?.id ? selectedLanes : []}
                    contentRef={contentRef}
                    trackAtY={trackIdFromClientY}
                    onSnapGuide={setSnapGuide}
                    onSelect={(additive) => selectClip(clip.id, additive)}
                    onContextMenu={(x, y) => {
                      selectClip(clip.id);
                      setContextMenu({ x, y, clipId: clip.id });
                    }}
                  />
                );
              })}

              {marquee && <div className="timeline-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
              <div className="timeline-playhead" style={{ left: playhead * zoom, height: tracksHeight }}>
                <span className="playhead-handle" />
              </div>
              {snapGuide !== null && <div className="snap-guide" style={{ left: snapGuide * zoom }}><span>snap</span></div>}
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          uiScale={uiScale}
          onClose={() => setContextMenu(null)}
          onSplit={() => { splitSelected(); setContextMenu(null); }}
          onDuplicate={() => { duplicateSelected(); setContextMenu(null); }}
          onCopy={() => { copySelected(); setContextMenu(null); }}
          onExtractAudio={() => {
            if (contextClip) extractAudio(contextClip.id);
            setContextMenu(null);
          }}
          canExtractAudio={canExtractAudio}
          onDelete={() => { deleteSelected(); setContextMenu(null); }}
          onTransition={() => {
            const clip = project.clips.find((item) => item.id === contextMenu.clipId);
            if (clip) { selectClip(clip.id); setActivePanel('transitions'); }
            setContextMenu(null);
          }}
          onAddFade={() => {
            const clip = project.clips.find((item) => item.id === contextMenu.clipId);
            if (clip) updateClip(clip.id, { fadeIn: 0.6, fadeOut: 0.6 });
            setContextMenu(null);
          }}
          onSpeed={(speed) => {
            const clip = project.clips.find((item) => item.id === contextMenu.clipId);
            if (clip) updateClip(clip.id, { speed });
            setContextMenu(null);
          }}
        />
      )}
    </section>
  );
}

function canDropOnTrack(asset: MediaAsset, track: Track): boolean {
  if (asset.kind === 'audio') return track.kind === 'audio';
  if (track.kind === 'video') return asset.kind === 'video' || asset.kind === 'image';
  if (track.kind === 'overlay') return asset.kind === 'video' || asset.kind === 'image';
  return false;
}

function formatRulerLabel(seconds: number, step: number): string {
  if (step < 1) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${minutes}:${secs.padStart(4, '0')}`;
  }
  return formatTime(seconds);
}

function chooseTickStep(zoom: number): number {
  const candidates = [0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const step of candidates) {
    if (step * zoom >= 76) return step;
  }
  return 60;
}

function Trash2Icon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </svg>
  );
}

function TrackHeader({
  track, height, clipCount, onToggle, onRemove, onRename, onReorder
}: {
  track: Track;
  height: number;
  clipCount: number;
  onToggle: (patch: Partial<Track>) => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
}) {
  const Icon = track.kind === 'audio' ? AudioLines : track.kind === 'text' ? Type : track.kind === 'overlay' ? Layers : Film;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(track.name);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  useEffect(() => setName(track.name), [track.name]);

  const commitName = () => {
    const next = name.trim();
    if (next && next !== track.name) onRename(next.slice(0, 80));
    else setName(track.name);
    setRenaming(false);
  };

  const requestRemove = () => {
    if (clipCount > 0 && !window.confirm(`Remove “${track.name}” and its ${clipCount} clip${clipCount === 1 ? '' : 's'}?`)) return;
    onRemove();
  };

  return (
    <div
      className={`track-header track-${track.kind} ${dropPosition ? `drop-${dropPosition}` : ''}`}
      style={{ height }}
      onDragOver={(event) => {
        if (!draggingTrackId || draggingTrackId === track.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const rect = event.currentTarget.getBoundingClientRect();
        setDropPosition(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPosition(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = draggingTrackId;
        if (source && source !== track.id) onReorder(source, track.id, dropPosition || 'before');
        draggingTrackId = null;
        setDropPosition(null);
      }}
    >
      <span className="track-accent" style={{ background: track.color || TRACK_COLORS[track.kind] }} />
      <span
        className="track-grip"
        title="Drag to reorder"
        draggable
        onDragStart={(event) => {
          draggingTrackId = track.id;
          event.dataTransfer.setData('application/x-lumacut-track', track.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => { draggingTrackId = null; setDropPosition(null); }}
      ><GripVertical size={11} /></span>
      <div className="track-header-icon"><Icon size={14} /></div>
      <div className="track-header-copy">
        {renaming ? (
          <input
            className="track-rename-input"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
              if (event.key === 'Escape') { setName(track.name); setRenaming(false); }
              event.stopPropagation();
            }}
          />
        ) : (
          <span className="track-name" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{track.name}</span>
        )}
        <span className="track-meta">{clipCount} clip{clipCount === 1 ? '' : 's'}</span>
      </div>
      <div className="track-actions">
        {(track.kind === 'audio' || track.kind === 'video') && (
          <button
            type="button"
            className={`track-action ${track.muted ? 'is-off' : ''}`}
            title={track.muted ? 'Unmute track' : 'Mute track'}
            onClick={(event) => { event.stopPropagation(); onToggle({ muted: !track.muted }); }}
          >
            {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        )}
        {(track.kind === 'audio' || track.kind === 'video') && (
          <button
            type="button"
            className={`track-action track-solo ${track.solo ? 'is-on' : ''}`}
            title={track.solo ? 'Unsolo track' : 'Solo track'}
            onClick={(event) => { event.stopPropagation(); onToggle({ solo: !track.solo }); }}
          >S</button>
        )}
        {track.kind !== 'audio' && (
          <button
            type="button"
            className={`track-action ${track.hidden ? 'is-off' : ''}`}
            title={track.hidden ? 'Show track' : 'Hide track'}
            onClick={(event) => { event.stopPropagation(); onToggle({ hidden: !track.hidden }); }}
          >
            {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
        <button
          type="button"
          className={`track-action ${track.locked ? 'is-on' : ''}`}
          title={track.locked ? 'Unlock track' : 'Lock track'}
          onClick={(event) => { event.stopPropagation(); onToggle({ locked: !track.locked }); }}
        >
          {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <div className="track-menu-wrap">
          <button type="button" className="track-action" title="Track options" onClick={(event) => { event.stopPropagation(); setMenuOpen(!menuOpen); }}>
            <MoreHorizontal size={13} />
          </button>
          {menuOpen && (
            <div className="popover track-menu" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => { onToggle({ locked: !track.locked }); setMenuOpen(false); }}>
                {track.locked ? <Unlock size={13} /> : <Lock size={13} />} {track.locked ? 'Unlock' : 'Lock'} track
              </button>
              <button type="button" onClick={() => { onToggle({ hidden: !track.hidden }); setMenuOpen(false); }}>
                {track.hidden ? <Eye size={13} /> : <EyeOff size={13} />} {track.hidden ? 'Show' : 'Hide'} track
              </button>
              <button type="button" onClick={() => { setRenaming(true); setMenuOpen(false); }}>
                <Type size={13} /> Rename track
              </button>
              <div className="track-color-row">
                <span>Track color</span>
                <div>
                  {TRACK_PALETTE.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={`track-swatch ${track.color === color ? 'is-active' : ''}`}
                      style={{ background: color }}
                      title="Use this track color"
                      onClick={() => { onToggle({ color }); setMenuOpen(false); }}
                    />
                  ))}
                </div>
              </div>
              <div className="popover-separator" />
              <button type="button" className="danger" onClick={() => { requestRemove(); setMenuOpen(false); }}>
                <X size={13} /> Remove track
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClipBlock({
  clip, project, assets, track, height, top, zoom, selected, keyframeLanes, contentRef, trackAtY, onSnapGuide, onSelect, onContextMenu
}: {
  clip: Clip;
  project: Project;
  assets: MediaAsset[];
  track: Track;
  height: number;
  top: number;
  zoom: number;
  selected: boolean;
  keyframeLanes: KeyframeChannel[];
  contentRef: React.RefObject<HTMLDivElement | null>;
  trackAtY: (clientY: number) => string | null;
  onSnapGuide: (time: number | null) => void;
  onSelect: (additive: boolean) => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const snapping = useEditorStore((state) => state.snapping);
  const selectedKeyframe = useEditorStore((state) => state.selectedKeyframe);
  const selectKeyframe = useEditorStore((state) => state.selectKeyframe);
  const updateKeyframe = useEditorStore((state) => state.updateKeyframe);
  const addKeyframeAt = useEditorStore((state) => state.addKeyframeAt);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const showWaveforms = useSettingsStore((state) => state.showWaveforms);
  const agentRuntime = useEditorStore((state) => state.agentRuntime);
  const uiScale = useSettingsStore((state) => state.scale / 100);
  const playhead = useEditorStore((state) => state.playhead);
  const beginEdit = useEditorStore((state) => state.beginEdit);
  const endEdit = useEditorStore((state) => state.endEdit);
  const updateClip = useEditorStore((state) => state.updateClip);
  const updateClipDeep = useEditorStore((state) => state.updateClipDeep);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const [drag, setDrag] = useState<ClipDrag | null>(null);
  const editStarted = useRef(false);
  const asset = clip.assetId ? assets.find((item) => item.id === clip.assetId) : null;
  const width = Math.max(10, clip.duration * zoom);
  const color = track.color || TRACK_COLORS[clip.kind === 'audio' ? 'audio' : clip.kind === 'text' ? 'text' : clip.kind === 'video' || clip.kind === 'image' ? 'video' : 'overlay'];
  const waveform = clip.kind === 'audio' && asset?.peaks;

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (!editStarted.current) {
        beginEdit();
        editStarted.current = true;
      }
      const dxSeconds = (event.clientX - drag.startClientX) / (zoom * uiScale);
      const candidates = buildSnapCandidates(project, clip.id, playhead);
      const threshold = 8 / zoom;
      if (drag.mode === 'move') {
        let nextStart = Math.max(0, drag.origStart + dxSeconds);
        let snapHit: number | null = null;
        if (snapping) {
          const startSnap = snapTime(nextStart, candidates, threshold);
          const endSnap = snapTime(nextStart + clip.duration, candidates, threshold) - clip.duration;
          if (Math.abs(startSnap - nextStart) <= Math.abs(endSnap - nextStart)) {
            if (startSnap !== nextStart) { nextStart = startSnap; snapHit = nextStart; }
          } else if (endSnap !== nextStart) {
            nextStart = endSnap;
            snapHit = endSnap + clip.duration;
          }
        }
        let targetTrackId = drag.origTrackId;
        const hoveredTrackId = trackAtY(event.clientY);
        if (hoveredTrackId && hoveredTrackId !== targetTrackId) {
          const hovered = project.tracks.find((item) => item.id === hoveredTrackId);
          if (hovered && supportsTrack(hovered, clip.kind) && !hovered.locked) targetTrackId = hovered.id;
        }
        if (overlaps(project, clip.id, targetTrackId, nextStart, clip.duration)) {
          onSnapGuide(null);
          return;
        }
        updateClip(clip.id, { start: Number(nextStart.toFixed(4)), trackId: targetTrackId }, false);
        onSnapGuide(snapHit);
      } else if (drag.mode === 'trim-left') {
        let nextStart = clamp(drag.origStart + dxSeconds, 0, drag.origEnd - 0.15);
        if (snapping) nextStart = snapTime(nextStart, candidates, threshold);
        const maxLeft = drag.origStart - drag.origTrimIn / Math.max(0.25, clip.speed);
        nextStart = Math.max(maxLeft, nextStart);
        nextStart = clamp(nextStart, 0, drag.origEnd - 0.15);
        const duration = drag.origEnd - nextStart;
        const trimIn = Math.max(0, drag.origTrimIn + (nextStart - drag.origStart) * clip.speed);
        const headDelta = nextStart - drag.origStart;
        updateClipDeep(clip.id, (target) => {
          target.start = Number(nextStart.toFixed(4));
          target.duration = Number(duration.toFixed(4));
          target.trimIn = Number(trimIn.toFixed(4));
          target.keyframes = drag.origKeyframes
            .filter((frame) => frame.time >= Math.max(0, headDelta) - 0.001)
            .map((frame) => ({ ...frame, time: Math.max(0, Number((frame.time - headDelta).toFixed(4))) }));
        }, false);
        onSnapGuide(nextStart);
      } else {
        let nextEnd = drag.origEnd + dxSeconds;
        const maxDuration = asset && (clip.kind === 'video' || clip.kind === 'audio') && asset.duration > 0
          ? Math.max(0.2, (asset.duration - clip.trimIn) / Math.max(0.25, clip.speed))
          : 120;
        nextEnd = clamp(nextEnd, drag.origStart + 0.15, drag.origStart + maxDuration);
        const nextClipStart = project.clips
          .filter((item) => item.id !== clip.id && item.trackId === clip.trackId && item.start > drag.origStart)
          .sort((a, b) => a.start - b.start)[0]?.start;
        if (nextClipStart !== undefined) nextEnd = Math.min(nextEnd, nextClipStart);
        if (snapping) nextEnd = snapTime(nextEnd, candidates, threshold);
        nextEnd = Math.max(drag.origStart + 0.15, nextEnd);
        const nextDuration = nextEnd - drag.origStart;
        updateClipDeep(clip.id, (target) => {
          target.duration = Number(nextDuration.toFixed(4));
          target.keyframes = drag.origKeyframes.filter((frame) => frame.time <= nextDuration + 0.001);
        }, false);
        onSnapGuide(nextEnd);
      }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (editStarted.current) endEdit();
      editStarted.current = false;
      setDrag(null);
      onSnapGuide(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, project, clip.id, clip.duration, clip.speed, clip.trimIn, clip.trackId, zoom, uiScale, snapping, playhead, trackAtY, updateClip, updateClipDeep, beginEdit, endEdit, onSnapGuide]);

  const startDrag = (mode: DragMode, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    if (track.locked) return;
    onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
    editStarted.current = false;
    setDrag({
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origStart: clip.start,
      origEnd: clip.start + clip.duration,
      origDuration: clip.duration,
      origTrimIn: clip.trimIn,
      origTrackId: clip.trackId,
      origKeyframes: clip.keyframes.map((frame) => ({ ...frame }))
    });
  };

  const thumbStyle: React.CSSProperties = asset?.thumbnail
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(4,8,12,.36), rgba(4,8,12,.02) 28%, rgba(4,8,12,.16)), url(${asset.thumbnail})`,
        backgroundSize: clip.kind === 'image' ? 'cover' : 'auto 100%',
        backgroundRepeat: clip.kind === 'image' ? 'no-repeat' : 'repeat-x',
        backgroundPosition: 'center'
      }
    : {};

  const startKeyframeDrag = (event: React.PointerEvent, frame: Keyframe) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(false);
    selectKeyframe(clip.id, frame.id);
    setPlayhead(clip.start + frame.time);
    const startX = event.clientX;
    const originTime = frame.time;
    let editing = false;
    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / (zoom * uiScale);
      if (!editing && Math.abs(moveEvent.clientX - startX) < 2) return;
      if (!editing) { beginEdit(); editing = true; }
      let nextTime = clamp(originTime + delta, 0, clip.duration);
      if (snapping) {
        const candidates = [
          0,
          clip.duration,
          playhead - clip.start,
          ...clip.keyframes.filter((item) => item.id !== frame.id).map((item) => item.time)
        ];
        nextTime = snapTime(nextTime, candidates, 6 / zoom);
      }
      updateKeyframe(clip.id, frame.id, { time: Number(nextTime.toFixed(4)) }, false);
      onSnapGuide(clip.start + nextTime);
    };
    const up = () => {
      if (editing) endEdit();
      onSnapGuide(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const addLaneKeyframe = (event: React.MouseEvent, lane: KeyframeChannel) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const time = clamp((event.clientX - rect.left) / (zoom * uiScale), 0, clip.duration);
    addKeyframeAt(clip.id, lane.id, time);
    setPlayhead(clip.start + time);
  };

  const collapsedKeyframes = keyframeLanes.length === 0 && clip.keyframes.length > 0;

  return (
    <div
      data-clip-id={clip.id}
      className={`timeline-clip clip-${clip.kind} ${selected ? 'is-selected' : ''} ${track.hidden ? 'is-track-hidden' : ''} ${drag ? 'is-dragging' : ''} ${clip.caption ? 'is-caption' : ''} ${agentRuntime.changedIds.includes(clip.id) ? 'is-agent-touched' : ''}`}
      style={{ left: clip.start * zoom, top: top + 4, width, height: height - 8, '--clip-color': color } as React.CSSProperties}
      onPointerDown={(event) => startDrag('move', event)}
      onDoubleClick={(event) => { event.stopPropagation(); if (clip.kind === 'text') setActivePanel('text'); }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(event.clientX, event.clientY);
      }}
      title={`${clip.name} · ${clip.duration.toFixed(2)}s`}
    >
      <div className="clip-surface" style={thumbStyle}>
        {waveform && showWaveforms && (
          <TimelineWaveform
            peaks={asset?.peaks}
            color="#a8ffe6"
            bars={Math.max(30, Math.min(260, Math.round(width / 4)))}
            trimStart={asset?.duration ? clip.trimIn / asset.duration : 0}
            trimEnd={asset?.duration ? Math.min(1, (clip.trimIn + clip.duration * clip.speed) / asset.duration) : 1}
          />
        )}
        {clip.kind === 'text' && (
          <div className="clip-text-preview">
            <Type size={13} />
            <span>{clip.text?.content.replace(/\n/g, ' ') || 'Text'}</span>
          </div>
        )}
        {clip.kind === 'sticker' && <div className="clip-sticker-preview">{clip.sticker}</div>}
        {clip.kind === 'shape' && <div className={`clip-shape-preview shape-${clip.shape}`} />}
        {!waveform && clip.kind !== 'text' && clip.kind !== 'sticker' && clip.kind !== 'shape' && (
          <div className="clip-label-row">
            <span className="clip-kind-dot" style={{ background: color }} />
            <span className="clip-name">{clip.name}</span>
            {clip.speed !== 1 && <span className="clip-chip">{clip.speed.toFixed(2)}×</span>}
          </div>
        )}
        {clip.caption && <span className="caption-badge">CC</span>}
        {clip.filter !== 'none' && <span className="clip-filter-badge">GRADE</span>}
        {clip.effects.length > 0 && <span className="clip-effect-count">FX {clip.effects.length}</span>}
        {clip.transition && (
          <button
            type="button"
            className="clip-transition-badge"
            title={`${clip.transition.type} transition`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onSelect(false); setActivePanel('transitions'); }}
          >
            <Layers size={10} />
            {clip.transition.duration.toFixed(1)}s
          </button>
        )}
        {keyframeLanes.length > 0 && (
          <div className="clip-keyframe-area" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="clip-keyframe-head">
              <span><Diamond size={8} /> {clip.keyframes.length} keyframes</span>
              <span>double-click a lane to add</span>
            </div>
            {keyframeLanes.map((lane) => {
              const frames = clip.keyframes.filter((frame) => frame.property === lane.id).sort((a, b) => a.time - b.time);
              return (
                <div className="keyframe-lane" key={lane.id} onDoubleClick={(event) => addLaneKeyframe(event, lane)} title={`${lane.label} — double-click to add a keyframe`}>
                  <span className="keyframe-lane-label" style={{ '--lane-color': lane.color } as React.CSSProperties}><i style={{ background: lane.color }} />{lane.label}</span>
                  <span className="keyframe-lane-rule" />
                  {frames.map((frame) => (
                    <button
                      type="button"
                      key={frame.id}
                      className={`keyframe-block ${selectedKeyframe?.clipId === clip.id && selectedKeyframe.keyframeId === frame.id ? 'is-selected' : ''}`}
                      style={{ left: frame.time * zoom, '--kf-color': lane.color } as React.CSSProperties}
                      title={`${lane.label} · ${frame.time.toFixed(2)}s · ${frame.easing}`}
                      onPointerDown={(event) => startKeyframeDrag(event, frame)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {collapsedKeyframes && (
          <div className="clip-keyframe-collapsed" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            {clip.keyframes.map((frame) => {
              const color = channelForClip(clip, frame.property)?.color || '#72f5d1';
              return (
                <button
                  type="button"
                  key={frame.id}
                  className={`keyframe-block ${selectedKeyframe?.clipId === clip.id && selectedKeyframe.keyframeId === frame.id ? 'is-selected' : ''}`}
                  style={{ left: frame.time * zoom, '--kf-color': color } as React.CSSProperties}
                  title={`${propertyLabel(clip, frame.property)} · ${frame.time.toFixed(2)}s`}
                  onPointerDown={(event) => startKeyframeDrag(event, frame)}
                  onClick={(event) => event.stopPropagation()}
                />
              );
            })}
          </div>
        )}
        {selected && (
          <>
            <span className="trim-handle trim-left" onPointerDown={(event) => startDrag('trim-left', event)} />
            <span className="trim-handle trim-right" onPointerDown={(event) => startDrag('trim-right', event)} />
            <span className="clip-duration-readout">{clip.duration.toFixed(2)}s</span>
          </>
        )}
      </div>
      {clip.keyframes.length > 0 && <span className="keyframe-count">{clip.keyframes.length}◇</span>}
    </div>
  );
}

function ClipContextMenu({
  x, y, uiScale, canExtractAudio, onClose, onSplit, onDuplicate, onCopy, onExtractAudio, onDelete, onTransition, onAddFade, onSpeed
}: {
  x: number;
  y: number;
  uiScale: number;
  canExtractAudio: boolean;
  onClose: () => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onExtractAudio: () => void;
  onDelete: () => void;
  onTransition: () => void;
  onAddFade: () => void;
  onSpeed: (speed: number) => void;
}) {
  return (
    <div className="context-menu" style={{ left: Math.min(x / uiScale, window.innerWidth / uiScale - 240), top: Math.min(y / uiScale, window.innerHeight / uiScale - 380) }} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={onSplit}><Scissors size={14} /> Split at playhead <kbd>B</kbd></button>
      <button type="button" onClick={onDuplicate}><CopyPlus size={14} /> Duplicate <kbd>⌘D</kbd></button>
      <button type="button" onClick={onCopy}><Copy size={14} /> Copy <kbd>⌘C</kbd></button>
      {canExtractAudio && <button type="button" onClick={onExtractAudio}><Music2 size={14} /> Extract audio & mute clip</button>}
      <button type="button" onClick={onDelete} className="danger"><Trash2Icon /> Delete <kbd>Del</kbd></button>
      <div className="popover-separator" />
      <button type="button" onClick={onTransition}><Layers size={14} /> Change transition</button>
      <button type="button" onClick={onAddFade}><SparkleIcon /> Add video fade</button>
      <div className="popover-separator" />
      <div className="context-label">Speed</div>
      <div className="speed-quick-row">
        {[0.5, 1, 1.5, 2].map((speed) => (
          <button type="button" key={speed} onClick={() => onSpeed(speed)}>{speed}×</button>
        ))}
      </div>
      <button type="button" onClick={onClose}><X size={14} /> Close</button>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="m12 3 1.9 5.6L19.5 11l-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9L12 3Z" />
    </svg>
  );
}

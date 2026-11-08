import { useRef } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Aperture, Captions, CircleDot, Clock3, CopyPlus, Diamond, Download,
  Check, Film, FlipHorizontal2, FlipVertical2, Gauge, Image as ImageIcon, KeyRound, Layers, Monitor, Music2,
  Palette, RotateCcw, Scissors, Shapes, SlidersHorizontal, Sparkles, Sticker, Trash2, Type, Volume2, X
} from 'lucide-react';
import { FONT_OPTIONS, FILTERS, EFFECTS, TRANSITIONS, ASPECT_PRESETS, TEXT_PRESETS } from '../types';
import type { Clip, Keyframe } from '../types';
import { selectSelectedClip, useEditorStore } from '../store/editorStore';
import { EASING_OPTIONS, channelsForClip, effectChannelId, propertyLabel } from '../lib/keyframes';
import { ColorField, IconButton, Section, Segmented, SliderRow, ToggleRow } from './ui';
import { formatTime, formatTimecode, projectDuration } from '../lib/utils';

const ANIMATIONS = ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'spin'] as const;
const ANIMATION_LABELS: Record<string, string> = {
  none: 'None', fade: 'Fade', 'slide-left': 'Slide left', 'slide-right': 'Slide right',
  'slide-up': 'Slide up', 'slide-down': 'Slide down', zoom: 'Zoom', spin: 'Spin'
};
const BLENDS = ['source-over', 'screen', 'multiply', 'overlay', 'soft-light', 'lighten', 'darken', 'color-dodge'] as const;
const TEXT_ANIMATIONS = ['none', 'fade', 'slide-up', 'slide-down', 'zoom', 'typewriter', 'pop', 'bounce'] as const;

export function Inspector() {
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const clip = useEditorStore(selectSelectedClip);
  const extractAudio = useEditorStore((state) => state.extractAudio);
  const playhead = useEditorStore((state) => state.playhead);
  const beginEdit = useEditorStore((state) => state.beginEdit);
  const endEdit = useEditorStore((state) => state.endEdit);
  const updateClip = useEditorStore((state) => state.updateClip);
  const updateTrack = useEditorStore((state) => state.updateTrack);
  const updateTextStyle = useEditorStore((state) => state.updateTextStyle);
  const updateClipDeep = useEditorStore((state) => state.updateClipDeep);
  const selectClip = useEditorStore((state) => state.selectClip);
  const splitSelected = useEditorStore((state) => state.splitSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const setFilter = useEditorStore((state) => state.setFilter);
  const toggleEffect = useEditorStore((state) => state.toggleEffect);
  const setEffectIntensity = useEditorStore((state) => state.setEffectIntensity);
  const addEffectFade = useEditorStore((state) => state.addEffectFade);
  const addClipFade = useEditorStore((state) => state.addClipFade);
  const setTransition = useEditorStore((state) => state.setTransition);
  const addKeyframe = useEditorStore((state) => state.addKeyframe);
  const removeKeyframe = useEditorStore((state) => state.removeKeyframe);
  const updateKeyframe = useEditorStore((state) => state.updateKeyframe);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setAspect = useEditorStore((state) => state.setAspect);
  const setBackground = useEditorStore((state) => state.setBackground);
  const setFps = useEditorStore((state) => state.setFps);
  const openExport = useEditorStore((state) => state.openExport);
  const exportProjectFile = useEditorStore((state) => state.exportProjectFile);
  const newProject = useEditorStore((state) => state.newProject);
  const openHelp = () => window.dispatchEvent(new CustomEvent('lumacut:shortcuts'));
  const editing = useRef(false);

  const begin = () => {
    if (!editing.current) { beginEdit(); editing.current = true; }
  };
  const commit = () => {
    if (editing.current) { endEdit(); editing.current = false; }
  };

  if (!project) return <aside className="inspector" />;

  if (!clip) {
    const totalClips = project.clips.length;
    const videoClips = project.clips.filter((item) => item.kind === 'video' || item.kind === 'image').length;
    return (
      <aside className="inspector">
        <div className="inspector-head">
          <div>
            <span className="eyebrow">Properties</span>
            <h2>Project</h2>
          </div>
          <button type="button" className="icon-btn" title="Project options" onClick={newProject}><RotateCcw size={15} /></button>
        </div>
        <div className="inspector-scroll inspector-project">
          <div className="project-hero">
            <div className="project-hero-art">
              <span className="project-ratio-mark" style={{ aspectRatio: `${project.width}/${project.height}` }} />
              <span className="project-hero-sheen" />
            </div>
            <div className="project-hero-copy">
              <span className="eyebrow">Canvas</span>
              <strong>{project.width} × {project.height}</strong>
              <span>{project.width / project.height > 1.5 ? 'Widescreen master' : project.width === project.height ? 'Square master' : 'Vertical master'} · {project.fps} fps</span>
            </div>
          </div>

          <Section title="Canvas format">
            <div className="aspect-grid">
              {ASPECT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={preset.width === project.width && preset.height === project.height ? 'is-active' : ''}
                  aria-pressed={preset.width === project.width && preset.height === project.height}
                  title={`${preset.label} ${preset.id} · ${preset.width} × ${preset.height}`}
                  onClick={() => setAspect(preset.width, preset.height)}
                >
                  <span className={`ratio-shape ratio-${preset.id.replace(':', '-')}`} />
                  {preset.width === project.width && preset.height === project.height && (
                    <span className="aspect-check" aria-hidden="true"><Check size={11} strokeWidth={2.5} /></span>
                  )}
                  <span className="aspect-name">{preset.label}</span>
                  <span className="aspect-id">{preset.id}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Frame rate">
            <Segmented
              options={[{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }]}
              value={project.fps}
              onChange={setFps}
            />
            <p className="section-note">Export can use a different frame rate. 30 fps is the master used for timecode.</p>
          </Section>

          <Section title="Background">
            <ColorField label="Canvas color" value={project.background} onChange={setBackground} />
            <div className="color-swatches">
              {['#03070b', '#000000', '#FFFFFF', '#0B1F2A', '#241A2C', '#F4E5D3'].map((color) => (
                <button key={color} type="button" style={{ background: color }} onClick={() => setBackground(color)} title={color} />
              ))}
            </div>
          </Section>

          <Section title="Project overview">
            <div className="stats-grid">
              <div><span>Duration</span><strong>{formatTime(projectDuration(project))}</strong></div>
              <div><span>Clips</span><strong>{totalClips}</strong></div>
              <div><span>Footage</span><strong>{videoClips}</strong></div>
              <div><span>Tracks</span><strong>{project.tracks.length}</strong></div>
            </div>
            <div className="project-assets-line">
              <ImageIcon size={13} />
              <span>{assets.length} source assets in library</span>
            </div>
          </Section>

          <div className="inspector-export-card">
            <div className="export-card-glow" />
            <span className="eyebrow">Ready when you are</span>
            <strong>Render your cut</strong>
            <p>H.264 MP4 at up to 4K, straight to your Downloads or project folder.</p>
            <button type="button" className="btn btn-primary wide-btn" onClick={openExport}><Download size={15} /> Export video</button>
            <button type="button" className="panel-link-row compact" onClick={exportProjectFile}>Download project file →</button>
          </div>

          <div className="inspector-footer-links">
            <button type="button" onClick={openHelp}><KeyRound size={13} /> Keyboard shortcuts</button>
            <button type="button" onClick={newProject}><RotateCcw size={13} /> Start a new project</button>
          </div>
        </div>
      </aside>
    );
  }

  const asset = clip.assetId ? assets.find((item) => item.id === clip.assetId) : null;
  const icon = clip.kind === 'text' ? Type : clip.kind === 'audio' ? Music2 : clip.kind === 'sticker' ? Sticker : clip.kind === 'shape' ? Shapes : Film;
  const Icon = icon;
  const siblings = project.clips.filter((item) => item.trackId === clip.trackId).sort((a, b) => a.start - b.start);
  const isFirst = siblings[0]?.id === clip.id;
  const maxTrim = asset?.duration || 60;
  const isVisual = clip.kind !== 'audio';
  const keyframeChannels = channelsForClip(clip);
  const clipTrack = project.tracks.find((track) => track.id === clip.trackId);
  const channelGroups = Array.from(new Set(keyframeChannels.map((channel) => channel.group)));

  const speedChange = (speed: number, history = false) => {
    const clamped = Math.max(0.25, Math.min(4, speed));
    const natural = clip.duration * clip.speed;
    const duration = Math.max(0.15, Math.min(120, natural / clamped));
    updateClip(clip.id, { speed: Number(clamped.toFixed(2)), duration: Number(duration.toFixed(3)) }, history);
  };

  return (
    <aside className="inspector">
      <div className="inspector-head clip-inspector-head">
        <div className="clip-inspector-id">
          <span className={`clip-inspector-icon clip-icon-${clip.kind}`}><Icon size={16} /></span>
          <div>
            <span className="eyebrow">{clip.kind === 'video' ? 'Video clip' : clip.kind === 'image' ? 'Photo clip' : clip.kind === 'audio' ? 'Audio clip' : clip.caption ? 'Caption' : clip.kind}</span>
            <input
              className="clip-name-input"
              value={clip.name}
              onChange={(event) => updateClip(clip.id, { name: event.target.value }, false)}
              onFocus={begin}
              onBlur={commit}
            />
          </div>
        </div>
        <div className="clip-head-actions">
          <button type="button" className="icon-btn" title="Split" onClick={() => splitSelected()}><Scissors size={14} /></button>
          <button type="button" className="icon-btn" title="Duplicate" onClick={() => duplicateSelected()}><CopyPlus size={14} /></button>
          <button type="button" className="icon-btn danger" title="Delete" onClick={() => deleteSelected()}><Trash2 size={14} /></button>
          <button type="button" className="icon-btn" title="Deselect" onClick={() => selectClip(null)}><X size={14} /></button>
        </div>
      </div>

      <div className="inspector-scroll">
        <div className="clip-timing-strip">
          <div><span>Start</span><strong>{formatTimecode(clip.start, project.fps)}</strong></div>
          <div><span>End</span><strong>{formatTimecode(clip.start + clip.duration, project.fps)}</strong></div>
          <div><span>Duration</span><strong>{clip.duration.toFixed(2)}s</strong></div>
        </div>

        {isVisual && (
          <Section title="Transform">
            <SliderRow
              label="Position X" suffix="%" value={clip.x * 100} min={-75} max={75} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { x: value / 100 }, false)}
              onReset={() => updateClip(clip.id, { x: 0 })}
            />
            <SliderRow
              label="Position Y" suffix="%" value={clip.y * 100} min={-75} max={75} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { y: value / 100 }, false)}
              onReset={() => updateClip(clip.id, { y: 0 })}
            />
            <SliderRow
              label="Scale" suffix="%" value={clip.scale * 100} min={4} max={300} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { scale: value / 100 }, false)}
              onReset={() => updateClip(clip.id, { scale: 1 })}
            />
            <SliderRow
              label="Rotation" suffix="°" value={clip.rotation} min={-180} max={180} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { rotation: value }, false)}
              onReset={() => updateClip(clip.id, { rotation: 0 })}
            />
            <SliderRow
              label="Opacity" suffix="%" value={clip.opacity * 100} min={0} max={100} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { opacity: value / 100 }, false)}
              onReset={() => updateClip(clip.id, { opacity: 1 })}
            />
            <div className="two-col-row">
              <button type="button" className={`tool-toggle ${clip.flipH ? 'is-active' : ''}`} onClick={() => updateClip(clip.id, { flipH: !clip.flipH })}>
                <FlipHorizontal2 size={14} /> Flip H
              </button>
              <button type="button" className={`tool-toggle ${clip.flipV ? 'is-active' : ''}`} onClick={() => updateClip(clip.id, { flipV: !clip.flipV })}>
                <FlipVertical2 size={14} /> Flip V
              </button>
            </div>
            <label className="select-row">
              <span className="field-label">Blend mode</span>
              <select value={clip.blend} onChange={(event) => updateClip(clip.id, { blend: event.target.value as Clip['blend'] })}>
                {BLENDS.map((blend) => <option key={blend} value={blend}>{blend === 'source-over' ? 'Normal' : blend.replace('-', ' ')}</option>)}
              </select>
            </label>
            {clip.kind === 'image' && (
              <ToggleRow label="Ken Burns motion" checked={Boolean(clip.kenBurns)} onChange={(checked) => updateClip(clip.id, { kenBurns: checked })} hint="Slow push-in on photos" />
            )}
          </Section>
        )}

        {isVisual && (
          <Section title="Adjust" defaultOpen={false}>
            <SliderRow
              label="Brightness" suffix="%" value={clip.adjust?.brightness || 0} min={-60} max={60} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), brightness: value } }, false)}
              onReset={() => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), brightness: 0 } })}
            />
            <SliderRow
              label="Contrast" suffix="%" value={clip.adjust?.contrast || 0} min={-60} max={60} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), contrast: value } }, false)}
              onReset={() => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), contrast: 0 } })}
            />
            <SliderRow
              label="Saturation" suffix="%" value={clip.adjust?.saturation || 0} min={-100} max={100} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), saturation: value } }, false)}
              onReset={() => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), saturation: 0 } })}
            />
            <SliderRow
              label="Temperature" suffix="%" value={clip.adjust?.temperature || 0} min={-100} max={100} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), temperature: value } }, false)}
              onReset={() => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), temperature: 0 } })}
            />
            <SliderRow
              label="Hue" suffix="°" value={clip.adjust?.hue || 0} min={-90} max={90} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), hue: value } }, false)}
              onReset={() => updateClip(clip.id, { adjust: { ...(clip.adjust || { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 }), hue: 0 } })}
            />
            <button type="button" className="tool-toggle" onClick={() => updateClip(clip.id, { adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 } })}>
              <Aperture size={13} /> Reset adjustments
            </button>
          </Section>
        )}

        {clip.kind === 'text' && clip.text && (
          <Section title="Typography">
            <textarea
              className="text-content-input"
              value={clip.text.content}
              rows={3}
              onChange={(event) => updateTextStyle(clip.id, { content: event.target.value }, false)}
              onFocus={begin}
              onBlur={commit}
              placeholder="Type your title…"
            />
            <label className="select-row">
              <span className="field-label">Font</span>
              <select value={clip.text.fontFamily} onChange={(event) => updateTextStyle(clip.id, { fontFamily: event.target.value })}>
                {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
              </select>
            </label>
            <SliderRow
              label="Size" suffix="px" value={clip.text.fontSize} min={12} max={260} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateTextStyle(clip.id, { fontSize: value }, false)}
              onReset={() => updateTextStyle(clip.id, { fontSize: 84 })}
            />
            <Segmented
              options={[{ value: 400, label: 'Regular' }, { value: 600, label: 'Semi' }, { value: 700, label: 'Bold' }, { value: 900, label: 'Black' }]}
              value={clip.text.fontWeight}
              onChange={(value) => updateTextStyle(clip.id, { fontWeight: value })}
            />
            <div className="two-col-row align-colors">
              <ColorField label="Text color" value={clip.text.color === 'transparent' ? '#ffffff' : clip.text.color} onChange={(value) => updateTextStyle(clip.id, { color: value }, false)} />
              <div className="align-buttons">
                <button type="button" className={clip.text.align === 'left' ? 'is-active' : ''} onClick={() => updateTextStyle(clip.id, { align: 'left' })}><AlignLeft size={15} /></button>
                <button type="button" className={clip.text.align === 'center' ? 'is-active' : ''} onClick={() => updateTextStyle(clip.id, { align: 'center' })}><AlignCenter size={15} /></button>
                <button type="button" className={clip.text.align === 'right' ? 'is-active' : ''} onClick={() => updateTextStyle(clip.id, { align: 'right' })}><AlignRight size={15} /></button>
              </div>
            </div>
            <SliderRow
              label="Line height" value={clip.text.lineHeight} min={0.75} max={2} step={0.01}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateTextStyle(clip.id, { lineHeight: value }, false)}
            />
            <SliderRow
              label="Letter spacing" suffix="px" value={clip.text.letterSpacing} min={-12} max={30} step={0.5}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateTextStyle(clip.id, { letterSpacing: value }, false)}
            />
            <SliderRow
              label="Text width" suffix="%" value={clip.text.maxWidth * 100} min={20} max={100} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateTextStyle(clip.id, { maxWidth: value / 100 }, false)}
            />
            <div className="two-col-row align-colors">
              <ColorField label="Stroke" value={clip.text.strokeColor} onChange={(value) => updateTextStyle(clip.id, { strokeColor: value }, false)} />
              <SliderRow
                label="Width" value={clip.text.strokeWidth} min={0} max={8} step={0.5}
                onStart={begin} onCommit={commit}
                onChange={(value) => updateTextStyle(clip.id, { strokeWidth: value }, false)}
              />
            </div>
            <ToggleRow label="Drop shadow" checked={clip.text.shadow} onChange={(checked) => updateTextStyle(clip.id, { shadow: checked })} />
            <ColorField label="Box color" value={clip.text.background} onChange={(value) => updateTextStyle(clip.id, { background: value }, false)} />
            <SliderRow
              label="Box opacity" suffix="%" value={clip.text.backgroundOpacity * 100} min={0} max={100} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateTextStyle(clip.id, { backgroundOpacity: value / 100 }, false)}
              onReset={() => updateTextStyle(clip.id, { backgroundOpacity: 0 })}
            />
            <div className="two-col-row">
              <ToggleRow label="Uppercase" checked={clip.text.uppercase} onChange={(checked) => updateTextStyle(clip.id, { uppercase: checked })} />
              <ToggleRow label="Italic" checked={clip.text.italic} onChange={(checked) => updateTextStyle(clip.id, { italic: checked })} />
            </div>
            <label className="select-row">
              <span className="field-label">Text animation</span>
              <select value={clip.text.animation} onChange={(event) => updateTextStyle(clip.id, { animation: event.target.value as typeof clip.text.animation })}>
                {TEXT_ANIMATIONS.map((animation) => <option key={animation} value={animation}>{animation === 'none' ? 'None' : animation.replace('-', ' ')}</option>)}
              </select>
            </label>
            <div className="preset-inline-row">
              {TEXT_PRESETS.slice(0, 4).map((preset) => (
                <button key={preset.id} type="button" onClick={() => updateTextStyle(clip.id, {
                  fontFamily: preset.style.fontFamily,
                  fontWeight: preset.style.fontWeight,
                  fontSize: preset.style.fontSize,
                  color: preset.style.color,
                  letterSpacing: preset.style.letterSpacing,
                  lineHeight: preset.style.lineHeight,
                  uppercase: preset.style.uppercase,
                  backgroundOpacity: preset.style.backgroundOpacity
                })}>{preset.name}</button>
              ))}
            </div>
          </Section>
        )}

        {clip.kind === 'shape' && (
          <Section title="Shape style">
            <ColorField label="Fill color" value={clip.shapeColor || '#72f5d1'} onChange={(value) => updateClip(clip.id, { shapeColor: value }, false)} />
            <div className="color-swatches">
              {['#72f5d1', '#ffce7a', '#ff7a9e', '#9b8cff', '#ffffff', '#0b1117'].map((color) => (
                <button key={color} type="button" style={{ background: color }} onClick={() => updateClip(clip.id, { shapeColor: color })} title={color} />
              ))}
            </div>
          </Section>
        )}

        {clip.kind === 'sticker' && (
          <Section title="Sticker">
            <div className="sticker-preview-large">{clip.sticker}</div>
            <p className="section-note">Scale, rotate and keyframe your sticker from the Transform and Keyframes sections.</p>
          </Section>
        )}

        <Section title="Speed & timing">
          <div className="speed-presets">
            {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
              <button type="button" key={speed} className={clip.speed === speed ? 'is-active' : ''} onClick={() => speedChange(speed, true)}>{speed}×</button>
            ))}
          </div>
          <SliderRow
            label="Speed" suffix="×" value={clip.speed} min={0.25} max={4} step={0.05}
            onStart={begin} onCommit={commit}
            onChange={(value) => speedChange(value)}
            onReset={() => speedChange(1, true)}
            format={() => `${clip.duration.toFixed(2)}s on timeline`}
          />
          <div className="timing-fields">
            <label><span>Start</span><input type="number" min={0} step={0.05} value={Number(clip.start.toFixed(2))} onChange={(event) => updateClip(clip.id, { start: Math.max(0, Number(event.target.value)) }, false)} onFocus={begin} onBlur={commit} /></label>
            <label><span>Duration</span><input type="number" min={0.15} step={0.05} value={Number(clip.duration.toFixed(2))} onChange={(event) => updateClip(clip.id, { duration: Math.max(0.15, Number(event.target.value)) }, false)} onFocus={begin} onBlur={commit} /></label>
            <label><span>Trim in</span><input type="number" min={0} max={maxTrim} step={0.05} value={Number(clip.trimIn.toFixed(2))} onChange={(event) => updateClip(clip.id, { trimIn: Math.max(0, Math.min(maxTrim, Number(event.target.value))) }, false)} onFocus={begin} onBlur={commit} /></label>
          </div>
          {clip.kind !== 'text' && clip.kind !== 'sticker' && clip.kind !== 'shape' && <p className="section-note">Changing speed keeps the same source range and adjusts the timeline duration.</p>}
        </Section>

        {(clip.kind === 'audio' || clip.kind === 'video') && (
          <Section title="Audio">
            <SliderRow
              label="Volume" suffix="%" value={clip.volume * 100} min={0} max={1000} step={1}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { volume: value / 100 }, false)}
              onReset={() => updateClip(clip.id, { volume: 1 })}
            />
            <SliderRow
              label="Fade in" suffix="s" value={clip.audioFadeIn} min={0} max={Math.min(5, clip.duration)} step={0.05}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { audioFadeIn: value }, false)}
              onReset={() => updateClip(clip.id, { audioFadeIn: 0 })}
            />
            <SliderRow
              label="Fade out" suffix="s" value={clip.audioFadeOut} min={0} max={Math.min(5, clip.duration)} step={0.05}
              onStart={begin} onCommit={commit}
              onChange={(value) => updateClip(clip.id, { audioFadeOut: value }, false)}
              onReset={() => updateClip(clip.id, { audioFadeOut: 0 })}
            />
            <div className="audio-level-meter"><span style={{ width: `${Math.min(100, clip.volume * 100)}%` }} /><i /><i /><i /><i /></div>
            <span className="field-hint">0–1000%. The master limiter protects the output from clipping above 100%.</span>
            {clipTrack && (
              <div className="track-tone-block">
                <div className="track-tone-head">
                  <span className="eyebrow">Track tone</span>
                  <div>
                    <button type="button" className={`solo-pill ${clipTrack.solo ? 'is-active' : ''}`} onClick={() => updateTrack(clipTrack.id, { solo: !clipTrack.solo })} title="Solo this track">S</button>
                    <span>{clipTrack.name}</span>
                  </div>
                </div>
                <SliderRow
                  label="Low" suffix="dB" value={clipTrack.eq?.low || 0} min={-12} max={12} step={1}
                  onStart={begin} onCommit={commit}
                  onChange={(value) => updateTrack(clipTrack.id, { eq: { low: value, mid: clipTrack.eq?.mid || 0, high: clipTrack.eq?.high || 0 } }, false)}
                />
                <SliderRow
                  label="Mid" suffix="dB" value={clipTrack.eq?.mid || 0} min={-12} max={12} step={1}
                  onStart={begin} onCommit={commit}
                  onChange={(value) => updateTrack(clipTrack.id, { eq: { low: clipTrack.eq?.low || 0, mid: value, high: clipTrack.eq?.high || 0 } }, false)}
                />
                <SliderRow
                  label="High" suffix="dB" value={clipTrack.eq?.high || 0} min={-12} max={12} step={1}
                  onStart={begin} onCommit={commit}
                  onChange={(value) => updateTrack(clipTrack.id, { eq: { low: clipTrack.eq?.low || 0, mid: clipTrack.eq?.mid || 0, high: value } }, false)}
                />
                <SliderRow
                  label="Track level" suffix="%" value={(clipTrack.gain ?? 1) * 100} min={0} max={1000} step={1}
                  onStart={begin} onCommit={commit}
                  onChange={(value) => updateTrack(clipTrack.id, { gain: value / 100 }, false)}
                  onReset={() => updateTrack(clipTrack.id, { gain: 1 })}
                />
              </div>
            )}
            <div className="keyframe-inline-row">
              <button type="button" onClick={() => addKeyframe(clip.id, 'volume')}><Diamond size={10} /> Volume keyframe</button>
              <button type="button" onClick={() => addClipFade(clip.id, 'audio')}>Fade in & out</button>
              {clip.kind === 'video' && clip.assetId && assets.find((asset) => asset.id === clip.assetId)?.hasAudio !== false && (
                <button type="button" onClick={() => extractAudio(clip.id)}><Music2 size={10} /> Extract audio & mute clip</button>
              )}
            </div>
          </Section>
        )}

        {isVisual && (
          <Section title="Color grade" defaultOpen={false}>
            <div className="inspector-filter-row">
              {FILTERS.map((filter) => (
                <button key={filter.id} type="button" className={clip.filter === filter.id ? 'is-active' : ''} onClick={() => setFilter(clip.id, filter.id)}>{filter.name}</button>
              ))}
            </div>
            {clip.filter !== 'none' && (
              <SliderRow
                label="Intensity" suffix="%" value={clip.filterIntensity} min={0} max={100} step={1}
                onStart={begin} onCommit={commit}
                onChange={(value) => updateClip(clip.id, { filterIntensity: value }, false)}
              />
            )}
            <div className="keyframe-inline-row">
              <button type="button" onClick={() => addKeyframe(clip.id, 'filterIntensity')}><Diamond size={10} /> Keyframe grade</button>
            </div>
          </Section>
        )}

        {isVisual && (
          <Section title="Effects" defaultOpen={false}>
            <div className="inspector-effect-row">
              {EFFECTS.map((effect) => (
                <button key={effect.id} type="button" className={clip.effects.some((layer) => layer.type === effect.id && layer.enabled) ? 'is-active' : ''} onClick={() => toggleEffect(clip.id, effect.id)}>{effect.name}</button>
              ))}
            </div>
            {clip.effects.filter((layer) => layer.enabled).map((layer) => {
              const definition = EFFECTS.find((effect) => effect.id === layer.type);
              return (
                <div className="inspector-effect-mixer" key={layer.id}>
                  <div className="effect-mixer-head">
                    <span className="effect-mixer-swatch" style={{ background: definition?.accent || '#b99aff' }} />
                    <strong>{definition?.name || layer.type}</strong>
                    <button type="button" onClick={() => toggleEffect(clip.id, layer.type)} title="Remove effect"><X size={11} /></button>
                  </div>
                  <SliderRow
                    label="Intensity" suffix="%" value={layer.intensity} min={0} max={100} step={1}
                    onStart={begin} onCommit={commit}
                    onChange={(value) => setEffectIntensity(clip.id, layer.type, value, false)}
                  />
                  <div className="keyframe-inline-row">
                    <button type="button" onClick={() => addEffectFade(clip.id, layer.type, 'in')}>Fade in</button>
                    <button type="button" onClick={() => addEffectFade(clip.id, layer.type, 'out')}>Fade out</button>
                    <button type="button" onClick={() => addKeyframe(clip.id, effectChannelId(layer))}><Diamond size={10} /> Key</button>
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        <Section title="Animation" defaultOpen={false}>
          <label className="select-row">
            <span className="field-label">Enter</span>
            <select
              value={clip.animationIn?.type || 'none'}
              onChange={(event) => updateClip(clip.id, { animationIn: event.target.value === 'none' ? undefined : { type: event.target.value as NonNullable<Clip['animationIn']>['type'], duration: clip.animationIn?.duration || 0.6 } })}
            >
              {ANIMATIONS.map((animation) => <option key={animation} value={animation}>{ANIMATION_LABELS[animation]}</option>)}
            </select>
          </label>
          <SliderRow
            label="Enter duration" suffix="s" value={clip.animationIn?.duration || 0.6} min={0.1} max={3} step={0.05}
            onStart={begin} onCommit={commit}
            onChange={(value) => updateClip(clip.id, { animationIn: { type: clip.animationIn?.type || 'fade', duration: value } }, false)}
          />
          <label className="select-row">
            <span className="field-label">Exit</span>
            <select
              value={clip.animationOut?.type || 'none'}
              onChange={(event) => updateClip(clip.id, { animationOut: event.target.value === 'none' ? undefined : { type: event.target.value as NonNullable<Clip['animationOut']>['type'], duration: clip.animationOut?.duration || 0.6 } })}
            >
              {ANIMATIONS.map((animation) => <option key={animation} value={animation}>{ANIMATION_LABELS[animation]}</option>)}
            </select>
          </label>
          <SliderRow
            label="Exit duration" suffix="s" value={clip.animationOut?.duration || 0.6} min={0.1} max={3} step={0.05}
            onStart={begin} onCommit={commit}
            onChange={(value) => updateClip(clip.id, { animationOut: { type: clip.animationOut?.type || 'fade', duration: value } }, false)}
          />
          <SliderRow
            label="Video fade in" suffix="s" value={clip.fadeIn} min={0} max={Math.min(5, clip.duration)} step={0.05}
            onStart={begin} onCommit={commit}
            onChange={(value) => updateClip(clip.id, { fadeIn: value }, false)}
          />
          <SliderRow
            label="Video fade out" suffix="s" value={clip.fadeOut} min={0} max={Math.min(5, clip.duration)} step={0.05}
            onStart={begin} onCommit={commit}
            onChange={(value) => updateClip(clip.id, { fadeOut: value }, false)}
          />
        </Section>

        {isVisual && (
          <Section title="Transition" defaultOpen={false}>
            {isFirst ? (
              <p className="section-note">This is the first clip on the track. Pick a later clip to add a transition.</p>
            ) : (
              <>
                <label className="select-row">
                  <span className="field-label">Transition in</span>
                  <select
                    value={clip.transition?.type || 'none'}
                    onChange={(event) => {
                      if (event.target.value === 'none') updateClip(clip.id, { transition: undefined });
                      else setTransition(clip.id, event.target.value, clip.transition?.duration || 0.7);
                    }}
                  >
                    <option value="none">None</option>
                    {TRANSITIONS.map((transition) => <option key={transition.id} value={transition.id}>{transition.name}</option>)}
                  </select>
                </label>
                {clip.transition && (
                  <SliderRow
                    label="Duration" suffix="s" value={clip.transition.duration} min={0.2} max={2} step={0.05}
                    onStart={begin} onCommit={commit}
                    onChange={(value) => setTransition(clip.id, clip.transition!.type, value)}
                  />
                )}
              </>
            )}
          </Section>
        )}

        <Section title="Keyframes" defaultOpen={clip.keyframes.length > 0}>
          <div className="keyframe-quick-actions">
            {isVisual && <button type="button" onClick={() => addClipFade(clip.id, 'visual')}><Diamond size={10} /> Opacity fade in & out</button>}
            {(clip.kind === 'audio' || clip.kind === 'video') && <button type="button" onClick={() => addClipFade(clip.id, 'audio')}><Diamond size={10} /> Volume fade in & out</button>}
          </div>
          <div className="keyframe-add-groups">
            {channelGroups.map((group) => (
              <div className="keyframe-add-group" key={group}>
                <span>{group}</span>
                <div className="keyframe-add-grid">
                  {keyframeChannels.filter((channel) => channel.group === group).map((channel) => {
                    const count = clip.keyframes.filter((frame) => frame.property === channel.id).length;
                    return (
                      <button type="button" key={channel.id} className={count ? 'has-keys' : ''} onClick={() => addKeyframe(clip.id, channel.id)} title={`Add ${channel.label} keyframe at playhead`}>
                        <Diamond size={10} /> {channel.label}{count ? ` · ${count}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {clip.keyframes.length ? (
            <div className="keyframe-list">
              {clip.keyframes.slice().sort((a, b) => a.time - b.time).map((frame) => (
                <div className="keyframe-row" key={frame.id}>
                  <button type="button" className="keyframe-jump" onClick={() => setPlayhead(clip.start + frame.time)}>
                    <Diamond size={10} />
                    <span>{propertyLabel(clip, frame.property)}</span>
                  </button>
                  <input
                    type="number"
                    step={0.01}
                    value={Number(frame.value.toFixed(2))}
                    onFocus={begin}
                    onBlur={commit}
                    onChange={(event) => updateKeyframe(clip.id, frame.id, { value: Number(event.target.value) })}
                  />
                  <span className="keyframe-time">{frame.time.toFixed(2)}s</span>
                  <select
                    className="keyframe-easing"
                    value={frame.easing}
                    title="Interpolation into this keyframe"
                    onChange={(event) => updateKeyframe(clip.id, frame.id, { easing: event.target.value as typeof frame.easing })}
                  >
                    {EASING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.short}</option>)}
                  </select>
                  <button type="button" className="keyframe-delete" onClick={() => removeKeyframe(clip.id, frame.id)}><X size={11} /></button>
                </div>
              ))}
            </div>
          ) : (
            <p className="section-note">Move the playhead inside the clip, then add a keyframe. Add two or more to animate.</p>
          )}
          {clip.keyframes.length > 0 && <div className="keyframe-hint"><Clock3 size={12} /> Pick an easing per keyframe, including spring and bounce.</div>}
        </Section>

        <div className="inspector-bottom-actions">
          <button type="button" className="btn btn-secondary" onClick={() => splitSelected()}><Scissors size={14} /> Split</button>
          <button type="button" className="btn btn-secondary" onClick={() => duplicateSelected()}><CopyPlus size={14} /> Duplicate</button>
        </div>
      </div>
    </aside>
  );
}

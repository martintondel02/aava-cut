import { useMemo, useRef, useState } from 'react';
import { Captions, Download, FileText, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { buildSrt, parseSrt, scriptToCues } from '../../lib/srt';
import { downloadBlob, formatTime } from '../../lib/utils';
import { AutoCaptions } from '../captions/AutoCaptions';

const STYLE_PRESETS = [
  {
    id: 'clean', name: 'Clean',
    patch: { fontFamily: 'Open Sans', fontWeight: 600, fontSize: 46, color: '#ffffff', background: '#05080c', backgroundOpacity: 0, paddingX: 12, paddingY: 8, radius: 6, uppercase: false, shadow: true, strokeWidth: 0 }
  },
  {
    id: 'boxed', name: 'Boxed',
    patch: { fontFamily: 'Open Sans', fontWeight: 600, fontSize: 44, color: '#ffffff', background: '#05080c', backgroundOpacity: 0.62, paddingX: 26, paddingY: 14, radius: 8, uppercase: false, shadow: false, strokeWidth: 0 }
  },
  {
    id: 'bold', name: 'Bold',
    patch: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 54, color: '#ffffff', background: '#05080c', backgroundOpacity: 0, paddingX: 10, paddingY: 8, radius: 4, uppercase: true, shadow: true, strokeWidth: 0 }
  },
  {
    id: 'highlight', name: 'Highlight',
    patch: { fontFamily: 'Open Sans', fontWeight: 700, fontSize: 44, color: '#071018', background: '#b9ffe8', backgroundOpacity: 0.95, paddingX: 26, paddingY: 12, radius: 7, uppercase: false, shadow: false, strokeWidth: 0 }
  }
];

export function CaptionsPanel() {
  const project = useEditorStore((state) => state.project);
  const playhead = useEditorStore((state) => state.playhead);
  const addCaption = useEditorStore((state) => state.addCaption);
  const importCaptions = useEditorStore((state) => state.importCaptions);
  const updateCaptionStyles = useEditorStore((state) => state.updateCaptionStyles);
  const mutateProject = useEditorStore((state) => state.mutateProject);
  const selectClip = useEditorStore((state) => state.selectClip);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const addToast = useEditorStore((state) => state.addToast);
  const [mode, setMode] = useState<'single' | 'script'>('single');
  const [singleText, setSingleText] = useState('');
  const [script, setScript] = useState('');
  const [duration, setDuration] = useState(3);
  const fileRef = useRef<HTMLInputElement>(null);

  const captions = useMemo(
    () => (project?.clips || []).filter((clip) => clip.caption).sort((a, b) => a.start - b.start),
    [project]
  );

  const addSingle = () => {
    if (!singleText.trim()) { addToast('Type a caption first', 'info'); return; }
    addCaption(singleText.trim(), playhead, duration);
    setSingleText('');
    addToast('Caption added at playhead', 'success');
  };

  const addScript = () => {
    if (!script.trim()) { addToast('Paste a script first', 'info'); return; }
    const cues = scriptToCues(script, playhead);
    importCaptions(cues);
    setScript('');
  };

  const exportSrt = () => {
    if (!captions.length) { addToast('There are no captions to export', 'info'); return; }
    const text = buildSrt(captions.map((clip) => ({
      start: clip.start,
      end: clip.start + clip.duration,
      text: clip.text?.content || ''
    })));
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${project?.name || 'caption'}-captions.srt`);
    addToast('SRT file downloaded', 'success');
  };

  return (
    <div className="panel-page captions-panel">
      <input
        ref={fileRef}
        type="file"
        accept=".srt,text/plain"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const cues = parseSrt(await file.text());
          if (!cues.length) { addToast('No valid cues found in that SRT', 'error'); return; }
          importCaptions(cues);
        }}
      />

      <div className="caption-hero">
        <span className="caption-hero-icon"><Captions size={20} /></span>
        <div>
          <span className="eyebrow">Caption studio</span>
          <strong>Make every word land</strong>
          <p>Type along the timeline or bring in an SRT. Captions live on their own editable track.</p>
        </div>
      </div>

      <AutoCaptions />

      <div className="segmented caption-mode">
        <button type="button" className={mode === 'single' ? 'is-active' : ''} onClick={() => setMode('single')}>Single caption</button>
        <button type="button" className={mode === 'script' ? 'is-active' : ''} onClick={() => setMode('script')}>From script</button>
      </div>

      {mode === 'single' ? (
        <div className="caption-compose">
          <textarea
            value={singleText}
            onChange={(event) => setSingleText(event.target.value)}
            placeholder="Type a caption…"
            rows={2}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) addSingle(); }}
          />
          <div className="caption-compose-footer">
            <label className="mini-field">
              <span>Duration</span>
              <input type="number" min={0.5} max={12} step={0.5} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />s
            </label>
            <button type="button" className="btn btn-primary btn-small" onClick={addSingle}><Plus size={14} /> Add caption</button>
          </div>
        </div>
      ) : (
        <div className="caption-compose">
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder={'Paste narration or a script.\nEach sentence becomes a timed caption starting at the playhead.'}
            rows={5}
          />
          <div className="caption-compose-footer">
            <span className="micro-copy">Auto-timed at reading pace</span>
            <button type="button" className="btn btn-primary btn-small" onClick={addScript}><Sparkles size={14} /> Build captions</button>
          </div>
        </div>
      )}

      <div className="caption-tools-row">
        <button type="button" className="btn btn-secondary btn-small" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import SRT</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={exportSrt} disabled={!captions.length}><Download size={14} /> Export SRT</button>
      </div>

      <div className="section-mini-head"><span>Caption style</span><span>{captions.length} cues</span></div>
      <div className="caption-style-grid">
        {STYLE_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className="caption-style-card"
            onClick={() => {
              updateCaptionStyles(preset.patch);
              addToast(`${preset.name} caption style applied`, 'success');
            }}
          >
            <span
              className="caption-style-preview"
              style={{
                fontFamily: preset.patch.fontFamily,
                fontWeight: preset.patch.fontWeight,
                color: preset.patch.color,
                background: preset.patch.backgroundOpacity > 0 ? 'rgba(5,8,12,.7)' : undefined,
                borderRadius: preset.patch.radius,
                textTransform: preset.patch.uppercase ? 'uppercase' : 'none',
                padding: '4px 7px'
              }}
            >
              {preset.id === 'highlight' ? <span className="caption-highlight">Your words</span> : 'Your words'}
            </span>
            <span className="caption-style-name">{preset.name}</span>
          </button>
        ))}
      </div>

      <div className="caption-position">
        <span className="field-label">Position all captions</span>
        <div className="segmented segmented-sm">
          <button type="button" onClick={() => mutateProject((draft) => { for (const clip of draft.clips) if (clip.caption) clip.y = -0.38; })}>Top</button>
          <button type="button" onClick={() => mutateProject((draft) => { for (const clip of draft.clips) if (clip.caption) clip.y = 0; })}>Middle</button>
          <button type="button" onClick={() => mutateProject((draft) => { for (const clip of draft.clips) if (clip.caption) clip.y = 0.37; })}>Lower</button>
        </div>
      </div>

      <div className="section-mini-head">
        <span>Caption timeline</span>
        {captions.length > 0 && (
          <button type="button" className="text-btn danger" onClick={() => {
            mutateProject((draft) => { draft.clips = draft.clips.filter((clip) => !clip.caption); });
            addToast('All captions removed', 'info');
          }}><Trash2 size={11} /> Clear</button>
        )}
      </div>

      {captions.length ? (
        <div className="caption-list">
          {captions.map((clip) => (
            <button
              type="button"
              key={clip.id}
              className="caption-list-row"
              onClick={() => { setPlayhead(clip.start); selectClip(clip.id); }}
            >
              <span className="caption-time">{formatTime(clip.start)}</span>
              <span className="caption-text">{clip.text?.content || 'Caption'}</span>
              <span className="caption-duration">{clip.duration.toFixed(1)}s</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel-empty compact">
          <FileText size={22} />
          <strong>No captions yet</strong>
          <p>Add a cue above, or import an existing .srt file.</p>
        </div>
      )}

      <div className="panel-footer">
        <span>{captions.length} cues</span>
        <span>Separate caption track</span>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Blend, Check, Layers, X } from 'lucide-react';
import { TRANSITIONS } from '../../types';
import { selectSelectedClip, useEditorStore } from '../../store/editorStore';

export function TransitionsPanel() {
  const project = useEditorStore((state) => state.project);
  const clip = useEditorStore(selectSelectedClip);
  const setTransition = useEditorStore((state) => state.setTransition);
  const updateClip = useEditorStore((state) => state.updateClip);
  const mutateProject = useEditorStore((state) => state.mutateProject);
  const addToast = useEditorStore((state) => state.addToast);
  const [duration, setDuration] = useState(0.7);

  useEffect(() => {
    if (clip?.transition) setDuration(clip.transition.duration);
  }, [clip?.id, clip?.transition?.type, clip?.transition?.duration]);

  const siblings = project && clip ? project.clips.filter((item) => item.trackId === clip.trackId).sort((a, b) => a.start - b.start) : [];
  const isFirst = clip ? siblings[0]?.id === clip.id : false;

  const applyAll = () => {
    if (!project || !clip?.transition) {
      addToast('Pick a transition first', 'info');
      return;
    }
    mutateProject((draft) => {
      for (const track of draft.tracks) {
        if (track.kind === 'audio') continue;
        const trackClips = draft.clips.filter((item) => item.trackId === track.id).sort((a, b) => a.start - b.start);
        trackClips.forEach((item, index) => {
          if (index > 0) item.transition = { type: clip.transition!.type, duration };
        });
      }
    });
    addToast('Transition applied to every cut', 'success');
  };

  return (
    <div className="panel-page">
      <div className="panel-context-strip">
        <div>
          <span className="eyebrow">Transition into</span>
          <strong>{clip?.name || 'No clip selected'}</strong>
        </div>
        {clip?.transition && (
          <button type="button" className="text-btn" onClick={() => updateClip(clip.id, { transition: undefined })}>
            <X size={12} /> Remove
          </button>
        )}
      </div>

      {clip && isFirst && <div className="inline-hint">This is the first clip on its track. Add or select a later clip to use a transition.</div>}
      {!clip && <div className="inline-hint">Select a clip in the timeline, then choose how the cut enters.</div>}

      <div className="transition-grid">
        <button
          type="button"
          className={`transition-card ${clip && !clip.transition ? 'is-active' : ''}`}
          onClick={() => { if (!clip) { addToast('Select a clip first', 'info'); return; } updateClip(clip.id, { transition: undefined }); }}
        >
          <span className="transition-preview transition-none">
            <span className="transition-block block-a" />
            <span className="transition-block block-b" />
          </span>
          <span className="transition-name">None</span>
        </button>
        {TRANSITIONS.map((transition) => {
          const active = clip?.transition?.type === transition.id;
          return (
            <button
              type="button"
              key={transition.id}
              className={`transition-card ${active ? 'is-active' : ''}`}
              onClick={() => {
                if (!clip) { addToast('Select a clip first', 'info'); return; }
                if (isFirst) { addToast('Add a clip before this one to use a transition', 'info'); return; }
                setTransition(clip.id, transition.id, duration);
              }}
            >
              <span className={`transition-preview transition-${transition.id}`}>
                <span className="transition-block block-a" />
                <span className="transition-block block-b" />
                {active && <span className="transition-check"><Check size={11} /></span>}
              </span>
              <span className="transition-name">{transition.name}</span>
            </button>
          );
        })}
      </div>

      {clip?.transition && (
        <div className="transition-settings">
          <div className="slider-row-head">
            <span className="field-label">Transition length</span>
            <span className="slider-value">{duration.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            className="range-input"
            min={0.2}
            max={2}
            step={0.05}
            value={duration}
            style={{ '--range-progress': `${((duration - 0.2) / 1.8) * 100}%` } as React.CSSProperties}
            onChange={(event) => {
              const value = Number(event.target.value);
              setDuration(value);
              setTransition(clip.id, clip.transition!.type, value);
            }}
          />
          <div className="transition-stats"><span>{clip.transition.type.replace('-', ' ')}</span><span>{siblings.length} cuts on track</span></div>
        </div>
      )}

      <button type="button" className="btn btn-secondary wide-btn" onClick={applyAll} disabled={!clip?.transition}>
        <Layers size={15} /> Apply this transition to all cuts
      </button>

      <div className="panel-info-card">
        <Blend size={16} />
        <div>
          <strong>Cut on motion</strong>
          <p>Place transitions where the camera moves for a smoother, more intentional rhythm.</p>
        </div>
      </div>
    </div>
  );
}

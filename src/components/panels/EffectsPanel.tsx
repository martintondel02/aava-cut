import { Check, Sparkles, Trash2 } from 'lucide-react';
import { EFFECTS } from '../../types';
import { selectSelectedClip, useEditorStore } from '../../store/editorStore';

export function EffectsPanel() {
  const clip = useEditorStore(selectSelectedClip);
  const toggleEffect = useEditorStore((state) => state.toggleEffect);
  const updateClip = useEditorStore((state) => state.updateClip);
  const addToast = useEditorStore((state) => state.addToast);
  const visual = clip && clip.kind !== 'audio';
  const active = clip?.effects || [];

  return (
    <div className="panel-page">
      <div className="panel-context-strip">
        <div>
          <span className="eyebrow">Applying to</span>
          <strong>{visual ? clip?.name : 'No visual clip selected'}</strong>
        </div>
        {active.length > 0 && visual && (
          <button type="button" className="text-btn" onClick={() => updateClip(clip!.id, { effects: [] })}>
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {!visual && <div className="inline-hint">Select a video, photo, text or sticker clip in the timeline to add an effect.</div>}

      <div className="effect-grid">
        {EFFECTS.map((effect) => {
          const isActive = active.includes(effect.id);
          return (
            <button
              type="button"
              key={effect.id}
              className={`effect-card ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                if (!visual) { addToast('Select a visual clip first', 'info'); return; }
                toggleEffect(clip!.id, effect.id);
              }}
            >
              <span className={`effect-preview fx-${effect.id}`} style={{ '--fx-accent': effect.accent } as React.CSSProperties}>
                <span className="effect-preview-label">{effect.name.slice(0, 1)}</span>
              </span>
              <span className="effect-meta">
                <span>{effect.name}</span>
                {isActive ? <Check size={13} /> : <Sparkles size={12} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="panel-info-card">
        <Sparkles size={16} />
        <div>
          <strong>Layer the atmosphere</strong>
          <p>Effects are rendered live over the whole frame and baked into exports. Combine two for a signature look.</p>
        </div>
      </div>
    </div>
  );
}

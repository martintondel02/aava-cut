import { Check, Diamond, Sparkles, Trash2, X } from 'lucide-react';
import { EFFECTS } from '../../types';
import { selectSelectedClip, useEditorStore } from '../../store/editorStore';
import { effectChannelId } from '../../lib/keyframes';

export function EffectsPanel() {
  const clip = useEditorStore(selectSelectedClip);
  const toggleEffect = useEditorStore((state) => state.toggleEffect);
  const updateClip = useEditorStore((state) => state.updateClip);
  const setEffectIntensity = useEditorStore((state) => state.setEffectIntensity);
  const addEffectFade = useEditorStore((state) => state.addEffectFade);
  const addKeyframe = useEditorStore((state) => state.addKeyframe);
  const beginEdit = useEditorStore((state) => state.beginEdit);
  const endEdit = useEditorStore((state) => state.endEdit);
  const addToast = useEditorStore((state) => state.addToast);
  const visual = clip && clip.kind !== 'audio';
  const active = clip?.effects.filter((effect) => effect.enabled) || [];
  const activeTypes = active.map((effect) => effect.type);

  return (
    <div className="panel-page">
      <div className="panel-context-strip">
        <div>
          <span className="eyebrow">Applying to</span>
          <strong>{visual ? clip?.name : 'No visual clip selected'}</strong>
        </div>
        {activeTypes.length > 0 && visual && (
          <button type="button" className="text-btn" onClick={() => updateClip(clip!.id, { effects: [] })}>
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {!visual && <div className="inline-hint">Select a video, photo, text or sticker clip in the timeline to add an effect.</div>}

      <div className="effect-grid">
        {EFFECTS.map((effect) => {
          const isActive = activeTypes.includes(effect.id);
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

      {visual && active.length > 0 && (
        <div className="effect-mixer-section">
          <div className="section-mini-head"><span>Active effects</span><span>{active.length}</span></div>
          {active.map((layer) => {
            const definition = EFFECTS.find((effect) => effect.id === layer.type);
            const channelId = effectChannelId(layer);
            const keyCount = clip!.keyframes.filter((frame) => frame.property === channelId).length;
            return (
              <div className="effect-mixer" key={layer.id}>
                <div className="effect-mixer-head">
                  <span className="effect-mixer-swatch" style={{ background: definition?.accent || '#b99aff' }} />
                  <strong>{definition?.name || layer.type}</strong>
                  <span className="effect-key-count">{keyCount ? `${keyCount} keys` : 'static'}</span>
                  <button type="button" onClick={() => toggleEffect(clip!.id, layer.type)} title="Remove effect"><X size={12} /></button>
                </div>
                <div className="slider-row-head">
                  <span className="field-label">Intensity</span>
                  <span className="slider-value">{Math.round(layer.intensity)}%</span>
                </div>
                <input
                  type="range"
                  className="range-input"
                  min={0}
                  max={100}
                  step={1}
                  value={layer.intensity}
                  style={{ '--range-progress': `${layer.intensity}%` } as React.CSSProperties}
                  onPointerDown={beginEdit}
                  onChange={(event) => setEffectIntensity(clip!.id, layer.type, Number(event.target.value), false)}
                  onPointerUp={endEdit}
                  onBlur={endEdit}
                />
                <div className="effect-mixer-actions">
                  <button type="button" onClick={() => addEffectFade(clip!.id, layer.type, 'in')}>Fade in</button>
                  <button type="button" onClick={() => addEffectFade(clip!.id, layer.type, 'out')}>Fade out</button>
                  <button type="button" onClick={() => addKeyframe(clip!.id, channelId)} title="Add intensity keyframe at playhead"><Diamond size={10} /> Key</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel-info-card">
        <Sparkles size={16} />
        <div>
          <strong>Layer the atmosphere</strong>
          <p>Effects render live over the whole frame and are baked into exports. Add intensity keyframes or use the fade helpers to breathe them in and out.</p>
        </div>
      </div>
    </div>
  );
}

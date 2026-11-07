import { Plus, Sparkles, Type } from 'lucide-react';
import { TEXT_PRESETS } from '../../types';
import { useEditorStore } from '../../store/editorStore';

export function TextPanel() {
  const addText = useEditorStore((state) => state.addText);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);

  return (
    <div className="panel-page">
      <button type="button" className="text-hero-card" onClick={() => addText('editorial', 'Your story starts here')}>
        <div className="text-hero-icon"><Type size={22} /></div>
        <div>
          <strong>Add text at playhead</strong>
          <span>Headlines, subtitles, lower-thirds and more</span>
        </div>
        <Plus size={18} />
      </button>

      <div className="section-mini-head"><span>Text presets</span><span>{TEXT_PRESETS.length}</span></div>
      <div className="text-preset-grid">
        {TEXT_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className="text-preset-card"
            onClick={() => addText(preset.id, preset.sample)}
            title={`Add ${preset.name} text`}
          >
            <span
              className="text-preset-sample"
              style={{
                fontFamily: preset.style.fontFamily,
                fontWeight: preset.style.fontWeight,
                color: preset.style.color === 'transparent' ? 'transparent' : preset.style.color,
                textShadow: preset.style.shadow ? '0 2px 12px rgba(0,0,0,.65)' : 'none',
                WebkitTextStroke: preset.style.color === 'transparent' ? '1px #8dffe4' : undefined,
                letterSpacing: Math.min(4, preset.style.letterSpacing / 2),
                textTransform: preset.style.uppercase ? 'uppercase' : 'none',
                background: preset.style.backgroundOpacity > 0 ? (preset.style.background || 'rgba(0,0,0,.62)') : undefined,
                fontSize: preset.id === 'serif' ? 19 : preset.id === 'caption' ? 16 : 17
              }}
            >
              {preset.sample}
            </span>
            <span className="text-preset-name">{preset.name}</span>
          </button>
        ))}
      </div>

      <div className="panel-info-card">
        <Sparkles size={16} />
        <div>
          <strong>Animate every title</strong>
          <p>Select a text clip to add fades, slides, zoom and typewriter reveals from the inspector.</p>
        </div>
      </div>

      <button type="button" className="panel-link-row" onClick={() => setActivePanel('captions')}>
        <span>Need subtitles?</span>
        <span>Open Caption Studio →</span>
      </button>
    </div>
  );
}

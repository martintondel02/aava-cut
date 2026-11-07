import { Shapes, Sparkles } from 'lucide-react';
import { STICKERS, STICKER_SHAPES } from '../../types';
import { useEditorStore } from '../../store/editorStore';

export function StickersPanel() {
  const addSticker = useEditorStore((state) => state.addSticker);
  const addShape = useEditorStore((state) => state.addShape);

  return (
    <div className="panel-page">
      <div className="section-mini-head"><span>Shapes & accents</span><span>{STICKER_SHAPES.length}</span></div>
      <div className="shape-grid">
        {STICKER_SHAPES.map((shape) => (
          <button type="button" key={shape.id} className="shape-card" onClick={() => addShape(shape.id!)} title={`Add ${shape.label}`}>
            <span className={`shape-glyph shape-${shape.id}`} />
            <span>{shape.label}</span>
          </button>
        ))}
      </div>

      <div className="section-mini-head"><span>Emoji stickers</span><Sparkles size={13} /></div>
      <div className="sticker-grid">
        {STICKERS.map((sticker) => (
          <button type="button" key={sticker} className="sticker-card" onClick={() => addSticker(sticker)} title={`Add ${sticker}`}>
            {sticker}
          </button>
        ))}
      </div>

      <div className="panel-info-card">
        <Shapes size={16} />
        <div>
          <strong>Make it yours</strong>
          <p>Stickers are resizable, rotatable, keyframeable and blend beautifully over any clip.</p>
        </div>
      </div>
    </div>
  );
}

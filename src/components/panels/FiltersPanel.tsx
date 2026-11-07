import { Aperture, Check, SlidersHorizontal } from 'lucide-react';
import { FILTERS } from '../../types';
import { selectSelectedClip, useEditorStore } from '../../store/editorStore';

export function FiltersPanel() {
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const clip = useEditorStore(selectSelectedClip);
  const setFilter = useEditorStore((state) => state.setFilter);
  const updateClip = useEditorStore((state) => state.updateClip);
  const mutateProject = useEditorStore((state) => state.mutateProject);
  const addToast = useEditorStore((state) => state.addToast);
  const visual = clip && clip.kind !== 'audio';
  const asset = clip?.assetId ? assets.find((item) => item.id === clip.assetId) : null;
  const preview = asset?.thumbnail || '/demo/aurora-thumb.jpg';

  return (
    <div className="panel-page">
      <div className="panel-context-strip">
        <div>
          <span className="eyebrow">Color grade</span>
          <strong>{visual ? clip?.name : 'No visual clip selected'}</strong>
        </div>
        {visual && clip?.filter !== 'none' && (
          <button type="button" className="text-btn" onClick={() => setFilter(clip!.id, 'none')}>Reset</button>
        )}
      </div>

      {!visual && <div className="inline-hint">Select a video, photo, text or sticker clip to grade it.</div>}

      <div className="filter-grid">
        {FILTERS.map((filter) => {
          const active = visual ? clip?.filter === filter.id : false;
          return (
            <button
              type="button"
              key={filter.id}
              className={`filter-card ${active ? 'is-active' : ''}`}
              onClick={() => {
                if (!visual) { addToast('Select a visual clip first', 'info'); return; }
                setFilter(clip!.id, filter.id);
              }}
            >
              <span className="filter-thumb" style={{ backgroundImage: `url(${preview})`, filter: filter.css || 'none' }}>
                {filter.tint && <span className="filter-tint" style={{ background: filter.tint }} />}
                {active && <span className="filter-check"><Check size={12} /></span>}
              </span>
              <span className="filter-name">{filter.name}</span>
            </button>
          );
        })}
      </div>

      {visual && (
        <div className="filter-intensity">
          <div className="slider-row-head">
            <span className="field-label">Intensity</span>
            <span className="slider-value">{clip.filterIntensity}%</span>
          </div>
          <input
            type="range"
            className="range-input"
            min={0}
            max={100}
            value={clip.filterIntensity}
            style={{ '--range-progress': `${clip.filterIntensity}%` } as React.CSSProperties}
            onChange={(event) => updateClip(clip.id, { filterIntensity: Number(event.target.value) }, false)}
          />
          <div className="transition-stats"><span>{FILTERS.find((item) => item.id === clip.filter)?.name}</span><span>Live preview</span></div>
        </div>
      )}

      <button
        type="button"
        className="btn btn-secondary wide-btn"
        disabled={!visual}
        onClick={() => {
          if (!project || !clip) return;
          mutateProject((draft) => {
            for (const item of draft.clips) {
              if (item.kind === 'video' || item.kind === 'image') {
                item.filter = clip.filter;
                item.filterIntensity = clip.filterIntensity;
              }
            }
          });
          addToast('Grade applied to all footage', 'success');
        }}
      >
        <Aperture size={15} /> Apply to all footage
      </button>

      <div className="panel-info-card">
        <SlidersHorizontal size={16} />
        <div>
          <strong>Grade with restraint</strong>
          <p>Lower the intensity for a natural look. Grades are non-destructive and travel with the clip.</p>
        </div>
      </div>
    </div>
  );
}

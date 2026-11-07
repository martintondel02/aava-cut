import { X } from 'lucide-react';
import type { PanelTab } from '../types';
import { useEditorStore } from '../store/editorStore';
import { MediaPanel } from './panels/MediaPanel';
import { AudioPanel } from './panels/AudioPanel';
import { TextPanel } from './panels/TextPanel';
import { StickersPanel } from './panels/StickersPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { TransitionsPanel } from './panels/TransitionsPanel';
import { FiltersPanel } from './panels/FiltersPanel';
import { CaptionsPanel } from './panels/CaptionsPanel';
import { TemplatesPanel } from './panels/TemplatesPanel';

const TITLES: Record<PanelTab, { title: string; eyebrow: string }> = {
  media: { title: 'Media', eyebrow: 'Asset library' },
  audio: { title: 'Audio', eyebrow: 'Sound library' },
  text: { title: 'Text', eyebrow: 'Typography' },
  stickers: { title: 'Stickers', eyebrow: 'Elements' },
  effects: { title: 'Effects', eyebrow: 'Atmosphere' },
  transitions: { title: 'Transitions', eyebrow: 'Between the cuts' },
  filters: { title: 'Filters', eyebrow: 'Color grade' },
  captions: { title: 'Captions', eyebrow: 'Caption studio' },
  templates: { title: 'Templates', eyebrow: 'Start strong' }
};

export function AssetPanel() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const setLeftPanelOpen = useEditorStore((state) => state.setLeftPanelOpen);
  const meta = TITLES[activePanel];

  return (
    <aside className="asset-panel">
      <div className="asset-panel-head">
        <div>
          <span className="eyebrow">{meta.eyebrow}</span>
          <h2>{meta.title}</h2>
        </div>
        <button type="button" className="icon-btn panel-close" title="Close panel" onClick={() => setLeftPanelOpen(false)}>
          <X size={16} />
        </button>
      </div>
      <div className="asset-panel-scroll">
        {activePanel === 'media' && <MediaPanel />}
        {activePanel === 'audio' && <AudioPanel />}
        {activePanel === 'text' && <TextPanel />}
        {activePanel === 'stickers' && <StickersPanel />}
        {activePanel === 'effects' && <EffectsPanel />}
        {activePanel === 'transitions' && <TransitionsPanel />}
        {activePanel === 'filters' && <FiltersPanel />}
        {activePanel === 'captions' && <CaptionsPanel />}
        {activePanel === 'templates' && <TemplatesPanel />}
      </div>
    </aside>
  );
}

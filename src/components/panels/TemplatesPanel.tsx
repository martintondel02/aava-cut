import { LayoutTemplate, Monitor, Smartphone, Sparkles, Square } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { createShapeClip, createTextClip } from '../../lib/clips';
import { ensureEffectLayer } from '../../lib/keyframes';
import type { Clip } from '../../types';

export function TemplatesPanel() {
  const project = useEditorStore((state) => state.project);
  const playhead = useEditorStore((state) => state.playhead);
  const addClipsToTimeline = useEditorStore((state) => state.addClipsToTimeline);
  const mutateProject = useEditorStore((state) => state.mutateProject);
  const setAspect = useEditorStore((state) => state.setAspect);
  const addToast = useEditorStore((state) => state.addToast);

  const addPack = (name: string, factory: (start: number) => Clip[]) => {
    if (!project) return;
    const clips = factory(playhead);
    addClipsToTimeline(clips);
    addToast(`${name} added at playhead`, 'success');
  };

  return (
    <div className="panel-page">
      <div className="template-section-head">
        <LayoutTemplate size={16} />
        <div><strong>Title packs</strong><span>Drop-in typographic sequences</span></div>
      </div>

      <div className="template-stack">
        <button
          type="button"
          className="template-card template-editorial"
          onClick={() => addPack('Editorial opener', (start) => [
            createTextClip('A LUMACUT STORY', start + 0.15, {
              duration: 2.4, y: -0.32,
              animationIn: { type: 'fade', duration: 0.5 }
            }, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: 28, letterSpacing: 8, uppercase: true, color: '#cffff2', shadow: false }),
            createTextClip('MADE FOR\nTHE MOMENT', start + 0.65, {
              duration: 4.4,
              animationIn: { type: 'zoom', duration: 0.9 }
            }, { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 136, lineHeight: 0.9, letterSpacing: -3, uppercase: true, color: '#ffffff' })
          ])}
        >
          <span className="template-preview preview-editorial"><span>A LUMACUT STORY</span><strong>MADE FOR<br />THE MOMENT</strong></span>
          <span className="template-copy"><strong>Editorial opener</strong><span>Bold type · centered</span></span>
        </button>

        <button
          type="button"
          className="template-card template-lower"
          onClick={() => addPack('Neon lower third', (start) => [
            createShapeClip('square', start + 0.1, { duration: 4.2, x: -0.38, y: 0.27, scale: 0.018, shapeColor: '#72f5d1' }),
            createTextClip('TONIGHT / 9PM', start + 0.2, {
              duration: 4.2, x: -0.11, y: 0.25,
              animationIn: { type: 'slide-left', duration: 0.55 }
            }, { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 42, letterSpacing: 5, uppercase: true, color: '#d9fff5', align: 'left', shadow: false, maxWidth: 0.55 })
          ])}
        >
          <span className="template-preview preview-lower"><i /><strong>TONIGHT<br /><em>9PM</em></strong></span>
          <span className="template-copy"><strong>Neon lower third</strong><span>Accent bar · left aligned</span></span>
        </button>

        <button
          type="button"
          className="template-card template-quiet"
          onClick={() => addPack('Quiet ending', (start) => [
            createTextClip('and then,\nthe light changed.', start + 0.25, {
              duration: 4.8,
              animationIn: { type: 'fade', duration: 1.1 }
            }, { fontFamily: 'Luma Serif', fontWeight: 400, fontSize: 76, lineHeight: 1.04, color: '#fff2df', shadow: true })
          ])}
        >
          <span className="template-preview preview-quiet"><strong>and then,<br />the light changed.</strong></span>
          <span className="template-copy"><strong>Quiet ending</strong><span>Serif · slow fade</span></span>
        </button>
      </div>

      <div className="template-section-head">
        <Sparkles size={16} />
        <div><strong>One-click looks</strong><span>Grade, texture and cuts</span></div>
      </div>
      <div className="look-grid">
        <button type="button" className="look-card look-film" onClick={() => {
          mutateProject((draft) => {
            for (const clip of draft.clips) {
              if (clip.kind === 'video' || clip.kind === 'image') {
                clip.filter = clip.kind === 'video' ? 'vintage' : 'warm';
                clip.filterIntensity = 62;
                ensureEffectLayer(clip, 'grain');
                if (clip.transition) clip.transition = { type: 'fade', duration: 0.65 };
              }
            }
          });
          addToast('Film print look applied', 'success');
        }}><span>Film print</span><em>Warm · grain</em></button>
        <button type="button" className="look-card look-neon" onClick={() => {
          mutateProject((draft) => {
            for (const clip of draft.clips) {
              if (clip.kind === 'video' || clip.kind === 'image') {
                clip.filter = 'vivid';
                clip.filterIntensity = 72;
                ensureEffectLayer(clip, 'light-leak');
                if (clip.transition) clip.transition = { type: 'zoom', duration: 0.55 };
              }
            }
            for (const clip of draft.clips) {
              if (clip.caption && clip.text) {
                clip.text.color = '#071018';
                clip.text.background = '#b9ffe8';
                clip.text.backgroundOpacity = 0.95;
              }
            }
          });
          addToast('Neon pulse look applied', 'success');
        }}><span>Neon pulse</span><em>Vivid · leak</em></button>
        <button type="button" className="look-card look-quiet" onClick={() => {
          mutateProject((draft) => {
            for (const clip of draft.clips) {
              if (clip.kind === 'video' || clip.kind === 'image') {
                clip.filter = 'soft';
                clip.filterIntensity = 45;
                ensureEffectLayer(clip, 'bokeh');
                if (clip.transition) clip.transition = { type: 'fade', duration: 1 };
              }
            }
          });
          addToast('Quiet documentary look applied', 'success');
        }}><span>Quiet doc</span><em>Soft · bokeh</em></button>
      </div>

      <div className="template-section-head">
        <Monitor size={16} />
        <div><strong>Reframe</strong><span>Non-destructive canvas formats</span></div>
      </div>
      <div className="format-card-list">
        <button type="button" onClick={() => { setAspect(1080, 1920); addToast('Reframed for vertical', 'success'); }}>
          <Smartphone size={17} /><span><strong>9:16 Story</strong><em>Reels · TikTok · Shorts</em></span><span className="format-pill-mini">1080 × 1920</span>
        </button>
        <button type="button" onClick={() => { setAspect(1080, 1080); addToast('Reframed for square', 'success'); }}>
          <Square size={17} /><span><strong>1:1 Square</strong><em>Feed · carousel</em></span><span className="format-pill-mini">1080 × 1080</span>
        </button>
        <button type="button" onClick={() => { setAspect(1920, 1080); addToast('Reframed for widescreen', 'success'); }}>
          <Monitor size={17} /><span><strong>16:9 Landscape</strong><em>YouTube · film</em></span><span className="format-pill-mini">1920 × 1080</span>
        </button>
      </div>

    </div>
  );
}

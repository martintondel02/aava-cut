import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { TopBar, LogoMark } from './components/TopBar';
import { IconRail } from './components/IconRail';
import { AssetPanel } from './components/AssetPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { ExportDialog } from './components/ExportDialog';
import { ShortcutsModal } from './components/ShortcutsModal';
import { SettingsPage } from './components/SettingsPage';
import { ToastStack } from './components/ToastStack';
import { useEditorStore } from './store/editorStore';
import { applyAppearance, useSettingsStore } from './store/settingsStore';
import { mediaPool } from './engine/mediaPool';
import { useAgentBridge } from './hooks/useAgentBridge';
import { projectDuration } from './lib/utils';
import type { PanelTab } from './types';

const PANEL_KEYS: Record<string, PanelTab> = {
  '1': 'media', '2': 'audio', '3': 'text', '4': 'stickers', '5': 'effects',
  '6': 'transitions', '7': 'filters', '8': 'captions', '9': 'templates'
};

export default function App() {
  useAgentBridge();
  const hydrated = useEditorStore((state) => state.hydrated);
  const project = useEditorStore((state) => state.project);
  const assetsError = useEditorStore((state) => state.assetsError);
  const leftPanelOpen = useEditorStore((state) => state.leftPanelOpen);
  const timelineHeight = useEditorStore((state) => state.timelineHeight);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const settings = useSettingsStore();
  const setTimelineHeight = useEditorStore((state) => state.setTimelineHeight);
  const bootstrap = useEditorStore((state) => state.bootstrap);
  const uploadFiles = useEditorStore((state) => state.uploadFiles);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const addToast = useEditorStore((state) => state.addToast);
  const [importDrag, setImportDrag] = useState(false);
  const [panelWidths, setPanelWidths] = useState({ left: settings.leftPanelWidth, right: settings.rightPanelWidth });
  const dragDepth = useRef(0);
  const booted = useRef(false);
  const errorNotified = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (hydrated && assetsError && !errorNotified.current) {
      errorNotified.current = true;
      addToast('Media server offline — the demo library is loaded from cache. Export needs the Aava Cut server.', 'error');
    }
  }, [hydrated, assetsError, addToast]);

  useEffect(() => {
    applyAppearance(settings);
  }, [settings.theme, settings.accent, settings.scale, settings.density, settings.reduceMotion]);

  useEffect(() => {
    if (settings.open) {
      useEditorStore.getState().setPlaying(false);
      if (useEditorStore.getState().exportOpen) useEditorStore.getState().closeExport();
    }
  }, [settings.open]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyAppearance(useSettingsStore.getState());
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  // Playback clock. The renderer follows this playhead through CanvasPreview.
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const current = useEditorStore.getState();
      if (!current.isPlaying || !current.project) return;
      const delta = Math.min(0.12, (now - last) / 1000);
      last = now;
      const duration = projectDuration(current.project);
      const next = current.playhead + delta;
      if (next >= duration - 0.001) {
        if (useSettingsStore.getState().loopPlayback) {
          current.setPlayhead(0);
          last = performance.now();
          frame = requestAnimationFrame(tick);
          return;
        }
        current.setPlayhead(duration);
        current.setPlaying(false);
        return;
      }
      current.setPlayhead(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const target = event.target as HTMLElement | null;
      const isField = /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') || Boolean(target?.isContentEditable);
      const isTypingField = /^(INPUT|TEXTAREA)$/.test(target?.tagName || '') || Boolean(target?.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'e') { event.preventDefault(); state.openExport(); return; }
      if (mod && key === 's') { event.preventDefault(); void state.saveProjectToServer(); return; }
      if (mod && key === 'n') { event.preventDefault(); state.newProject(); return; }
      if (mod && key === 'o') { event.preventDefault(); window.dispatchEvent(new CustomEvent('lumacut:open-project')); return; }
      if (state.exportOpen) return;
      if (useSettingsStore.getState().open) return;
      if (mod && event.key === ',') { event.preventDefault(); useSettingsStore.getState().openSettings(); return; }
      if (isField) return;

      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo(); else state.undo();
        return;
      }
      if (mod && key === 'y') { event.preventDefault(); state.redo(); return; }
      if (mod && key === 'd') { event.preventDefault(); state.duplicateSelected(); return; }
      if (mod && key === 'b') { event.preventDefault(); state.setPlaying(false); state.splitSelected(); return; }
      if (mod && key === 'c' && !isField) { event.preventDefault(); state.copySelected(); return; }
      if (mod && key === 'v' && !isField) { event.preventDefault(); state.paste(); return; }
      if (mod && key === 'a' && !isField) { event.preventDefault(); state.selectAllClips(); return; }

      if (event.code === 'Space' && !isTypingField) {
        event.preventDefault();
        event.stopPropagation();
        target?.blur();
        if (!state.isPlaying) void mediaPool.ensureContext().resume();
        state.togglePlayback();
        return;
      }
      if (key === 'b') { event.preventDefault(); state.setPlaying(false); state.splitSelected(); return; }
      if (key === 't') { event.preventDefault(); state.addText('editorial', 'Your text here'); return; }
      if (key === 'delete' || key === 'backspace') {
        if (state.selectedKeyframe) {
          event.preventDefault();
          state.removeKeyframe(state.selectedKeyframe.clipId, state.selectedKeyframe.keyframeId);
          return;
        }
        if (state.selectedClipIds.length) { event.preventDefault(); state.deleteSelected(); }
        return;
      }
      if (key === 'arrowleft' || key === 'arrowright') {
        event.preventDefault();
        if (!state.project) return;
        const direction = key === 'arrowleft' ? -1 : 1;
        const step = event.shiftKey ? 1 : 1 / state.project.fps;
        state.setPlaying(false);
        state.setPlayhead(Math.max(0, Math.min(projectDuration(state.project), state.playhead + direction * step)));
        return;
      }
      if (key === 'home') { event.preventDefault(); state.setPlaying(false); state.setPlayhead(0); return; }
      if (key === 'end' && state.project) { event.preventDefault(); state.setPlaying(false); state.setPlayhead(projectDuration(state.project)); return; }
      if (key === 'escape') { if (state.selectedKeyframe) state.selectKeyframe(state.selectedKeyframe.clipId, null); else state.selectClip(null); return; }
      if (!mod && PANEL_KEYS[event.key]) { state.setActivePanel(PANEL_KEYS[event.key]); return; }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // Drop files anywhere to import.
  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');
    const isClipDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('application/x-lumacut-asset');
    const enter = (event: DragEvent) => {
      if (!hasFiles(event) || isClipDrag(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setImportDrag(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event) || isClipDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event) || isClipDrag(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setImportDrag(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event) || isClipDrag(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setImportDrag(false);
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length) {
        const audioOnly = files.every((file) => /^audio\//.test(file.type) || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name));
        setActivePanel(audioOnly ? 'audio' : 'media');
        void uploadFiles(files);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [setActivePanel, uploadFiles]);

  useEffect(() => () => { mediaPool.pauseAll(); }, []);

  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = useEditorStore.getState().timelineHeight;
    const move = (moveEvent: PointerEvent) => {
      setTimelineHeight(startHeight + (startY - moveEvent.clientY));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    document.body.classList.add('is-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    setPanelWidths({ left: settings.leftPanelWidth, right: settings.rightPanelWidth });
  }, [settings.leftPanelWidth, settings.rightPanelWidth]);

  const startPanelResize = (side: 'left' | 'right', event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = side === 'left' ? panelWidths.left : panelWidths.right;
    const scale = Math.max(0.5, settings.scale / 100);
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / scale;
      latest = side === 'left'
        ? Math.round(Math.min(640, Math.max(260, startWidth + delta)))
        : Math.round(Math.min(640, Math.max(280, startWidth - delta)));
      setPanelWidths((current) => ({ ...current, [side]: latest }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-resizing-x');
      settings.update(side === 'left' ? { leftPanelWidth: latest } : { rightPanelWidth: latest });
    };
    document.body.classList.add('is-resizing-x');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  if (!hydrated || !project) {
    return (
      <div className="boot-screen">
        <div className="boot-glow" />
        <LogoMark size={54} />
        <div className="boot-copy">
          <h1>Aava Cut</h1>
          <p>Loading your edit</p>
        </div>
        <div className="boot-loader"><span /></div>
        <span className="boot-detail">Every craft. One current.</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="workspace">
        <IconRail />
        {leftPanelOpen && <AssetPanel width={panelWidths.left} />}
        {leftPanelOpen && (
          <div
            className="panel-resizer"
            data-side="left"
            title="Drag to resize panel · double-click to reset"
            onPointerDown={(event) => startPanelResize('left', event)}
            onDoubleClick={() => settings.update({ leftPanelWidth: 340 })}
          ><span /></div>
        )}
        <div className="editor-center">
          <PreviewPanel />
        </div>
        <div
          className="panel-resizer"
          data-side="right"
          title="Drag to resize panel · double-click to reset"
          onPointerDown={(event) => startPanelResize('right', event)}
          onDoubleClick={() => settings.update({ rightPanelWidth: 340 })}
        ><span /></div>
        <Inspector width={panelWidths.right} />
      </main>
      <div className="timeline-shell" style={{ height: timelineHeight }}>
        <div className="timeline-resize-handle" onPointerDown={startResize} title="Drag to resize timeline">
          <span />
        </div>
        <Timeline />
      </div>

      <ExportDialog />
      <SettingsPage />
      <ShortcutsModal />
      <ToastStack />

      {importDrag && (
        <div className="import-overlay">
          <div className="import-overlay-card">
            <span className="import-overlay-icon"><UploadCloud size={30} /></span>
            <strong>Drop to import</strong>
            <p>Video, photos and audio will be added to your media library.</p>
          </div>
        </div>
      )}
    </div>
  );
}

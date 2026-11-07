import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, Cloud, Download, FilePlus2, FolderOpen, Keyboard, LayoutTemplate, Redo2, Save,
  Settings2, Sparkles, Undo2, Upload
} from 'lucide-react';
import { ASPECT_PRESETS } from '../types';
import { useEditorStore } from '../store/editorStore';
import { useClickOutside, useKeyboardHelpModal } from '../hooks/useClickOutside';
import { QuickThemeButton } from './SettingsPage';
import { useSettingsStore } from '../store/settingsStore';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lumacut-mark" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7BFFDF" />
          <stop offset="0.55" stopColor="#56D9C1" />
          <stop offset="1" stopColor="#6A8DFF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="10" fill="#0C1418" stroke="rgba(255,255,255,.12)" />
      <path d="M10 24.2V11.8h4.05v9.1h7.1v3.3H10Z" fill="url(#lumacut-mark)" />
      <path d="M23.6 11.8h3.9v7.4c0 3.4-2.2 5.3-5.3 5.3h-.5v-3.3h.4c1.1 0 1.5-.6 1.5-1.8v-7.6Z" fill="url(#lumacut-mark)" opacity=".75" />
      <circle cx="26.6" cy="9.4" r="2.1" fill="#FFCE7A" />
    </svg>
  );
}

export function TopBar() {
  const project = useEditorStore((state) => state.project);
  const historyLength = useEditorStore((state) => state.history.length);
  const futureLength = useEditorStore((state) => state.future.length);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const setAspect = useEditorStore((state) => state.setAspect);
  const openExport = useEditorStore((state) => state.openExport);
  const newProject = useEditorStore((state) => state.newProject);
  const loadDemoProject = useEditorStore((state) => state.loadDemoProject);
  const exportProjectFile = useEditorStore((state) => state.exportProjectFile);
  const importProject = useEditorStore((state) => state.importProject);
  const saveProjectToServer = useEditorStore((state) => state.saveProjectToServer);
  const addToast = useEditorStore((state) => state.addToast);
  const openHelp = useKeyboardHelpModal();
  const openSettings = useSettingsStore((state) => state.openSettings);

  const [name, setName] = useState(project?.name || 'Untitled project');
  const [fileOpen, setFileOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [savedAgo, setSavedAgo] = useState('just now');
  const fileRef = useRef<HTMLDivElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const aspectRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  useClickOutside(fileRef, () => setFileOpen(false), fileOpen);
  useClickOutside(aspectRef, () => setAspectOpen(false), aspectOpen);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project?.id, project?.name]);

  useEffect(() => {
    const open = () => projectFileRef.current?.click();
    window.addEventListener('lumacut:open-project', open);
    return () => window.removeEventListener('lumacut:open-project', open);
  }, []);

  useEffect(() => {
    if (!lastSavedAt) {
      setSavedAgo('local autosave');
      return;
    }
    const update = () => {
      const seconds = Math.floor((Date.now() - new Date(lastSavedAt).getTime()) / 1000);
      if (seconds < 8) setSavedAgo('saved just now');
      else if (seconds < 60) setSavedAgo(`saved ${seconds}s ago`);
      else setSavedAgo('saved locally');
    };
    update();
    const timer = setInterval(update, 6000);
    return () => clearInterval(timer);
  }, [lastSavedAt]);

  const ratio = project ? ASPECT_PRESETS.find((preset) => preset.width === project.width && preset.height === project.height) : null;
  const ratioLabel = ratio?.id || (project ? `${project.width}:${project.height}` : '16:9');
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project?.name) setProjectName(trimmed);
    else setName(project?.name || 'Untitled project');
  };

  const openProjectFile = () => {
    projectFileRef.current?.click();
    setFileOpen(false);
  };

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-lockup">
          <LogoMark size={31} />
          <div className="brand-text">
            <span className="brand-name">LumaCut</span>
            <span className="brand-edition">STUDIO</span>
          </div>
        </div>
        <div className="file-menu-wrap" ref={fileRef}>
          <button type="button" className={`topbar-menu-btn ${fileOpen ? 'is-open' : ''}`} onClick={() => setFileOpen(!fileOpen)}>
            File <ChevronDown size={12} />
          </button>
          {fileOpen && (
            <div className="popover file-menu">
              <button type="button" onClick={() => { newProject(); setFileOpen(false); }}><FilePlus2 size={15} /> New project <kbd>Ctrl N</kbd></button>
              <button type="button" onClick={openProjectFile}><FolderOpen size={15} /> Open project <kbd>Ctrl O</kbd></button>
              <button type="button" onClick={() => { saveProjectToServer(); setFileOpen(false); }}><Save size={15} /> Save to disk <kbd>Ctrl S</kbd></button>
              <button type="button" onClick={() => { exportProjectFile(); setFileOpen(false); }}><Download size={15} /> Download project file</button>
              <div className="popover-separator" />
              <button type="button" onClick={() => { loadDemoProject(); setFileOpen(false); }}><Sparkles size={15} /> Load demo film</button>
              <button type="button" onClick={openProjectFile}><Upload size={15} /> Import .lumacut</button>
            </div>
          )}
        </div>
      </div>

      <div className="project-title-block">
        <input
          ref={projectInputRef}
          className="project-title-input"
          value={name}
          spellCheck={false}
          aria-label="Project name"
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.currentTarget.blur(); }
            if (event.key === 'Escape') { setName(project?.name || ''); event.currentTarget.blur(); }
          }}
        />
        <div className="project-save-state">
          <Cloud size={12} className="save-cloud" />
          <span>{savedAgo}</span>
          <span className="save-dot" />
        </div>
      </div>

      <div className="topbar-actions">
        <div className="history-actions">
          <button type="button" className="icon-btn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!historyLength}>
            <Undo2 size={17} />
          </button>
          <button type="button" className="icon-btn" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!futureLength}>
            <Redo2 size={17} />
          </button>
        </div>
        <div className="aspect-menu-wrap" ref={aspectRef}>
          <button type="button" className={`format-pill ${aspectOpen ? 'is-open' : ''}`} onClick={() => setAspectOpen(!aspectOpen)} title="Canvas format">
            <span className="format-ratio">{ratioLabel.replace(":", " : ")}</span>
            <span className="format-divider" />
            <span className="format-res">{project ? `${project.width} × ${project.height}` : '1920 × 1080'}</span>
            <ChevronDown size={12} />
          </button>
          {aspectOpen && (
            <div className="popover aspect-popover">
              <div className="popover-label">Canvas format</div>
              {ASPECT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={preset.width === project?.width && preset.height === project?.height ? 'is-selected' : ''}
                  onClick={() => {
                    setAspect(preset.width, preset.height);
                    setAspectOpen(false);
                    addToast(`Canvas changed to ${preset.id} ${preset.label.toLowerCase()}`, 'info');
                  }}
                >
                  <span className={`ratio-shape ratio-${preset.id.replace(':', '-')}`} />
                  <span className="ratio-name">{preset.label}</span>
                  <span className="ratio-size">{preset.id}</span>
                </button>
              ))}
              <div className="popover-note">All transforms are stored relative to the frame, so changing format is non-destructive.</div>
            </div>
          )}
        </div>
        <QuickThemeButton />
        <button type="button" className="icon-btn help-btn" title="Settings (Ctrl+,)" onClick={openSettings}>
          <Settings2 size={17} />
        </button>
        <button type="button" className="icon-btn help-btn" title="Keyboard shortcuts (?)" onClick={openHelp}>
          <Keyboard size={17} />
        </button>
        <button type="button" className="btn export-btn" onClick={openExport}>
          <Download size={16} />
          Export
          <span className="export-shortcut">Ctrl E</span>
        </button>
      </div>
      <input
        ref={projectFileRef}
        type="file"
        accept=".lumacut,.json,application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            importProject(JSON.parse(await file.text()));
          } catch {
            addToast('That file is not a valid LumaCut project', 'error');
          }
        }}
      />
    </header>
  );
}

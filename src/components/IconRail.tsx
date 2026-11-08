import {
  Captions, Film, FolderOpen, Keyboard, LayoutTemplate, Music2, Settings2, SlidersHorizontal, Sparkles,
  Sticker, Type, Wand2
} from 'lucide-react';
import type { PanelTab } from '../types';
import { useEditorStore } from '../store/editorStore';
import { useKeyboardHelpModal } from '../hooks/useClickOutside';
import { useSettingsStore } from '../store/settingsStore';
import { LogoMark } from './TopBar';

const TABS: Array<{ id: PanelTab; label: string; icon: typeof FolderOpen; shortcut: string }> = [
  { id: 'media', label: 'Media', icon: FolderOpen, shortcut: '1' },
  { id: 'audio', label: 'Audio', icon: Music2, shortcut: '2' },
  { id: 'text', label: 'Text', icon: Type, shortcut: '3' },
  { id: 'stickers', label: 'Stickers', icon: Sticker, shortcut: '4' },
  { id: 'effects', label: 'Effects', icon: Sparkles, shortcut: '5' },
  { id: 'transitions', label: 'Transitions', icon: Wand2, shortcut: '6' },
  { id: 'filters', label: 'Filters', icon: SlidersHorizontal, shortcut: '7' },
  { id: 'captions', label: 'Captions', icon: Captions, shortcut: '8' },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, shortcut: '9' }
];

export function IconRail() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const leftPanelOpen = useEditorStore((state) => state.leftPanelOpen);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const setLeftPanelOpen = useEditorStore((state) => state.setLeftPanelOpen);
  const openHelp = useKeyboardHelpModal();
  const openSettings = useSettingsStore((state) => state.openSettings);

  return (
    <nav className="icon-rail" aria-label="Editor tools">
      <div className="rail-top-mark"><LogoMark size={27} /></div>
      <div className="rail-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activePanel === tab.id && leftPanelOpen;
          return (
            <button
              type="button"
              key={tab.id}
              className={`rail-tab ${active ? 'is-active' : ''}`}
              title={`${tab.label} (${tab.shortcut})`}
              aria-label={tab.label}
              onClick={() => {
                if (activePanel === tab.id && leftPanelOpen) setLeftPanelOpen(false);
                else setActivePanel(tab.id);
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="rail-bottom">
        <button type="button" className="rail-tab rail-small" title="Settings (Ctrl+,)" onClick={openSettings}>
          <Settings2 size={18} />
        </button>
        <button type="button" className="rail-tab rail-small" title="Keyboard shortcuts (?)" onClick={openHelp}>
          <Keyboard size={18} />
        </button>
        <div className="rail-version">1.9</div>
      </div>
    </nav>
  );
}

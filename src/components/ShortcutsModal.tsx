import { useEffect, useState } from 'react';
import { Command, X } from 'lucide-react';

const SHORTCUTS = [
  { group: 'Playback', items: [['Space', 'Play / pause'], ['← / →', 'Step one frame'], ['Shift + ← / →', 'Jump one second'], ['Home / End', 'Go to start / end']] },
  { group: 'Edit', items: [['B', 'Split at playhead'], ['Ctrl / ⌘ + Z', 'Undo'], ['Ctrl / ⌘ + Shift + Z', 'Redo'], ['Ctrl / ⌘ + D', 'Duplicate selected'], ['Ctrl / ⌘ + C / V', 'Copy / paste clip'], ['Delete', 'Delete selected'], ['Esc', 'Deselect / close']] },
  { group: 'Project', items: [['Ctrl / ⌘ + S', 'Save project to disk'], ['Ctrl / ⌘ + E', 'Open export'], ['Ctrl / ⌘ + N', 'New project'], ['1 – 9', 'Switch asset panel'], ['?', 'Show shortcuts']] },
  { group: 'Canvas', items: [['Double-click clip', 'Open matching tool'], ['Drag clip', 'Move in time / across tracks'], ['Drag handles', 'Trim in / out'], ['Drag in monitor', 'Move selected layer'], ['Corner handles', 'Scale layer'], ['Rotate handle', 'Rotate layer']] }
];

export function ShortcutsModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isField = /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') || target?.isContentEditable;
      if (event.key === '?' && !isField) setOpen((value) => !value);
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('lumacut:shortcuts', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('lumacut:shortcuts', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="shortcuts-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="shortcuts-head">
          <div>
            <span className="eyebrow">Muscle memory</span>
            <h2>Keyboard shortcuts</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <div className="shortcuts-grid">
          {SHORTCUTS.map((section) => (
            <section key={section.group} className="shortcut-section">
              <h3>{section.group}</h3>
              {section.items.map(([keys, label]) => (
                <div className="shortcut-row" key={keys}>
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="shortcuts-foot"><Command size={13} /> Tip: press Space to roll the edit, then B on the beat.</div>
      </div>
    </div>
  );
}

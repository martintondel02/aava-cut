import { RotateCcw } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

const BANDS = [
  { hz: 31, label: '31' },
  { hz: 63, label: '63' },
  { hz: 125, label: '125' },
  { hz: 250, label: '250' },
  { hz: 500, label: '500' },
  { hz: 1000, label: '1k' },
  { hz: 2000, label: '2k' },
  { hz: 4000, label: '4k' },
  { hz: 8000, label: '8k' },
  { hz: 16000, label: '16k' }
];

const PRESETS: Array<{ name: string; values: number[] }> = [
  { name: 'Flat', values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Podcast', values: [2, 3, 2, 1, 0, -1, -1, 0, 1, 1] },
  { name: 'Cinematic', values: [4, 3, 1, 0, -1, 0, 1, 2, 2, 1] },
  { name: 'Bass', values: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Vocal', values: [-1, -1, 0, 2, 4, 4, 3, 2, 1, 0] },
  { name: 'Airy', values: [0, 0, 0, 0, 0, 0, 1, 3, 4, 3] }
];

export function MasterEq() {
  const project = useEditorStore((state) => state.project);
  const mutateProject = useEditorStore((state) => state.mutateProject);
  const beginEdit = useEditorStore((state) => state.beginEdit);
  const endEdit = useEditorStore((state) => state.endEdit);
  const addToast = useEditorStore((state) => state.addToast);
  const values = project?.masterEq?.length === 10 ? project.masterEq : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  if (!project) return null;

  const setBand = (index: number, value: number) => {
    mutateProject((draft) => {
      const next = draft.masterEq?.length === 10 ? [...draft.masterEq] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      next[index] = value;
      draft.masterEq = next;
    }, false);
  };

  const applyPreset = (name: string, values: number[]) => {
    mutateProject((draft) => { draft.masterEq = [...values]; });
    addToast(`${name} EQ preset applied`, 'success');
  };

  const points = values.map((gain, index) => {
    const x = 8 + (index / (BANDS.length - 1)) * 244;
    const y = 26 - (gain / 12) * 20;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="master-eq-card">
      <div className="master-eq-head">
        <div>
          <span className="eyebrow">Master bus</span>
          <strong>10-band equalizer</strong>
          <p>Shapes the whole mix in preview and export.</p>
        </div>
        <button type="button" className="text-btn" onClick={() => applyPreset('Flat', PRESETS[0].values)} title="Reset equalizer">
          <RotateCcw size={11} /> Flat
        </button>
      </div>
      <svg className="eq-curve" viewBox="0 0 260 50" preserveAspectRatio="none" aria-hidden="true">
        <line x1="8" y1="26" x2="252" y2="26" stroke="currentColor" strokeOpacity=".12" strokeDasharray="2 3" />
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {values.map((gain, index) => (
          <circle key={index} cx={8 + (index / (BANDS.length - 1)) * 244} cy={26 - (gain / 12) * 20} r="2.1" fill="var(--accent)" />
        ))}
      </svg>
      <div className="eq-bands">
        {BANDS.map((band, index) => (
          <div className="eq-band" key={band.hz}>
            <output>{values[index] > 0 ? '+' : ''}{values[index]}</output>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={values[index]}
              aria-label={`${band.label} Hz equalizer band`}
              onPointerDown={beginEdit}
              onChange={(event) => setBand(index, Number(event.target.value))}
              onPointerUp={endEdit}
              onBlur={endEdit}
            />
            <span>{band.label}</span>
          </div>
        ))}
      </div>
      <div className="eq-presets">
        {PRESETS.map((preset) => (
          <button type="button" key={preset.name} onClick={() => applyPreset(preset.name, preset.values)}>{preset.name}</button>
        ))}
      </div>
    </div>
  );
}

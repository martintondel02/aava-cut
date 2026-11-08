import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Captions, Check, Cpu, Loader2, Sparkles, Trash2, Wand2, X
} from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { formatBytes, formatTime } from '../../lib/utils';
import type { CaptionCapabilities, CaptionCue, CaptionJob } from '../../types';

const LANGUAGES = [
  ['auto', 'Auto-detect'],
  ['en', 'English'],
  ['no', 'Norwegian'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['sv', 'Swedish'],
  ['da', 'Danish'],
  ['fi', 'Finnish'],
  ['pl', 'Polish'],
  ['ru', 'Russian'],
  ['uk', 'Ukrainian'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi']
] as const;

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'downloading', 'transcribing', 'parsing']);
const JOB_STORAGE_KEY = 'lumacut.caption.job';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AutoCaptions() {
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const selectedClipIds = useEditorStore((state) => state.selectedClipIds);
  const importCaptions = useEditorStore((state) => state.importCaptions);
  const addToast = useEditorStore((state) => state.addToast);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);

  const [capabilities, setCapabilities] = useState<CaptionCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [language, setLanguage] = useState('auto');
  const [modelId, setModelId] = useState('');
  const [source, setSource] = useState<'mix' | 'clip'>('mix');
  const [device, setDevice] = useState<'auto' | 'cpu'>('auto');
  const [prompt, setPrompt] = useState('');
  const [job, setJob] = useState<CaptionJob | null>(null);
  const [cues, setCues] = useState<CaptionCue[] | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const selectedClip = useMemo(
    () => project?.clips.find((clip) => selectedClipIds.includes(clip.id)) || null,
    [project, selectedClipIds]
  );
  const selectedAsset = useMemo(
    () => (selectedClip?.assetId ? assets.find((asset) => asset.id === selectedClip.assetId) || null : null),
    [assets, selectedClip]
  );
  const selectedHasAudio = Boolean(
    selectedClip && (selectedClip.kind === 'audio' || (selectedClip.kind === 'video' && selectedAsset?.hasAudio))
  );
  const existingCaptions = useMemo(
    () => (project?.clips || []).filter((clip) => clip.caption).length,
    [project]
  );
  const active = Boolean(job && ACTIVE_STATUSES.has(job.status));
  const selectedModel = capabilities?.models.find((model) => model.id === modelId) || null;
  const runtimeReady = Boolean(capabilities?.runtime.available);

  useEffect(() => {
    fetch('/api/captions/capabilities')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Caption service returned ${response.status}`);
        const data = (await response.json()) as CaptionCapabilities;
        setCapabilities(data);
        setCapabilityError('');
        const preferred = data.models.find((model) => model.installed && model.quality === 'accurate')
          || data.models.find((model) => model.quality === 'accurate')
          || data.models[0];
        setModelId((current) => current || preferred?.id || '');
        if (!data.runtime.vulkan) setDevice('cpu');
      })
      .catch((error) => setCapabilityError(String(error?.message || error)));
  }, []);

  useEffect(() => {
    if (source === 'clip' && !selectedHasAudio) setSource('mix');
  }, [source, selectedHasAudio]);

  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return;
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch(`/api/captions/jobs/${job.id}`);
        if (!response.ok) throw new Error(`Job status returned ${response.status}`);
        const next = (await response.json()) as CaptionJob;
        if (stopped) return;
        setJob(next);
        if (next.status === 'done' && next.result) {
          setCues(next.result.cues);
          setReplaceExisting(existingCaptions > 0);
          setReviewOpen(true);
          addToast(`Auto captions ready: ${next.result.cues.length} cues`, 'success');
          stopped = true;
        } else if (next.status === 'error') {
          sessionStorage.removeItem(JOB_STORAGE_KEY);
          addToast('Auto caption generation failed', 'error');
          stopped = true;
        } else if (next.status === 'cancelled') {
          sessionStorage.removeItem(JOB_STORAGE_KEY);
          stopped = true;
        }
      } catch (error) {
        if (!stopped) addToast(messageOf(error), 'error');
      }
    };
    const interval = window.setInterval(tick, 700);
    void tick();
    return () => { stopped = true; window.clearInterval(interval); };
  }, [job?.id, job?.status, existingCaptions, addToast]);

  useEffect(() => {
    if (!reviewOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setReviewOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reviewOpen]);

  const start = async () => {
    if (!project || !runtimeReady || !selectedModel || active) return;
    if (source === 'clip' && !selectedHasAudio) {
      addToast('Select an audio or video clip with sound first', 'info');
      return;
    }
    setCues(null);
    setReviewOpen(false);
    try {
      const response = await fetch('/api/captions/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          language,
          model: selectedModel.id,
          source,
          clipId: source === 'clip' ? selectedClip?.id : null,
          device,
          prompt: prompt.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start captions');
      setJob(data as CaptionJob);
      sessionStorage.setItem(JOB_STORAGE_KEY, (data as CaptionJob).id);
      addToast('Caption job started', 'info');
    } catch (error) {
      addToast(messageOf(error), 'error');
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      await fetch(`/api/captions/jobs/${job.id}`, { method: 'DELETE' });
      setJob((current) => current ? { ...current, status: 'cancelled', message: 'Cancelled' } : current);
      sessionStorage.removeItem(JOB_STORAGE_KEY);
    } catch {
      addToast('Could not cancel the caption job', 'error');
    }
  };

  const updateCue = (index: number, patch: Partial<CaptionCue>) => {
    setCues((current) => current ? current.map((cue, cueIndex) => cueIndex === index ? { ...cue, ...patch } : cue) : current);
  };

  const removeCue = (index: number) => {
    setCues((current) => current ? current.filter((_, cueIndex) => cueIndex !== index) : current);
  };

  const apply = () => {
    if (!cues?.length) return;
    const entries = cues
      .filter((cue) => cue.text.trim() && cue.end > cue.start)
      .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text.trim() }));
    if (!entries.length) { addToast('Add some caption text first', 'info'); return; }
    importCaptions(entries, replaceExisting);
    setPlayhead(entries[0].start);
    setReviewOpen(false);
    setCues(null);
    setJob(null);
    sessionStorage.removeItem(JOB_STORAGE_KEY);
    addToast(`Added ${entries.length} auto captions${replaceExisting ? ' and replaced the old ones' : ''}`, 'success');
  };

  return (
    <>
      <div className="auto-captions-card">
        <div className="auto-captions-head">
          <span className="auto-captions-icon"><Wand2 size={16} /></span>
          <div>
            <span className="eyebrow">Local AI · whisper.cpp</span>
            <strong>Auto captions</strong>
          </div>
          <span className={`auto-captions-badge ${capabilities?.runtime.vulkan ? 'is-gpu' : ''}`}>
            <Cpu size={10} /> {capabilities ? (capabilities.runtime.vulkan ? 'AMD Vulkan' : 'CPU') : 'Checking…'}
          </span>
        </div>
        <p className="auto-captions-copy">
          Transcribe the timeline locally. Audio stays on this machine; only the model download uses the network.
        </p>

        {capabilityError && (
          <div className="auto-captions-warning"><AlertTriangle size={13} /> {capabilityError}</div>
        )}
        {!runtimeReady && capabilities && (
          <div className="auto-captions-warning">
            <AlertTriangle size={13} />
            <span>The whisper.cpp runtime is not installed. Use the packaged build or see the captions guide.</span>
          </div>
        )}

        <div className="auto-captions-grid">
          <label className="auto-field">
            <span>Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={active}>
              {LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="auto-field">
            <span>Accuracy</span>
            <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={active || !capabilities}>
              {(capabilities?.models || []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} · {formatBytes(model.size)}{model.installed ? ' · installed' : ' · download'}
                </option>
              ))}
            </select>
          </label>
          <label className="auto-field">
            <span>Audio source</span>
            <select value={source} onChange={(event) => setSource(event.target.value as 'mix' | 'clip')} disabled={active}>
              <option value="mix">Full timeline mix</option>
              <option value="clip" disabled={!selectedHasAudio}>Selected clip{selectedHasAudio ? '' : ' (select audio)'}</option>
            </select>
          </label>
          <label className="auto-field">
            <span>Device</span>
            <select value={device} onChange={(event) => setDevice(event.target.value as 'auto' | 'cpu')} disabled={active || !capabilities?.runtime.vulkan}>
              <option value="auto">AMD GPU (auto)</option>
              <option value="cpu">CPU fallback</option>
            </select>
          </label>
        </div>

        <label className="auto-field auto-prompt">
          <span>Names / jargon <em>optional</em></span>
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Names, product terms, acronyms" disabled={active} maxLength={300} />
        </label>

        {selectedModel && !selectedModel.installed && (
          <p className="auto-model-note">
            First run downloads {formatBytes(selectedModel.size)} once and verifies its checksum.
          </p>
        )}

        {active && job && (
          <div className="auto-progress">
            <div className="auto-progress-head">
              <span>{job.status === 'transcribing' && job.device === 'auto' ? 'Transcribing on AMD GPU' : job.message}</span>
              <strong>{Math.round(job.progress)}%</strong>
            </div>
            <div className="auto-progress-track"><span style={{ width: `${Math.max(2, job.progress)}%` }} /></div>
            <div className="auto-progress-foot">
              <span>{job.status === 'downloading' ? 'Model download can be cancelled safely.' : 'Keep the app open while processing.'}</span>
              <button type="button" className="text-btn danger" onClick={cancel}><X size={11} /> Cancel</button>
            </div>
          </div>
        )}

        {job?.status === 'error' && (
          <div className="auto-captions-error">
            <AlertTriangle size={13} />
            <span>{job.error || 'Caption generation failed'}</span>
          </div>
        )}

        {cues?.length && !reviewOpen && (
          <button type="button" className="text-btn auto-review-again" onClick={() => setReviewOpen(true)}>
            <Captions size={12} /> Review last transcript ({cues.length})
          </button>
        )}

        <button
          type="button"
          className="btn btn-primary auto-captions-start"
          onClick={start}
          disabled={active || !runtimeReady || !selectedModel || !project}
        >
          {active ? <Loader2 size={15} className="auto-spin" /> : <Sparkles size={15} />}
          {active ? 'Generating captions…' : 'Generate captions'}
          <span>{selectedModel ? selectedModel.label : 'whisper.cpp'}</span>
        </button>
      </div>

      {reviewOpen && cues && (
        <div className="auto-review-overlay" role="dialog" aria-modal="true" aria-label="Review generated captions">
          <div className="auto-review-card">
            <header className="auto-review-head">
              <div>
                <span className="eyebrow">Transcript review</span>
                <h3>{cues.length} caption cue{cues.length === 1 ? '' : 's'}</h3>
                <p>{job?.result?.modelLabel || selectedModel?.label || 'Whisper'} · {job?.result?.device || (device === 'cpu' ? 'CPU' : 'AMD Vulkan')} · {job?.result?.language || language}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setReviewOpen(false)} title="Close review"><X size={17} /></button>
            </header>
            <div className="auto-review-list">
              {cues.map((cue, index) => (
                <div className={`auto-cue ${cue.confidence < 0.55 ? 'is-low' : ''}`} key={`${cue.start}-${index}`}>
                  <span className="auto-cue-time">{formatTime(cue.start)}<em>{formatTime(cue.end)}</em></span>
                  <input
                    value={cue.text}
                    aria-label={`Caption ${index + 1}`}
                    onChange={(event) => updateCue(index, { text: event.target.value })}
                  />
                  <span className="auto-cue-confidence" title="Model confidence">{Math.round(cue.confidence * 100)}%</span>
                  <button type="button" className="auto-cue-delete" onClick={() => removeCue(index)} title="Remove cue"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
            <footer className="auto-review-foot">
              <label className="auto-replace">
                <input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} />
                Replace existing captions
                {existingCaptions > 0 && <em>{existingCaptions} on timeline</em>}
              </label>
              <div>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setReviewOpen(false)}>Review later</button>
                <button type="button" className="btn btn-primary btn-small" onClick={apply} disabled={!cues.length}>
                  <Check size={14} /> Apply {cues.length} captions
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

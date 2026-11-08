import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, ExternalLink, Globe2, Mic, Music2, Pause, Play, Plus, Search, Square, Volume2, X } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { Segmented } from '../ui';
import { useEditorStore } from '../../store/editorStore';
import { formatBytes, formatTime } from '../../lib/utils';
import { WaveformMini } from '../Waveform';
import { MasterEq } from '../MasterEq';
import { AudioVisualizer } from '../AudioVisualizer';
import { SoundEffectsBrowser } from '../SoundEffectsBrowser';

export function AudioPanel() {
  const assets = useEditorStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAsset = useEditorStore((state) => state.setSelectedAsset);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const uploadFiles = useEditorStore((state) => state.uploadFiles);
  const uploading = useEditorStore((state) => state.uploading);
  const addToast = useEditorStore((state) => state.addToast);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'library' | 'sounds'>('library');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const visualizer = useSettingsStore((state) => state.visualizer);
  const visualizerStyle = useSettingsStore((state) => state.visualizerStyle);
  const updateSettings = useSettingsStore((state) => state.update);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordChunks = useRef<Blob[]>([]);

  const audioAssets = useMemo(() => assets.filter((asset) => asset.kind === 'audio'), [assets]);
  const filtered = audioAssets.filter((asset) => asset.name.toLowerCase().includes(search.toLowerCase()));
  const uploaded = filtered;

  useEffect(() => () => {
    audioRef.current?.pause();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const stopVoiceover = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  };

  const startVoiceover = async () => {
    if (recording) { stopVoiceover(); return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      addToast('Microphone recording is not available in this browser', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordStreamRef.current = stream;
      recorderRef.current = recorder;
      recordChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordChunks.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordChunks.current, { type });
        if (blob.size < 1200) {
          addToast('That take was too short to keep', 'info');
          return;
        }
        const extension = type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voiceover-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${extension}`, { type });
        const created = await uploadFiles([file]);
        if (created[0]) {
          addAssetToTimeline(created[0].id);
          addToast('Voiceover added to the timeline', 'success');
        }
        setRecordSeconds(0);
      };
      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } catch (error) {
      addToast(error instanceof Error && error.name === 'NotAllowedError' ? 'Microphone permission was denied' : 'Could not start the microphone', 'error');
    }
  };

  const togglePreview = (id: string, url: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.onended = () => setPlayingId(null);
    void audio.play();
    audioRef.current = audio;
    setPlayingId(id);
  };

  const importAudio = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((file) => /^audio\//.test(file.type) || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name));
    if (list.length) void uploadFiles(list);
  };

  return (
    <div className="panel-page audio-panel">
      <input ref={inputRef} type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={(event) => { importAudio(event.target.files); event.target.value = ''; }} />
      <div className="media-source-tabs">
        <button type="button" className={source === 'library' ? 'is-active' : ''} onClick={() => setSource('library')}>My audio</button>
        <button type="button" className={source === 'sounds' ? 'is-active' : ''} onClick={() => setSource('sounds')}><Volume2 size={12} /> Sound effects</button>
      </div>

      {source === 'sounds' ? <SoundEffectsBrowser /> : (
        <>
      <div className="panel-actions-row">
        <button type="button" className="btn btn-primary panel-import-btn" onClick={() => inputRef.current?.click()}>
          <Plus size={16} /> Import audio
        </button>
        <span className="panel-actions-hint" title="Supported: MP3, WAV and M4A">MP3 · WAV · M4A</span>
      </div>

      <div className="search-box">
        <Search size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search music & sounds" />
        {search && <button type="button" onClick={() => setSearch('')}><X size={13} /></button>}
      </div>

      <div className={`voiceover-card ${recording ? 'is-recording' : ''}`}>
        <span className="voiceover-icon"><Mic size={17} /></span>
        <div>
          <span className="eyebrow">Voiceover</span>
          <strong>{recording ? `Recording · ${String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:${String(recordSeconds % 60).padStart(2, '0')}` : 'Record a scratch track'}</strong>
          <p>{recording ? 'Speak naturally. Stop when the take feels right.' : 'Capture narration or a director note right into the cut.'}</p>
        </div>
        <button type="button" className={`voiceover-record ${recording ? 'is-recording' : ''}`} onClick={startVoiceover} title={recording ? 'Stop recording' : 'Start voiceover recording'}>
          {recording ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}
          {recording ? 'Stop' : 'Record'}
        </button>
      </div>

      <div className="pixabay-audio-card">
        <div className="pixabay-audio-head">
          <span className="pixabay-badge">Pixabay</span>
          <span className="eyebrow">Music & sound effects</span>
        </div>
        <strong>Find the bed and the punctuation.</strong>
        <p>Pixabay's public API covers photos and videos. Open its music and sound-effect libraries, then import the downloaded file here.</p>
        <div className="pixabay-audio-links">
          <a href={`https://pixabay.com/music/search/${encodeURIComponent(search)}/`} target="_blank" rel="noreferrer"><Music2 size={13} /> Music <ExternalLink size={11} /></a>
          <a href={`https://pixabay.com/sound-effects/search/${encodeURIComponent(search)}/`} target="_blank" rel="noreferrer"><AudioLines size={13} /> Sound effects <ExternalLink size={11} /></a>
        </div>
        <span className="pixabay-attribution">Audio from Pixabay · Pixabay Content License</span>
      </div>

      {visualizer && (
        <div className="audio-analyser-card">
          <div className="audio-analyser-head">
            <span className="eyebrow"><AudioLines size={13} /> Audio visualizer</span>
            <span>master output</span>
          </div>
          <AudioVisualizer playing={isPlaying} variant="panel" />
          <Segmented
            options={[{ value: 'spectrum', label: 'Spectrum' }, { value: 'waveform', label: 'Waveform' }, { value: 'radial', label: 'Radial' }]}
            value={visualizerStyle}
            onChange={(value) => updateSettings({ visualizerStyle: value })}
          />
          <span className="audio-analyser-hint">0–1000% source and track gain is limited at the master output.</span>
        </div>
      )}

      <MasterEq />

      {uploaded.length > 0 ? (
        <AudioSection title="Your audio" count={uploaded.length}>
          {uploaded.map((asset) => (
            <AudioRow
              key={asset.id}
              asset={asset}
              selected={selectedAssetId === asset.id}
              playing={playingId === asset.id}
              onPreview={() => togglePreview(asset.id, asset.url)}
              onSelect={() => setSelectedAsset(asset.id)}
              onAdd={() => addAssetToTimeline(asset.id)}
            />
          ))}
        </AudioSection>
      ) : (
        <div className="panel-empty compact">
          <Music2 size={22} />
          <strong>No audio yet</strong>
          <p>Import music or record a voiceover to get started.</p>
        </div>
      )}

      <div className="panel-footer">
        <span>{audioAssets.length} sounds</span>
        <span>{uploading ? 'Importing…' : 'Drop audio onto the timeline'}</span>
      </div>
        </>
      )}
    </div>
  );
}

function AudioSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="audio-section">
      <div className="section-mini-head"><span>{title}</span><span>{count}</span></div>
      {children}
    </section>
  );
}

function AudioRow({
  asset, selected, playing, onPreview, onSelect, onAdd
}: {
  asset: import('../../types').MediaAsset;
  selected: boolean;
  playing: boolean;
  onPreview: () => void;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const peaks = asset.peaks?.length ? asset.peaks : Array.from({ length: 90 }, (_, index) => 16 + (Math.sin(index * 0.6) * 0.5 + 0.5) * 45);
  return (
    <div
      className={`audio-row ${selected ? 'is-selected' : ''} ${playing ? 'is-playing' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-lumacut-asset', asset.id);
        event.dataTransfer.setData('text/plain', asset.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onSelect}
      onDoubleClick={onAdd}
    >
      <button type="button" className="audio-preview-btn" onClick={(event) => { event.stopPropagation(); onPreview(); }}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <div className="audio-row-main">
        <div className="audio-row-top">
          <span className="audio-name">{asset.name}</span>
          <span className="audio-duration">{formatTime(asset.duration)}</span>
        </div>
        <WaveformMini peaks={peaks} color={playing ? '#b6ffe6' : '#5fd3b3'} bars={56} />
        <div className="audio-row-bottom">
          {asset.provider === 'Lots of Sounds' ? <a className="audio-source-link" href={asset.sourceUrl || 'https://www.lotsofsounds.com/'} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Lots of Sounds</a> : <span>{asset.source === 'demo' ? 'Bundled sound' : 'Imported'}</span>}
          {asset.size ? <span>{formatBytes(asset.size)}</span> : <span>48 kHz</span>}
        </div>
      </div>
      <button type="button" className="audio-add-btn" title="Add to timeline" onClick={(event) => { event.stopPropagation(); onAdd(); }}>
        <Plus size={15} />
      </button>
    </div>
  );
}

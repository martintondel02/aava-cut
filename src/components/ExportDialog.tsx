import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, CheckCircle2, Clipboard, Cpu, Download, Film, FolderOpen, Info, Loader2, MonitorPlay, RotateCcw,
  Sparkles, X, XCircle
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { formatBytes, formatTime, projectDuration } from '../lib/utils';
import { canvasRenderer } from '../engine/canvasRenderer';
import { mediaPool } from '../engine/mediaPool';
import type { CodecCapability, ExportCodec, ExportSettings, ServerCapabilities } from '../types';

const RESOLUTIONS: Record<ExportSettings['resolution'], number> = { '720p': 1280, '1080p': 1920, '4k': 3840 };

function exportDimensions(project: { width: number; height: number }, resolution: ExportSettings['resolution']) {
  const target = RESOLUTIONS[resolution];
  const longEdge = Math.max(project.width, project.height);
  const scale = target / longEdge;
  const width = Math.max(2, Math.round((project.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((project.height * scale) / 2) * 2);
  return { width, height };
}

function chooseMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm'
  ];
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || 'video/webm';
}

export function ExportDialog() {
  const open = useEditorStore((state) => state.exportOpen);
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const settings = useEditorStore((state) => state.exportSettings);
  const progress = useEditorStore((state) => state.exportProgress);
  const result = useEditorStore((state) => state.exportResult);
  const history = useEditorStore((state) => state.exportHistory);
  const setExportSettings = useEditorStore((state) => state.setExportSettings);
  const setExportProgress = useEditorStore((state) => state.setExportProgress);
  const setExportResult = useEditorStore((state) => state.setExportResult);
  const closeExport = useEditorStore((state) => state.closeExport);
  const loadExportHistory = useEditorStore((state) => state.loadExportHistory);
  const addToast = useEditorStore((state) => state.addToast);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);

  const [copied, setCopied] = useState(false);
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const exportingRef = useRef(false);
  const lastProgress = useRef(0);

  const duration = project ? projectDuration(project) : 0;
  const dims = project ? exportDimensions(project, settings.resolution) : { width: 1920, height: 1080 };
  const active = ['preparing', 'recording', 'finalizing'].includes(progress.status);
  const isDone = progress.status === 'done';
  const isError = progress.status === 'error';

  const poster = useMemo(() => {
    if (!project) return '/demo/aurora-thumb.jpg';
    const clip = project.clips.find((item) => (item.kind === 'video' || item.kind === 'image') && item.assetId);
    const asset = clip?.assetId ? assets.find((item) => item.id === clip.assetId) : null;
    return asset?.thumbnail || '/demo/aurora-thumb.jpg';
  }, [project, assets]);

  useEffect(() => {
    if (open) {
      loadExportHistory();
      setCopied(false);
      fetch('/api/capabilities')
        .then((response) => (response.ok ? response.json() : null))
        .then((data: ServerCapabilities | null) => setCapabilities(data))
        .catch(() => setCapabilities(null));
    }
  }, [open, loadExportHistory]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open && !active) closeExport();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, active, closeExport]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    mediaPool.endCapture();
  }, []);

  if (!open || !project) return null;

  const estimatedMb = (duration * (settings.quality === 'high' ? 18 : 9) * 1_000_000) / 8 / 1_000_000;
  const codecInfo: CodecCapability | null = settings.codec === 'auto' ? null : capabilities?.codecs?.[settings.codec] || null;
  const tenBitCapable = (codec: ExportCodec): boolean => {
    if (codec === 'auto' || codec === 'h264') return false;
    const info = capabilities?.codecs?.[codec];
    if (!info || info.maxBitDepth !== 10) return false;
    return Boolean(info.software || (info.hardware && info.hardware.tenBit));
  };
  const codecAvailable = (codec: ExportCodec): boolean => {
    if (codec === 'auto') return true;
    const info = capabilities?.codecs?.[codec];
    if (!info) return false;
    if (!info.formats.includes(settings.format)) return false;
    return Boolean(info.software || info.hardware);
  };
  const codecReason = (codec: ExportCodec): string => {
    if (!capabilities) return 'Detecting available encoders…';
    if (codec === 'auto') return 'Pick the best available encoder.';
    const info = capabilities.codecs?.[codec];
    if (!info) return 'This codec is not reported by the local server.';
    if (!info.formats.includes(settings.format)) return `Choose ${info.formats.map((item) => item.toUpperCase()).join(' or ')} for ${info.label}.`;
    if (!info.software && !info.hardware) return info.codec === 'hevc'
      ? 'H.265 needs FFmpeg with libx265 or a working HEVC VAAPI driver. Fedora: enable RPM Fusion, install ffmpeg, then restart Aava Cut.'
      : `No working ${info.label} encoder was detected.`;
    return `${info.label} is available for ${info.formats.map((item) => item.toUpperCase()).join(' / ')}.`;
  };
  const hardwareForSelection = (() => {
    if (!capabilities) return null;
    if (settings.codec === 'auto') return settings.bitDepth === 8 ? capabilities.hardware.preferredFor[settings.format] || null : null;
    const hw = codecInfo?.hardware || null;
    if (!hw) return null;
    if (settings.bitDepth === 10 && !hw.tenBit) return null;
    return hw;
  })();
  const hardwareSelected = Boolean(settings.hardwareAcceleration && hardwareForSelection);
  const hdrAvailable = settings.format === 'mp4' && settings.bitDepth === 10 && ['hevc', 'av1'].includes(settings.codec) && Boolean(codecInfo?.hdr);
  const audioCodec = settings.format === 'mp4' ? 'AAC' : 'Opus';
  const codecName = hardwareSelected
    ? hardwareForSelection?.label?.replace('AMD VAAPI · ', '') || 'Hardware'
    : settings.codec === 'auto'
      ? settings.format === 'mp4' ? 'H.264' : 'VP9'
      : codecInfo?.label || settings.codec.toUpperCase();
  const bitLabel = settings.bitDepth === 10 ? '10-bit' : '8-bit';
  const summaryCodec = `${codecName} ${bitLabel}${settings.hdr ? ' HDR10' : ''} / ${audioCodec}${hardwareSelected ? ' · AMD GPU' : ''}`;
  const accelerationDetail = capabilities
    ? hardwareForSelection
      ? `${capabilities.hardware.gpuNames[0] || 'AMD Radeon'} · ${settings.codec === 'auto' || codecInfo?.software ? 'falls back to CPU if needed' : 'hardware encoder only'}`
      : settings.codec === 'auto'
        ? capabilities.hardware.detected
          ? `No AMD VAAPI encoder for ${settings.format.toUpperCase()}; CPU encoding will be used.`
          : 'No AMD Radeon detected; CPU encoding will be used.'
        : codecInfo?.software
          ? `No AMD hardware for ${codecInfo.label}; using the software ${codecInfo.software} encoder.`
          : `No AMD hardware encoder for ${codecInfo?.label || settings.codec.toUpperCase()}.`
    : 'Probing AMD VAAPI encoders…';

  const changeCodec = (codec: ExportCodec) => {
    const info = codec === 'auto' ? null : capabilities?.codecs?.[codec];
    const supportsTenBit = codec === 'hevc' || codec === 'av1'
      ? Boolean(info && info.maxBitDepth === 10 && (info.software || info.hardware?.tenBit))
      : false;
    const nextBitDepth = supportsTenBit ? settings.bitDepth : 8;
    setExportSettings({ codec, bitDepth: nextBitDepth, hdr: nextBitDepth === 10 && settings.hdr && Boolean(info?.hdr) });
  };

  const changeFormat = (format: ExportSettings['format']) => {
    const nextCodec = format === 'webm' && !['auto', 'av1'].includes(settings.codec) ? 'auto' : settings.codec;
    const nextBitDepth = nextCodec === 'auto' || nextCodec === 'h264' ? 8 : settings.bitDepth;
    setExportSettings({ format, codec: nextCodec, bitDepth: nextBitDepth, hdr: format === 'webm' ? false : settings.hdr });
  };

  const changeBitDepth = (bitDepth: 8 | 10) => {
    if (bitDepth === 10 && !tenBitCapable(settings.codec)) return;
    setExportSettings({ bitDepth, hdr: bitDepth === 10 ? settings.hdr : false });
  };

  const reset = () => {
    setExportResult(null);
    setExportProgress({ status: 'idle', percent: 0, message: '' });
    setPlayhead(0);
  };

  const cancel = () => {
    cancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    canvasRef.current?.remove();
    canvasRef.current = null;
    mediaPool.pauseAll();
    mediaPool.endCapture();
    exportingRef.current = false;
    setExportProgress({ status: 'idle', percent: 0, message: '' });
    setPlaying(false);
    addToast('Export cancelled', 'info');
  };

  const startExport = async () => {
    if (!project || exportingRef.current) return;
    if (duration < 0.3) { addToast('Add something to the timeline before exporting', 'info'); return; }
    exportingRef.current = true;
    cancelledRef.current = false;
    lastProgress.current = 0;
    setPlaying(false);
    setPlayhead(0);
    setExportResult(null);
    setExportProgress({ status: 'preparing', percent: 1, message: 'Preparing media…' });

    try {
      await mediaPool.resume();
      await mediaPool.prepare(project, 0, assets);
      if (cancelledRef.current) {
        exportingRef.current = false;
        setExportProgress({ status: 'idle', percent: 0, message: '' });
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:4px;height:4px;';
      document.body.appendChild(canvas);
      canvasRef.current = canvas;

      if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
        throw new Error('This browser does not support in-browser video capture. Try the desktop app or Firefox.');
      }

      const videoStream = canvas.captureStream(settings.fps);
      const audioStream = mediaPool.beginCapture();
      const tracks = [...videoStream.getVideoTracks(), ...(audioStream?.getAudioTracks() || [])];
      const stream = new MediaStream(tracks);
      streamRef.current = stream;
      const mimeType = chooseMime();
      const bitrate = (settings.quality === 'high' ? 26 : 12) * 1_000_000 + (settings.resolution === '4k' ? 14_000_000 : 0);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 });
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };

      const recorderStopped = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      setExportProgress({ status: 'recording', percent: 2, message: 'Recording your edit in real time…' });
      recorder.start(250);

      // Draw the opening frame immediately, then advance a real-time clock.
      canvasRenderer.draw(canvas, project, 0, assets, true, 1);
      const startedAt = performance.now();
      let lastUiUpdate = 0;

      const tick = () => {
        if (cancelledRef.current) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        const time = Math.min(duration, elapsed);
        try {
          canvasRenderer.draw(canvas, project, time, assets, true, 1);
        } catch (error) {
          console.error(error);
        }
        const percent = Math.min(99, 2 + (time / duration) * 94);
        if (performance.now() - lastUiUpdate > 100) {
          lastUiUpdate = performance.now();
          setExportProgress({
            status: 'recording',
            percent,
            message: `Capturing ${formatTime(time)} of ${formatTime(duration)}`
          });
        }
        if (elapsed >= duration + 0.12) {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          finishRecording(recorder, recorderStopped);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (error) {
      exportingRef.current = false;
      mediaPool.endCapture();
      canvasRef.current?.remove();
      canvasRef.current = null;
      setExportProgress({ status: 'error', percent: 0, message: error instanceof Error ? error.message : String(error) });
    }
  };

  const finishRecording = async (recorder: MediaRecorder, recorderStopped: Promise<Blob>) => {
    setExportProgress({ status: 'finalizing', percent: 96, message: `Encoding ${codecName}${settings.bitDepth === 10 ? ' 10-bit' : ''}${settings.hdr ? ' HDR' : ''}${hardwareSelected ? ' on the AMD GPU' : ''}…` });
    mediaPool.pauseAll();
    mediaPool.endCapture();
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await recorderStopped;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      canvasRef.current?.remove();
      canvasRef.current = null;
      if (cancelledRef.current) { exportingRef.current = false; return; }
      if (!blob.size) throw new Error('The recorder returned an empty file.');
      const form = new FormData();
      form.append('video', blob, 'aava-capture.webm');
      form.append('format', settings.format);
      form.append('quality', settings.quality);
      form.append('acceleration', settings.hardwareAcceleration ? 'auto' : 'off');
      form.append('codec', settings.codec);
      form.append('bitDepth', String(settings.bitDepth));
      form.append('hdr', settings.hdr ? '1' : '0');
      form.append('name', settings.name || project.name);
      form.append('fps', String(settings.fps));
      form.append('duration', String(duration));
      const response = await uploadWithProgress(form, (uploadPercent) => {
        setExportProgress({ status: 'finalizing', percent: 96 + uploadPercent * 0.03, message: 'Writing the final file to disk…' });
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'The encoder rejected the file' }));
        throw new Error(error.detail || error.error || 'Export failed');
      }
      const data = await response.json();
      setExportResult(data);
      setExportProgress({ status: 'done', percent: 100, message: 'Export complete' });
      exportingRef.current = false;
      void loadExportHistory();
      setPlayhead(0);
      addToast('Export complete', 'success');
    } catch (error) {
      exportingRef.current = false;
      setExportProgress({ status: 'error', percent: 0, message: error instanceof Error ? error.message : String(error) });
    }
  };

  const copyPath = async () => {
    if (!result?.path) return;
    try {
      await navigator.clipboard.writeText(result.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      addToast('Could not access the clipboard', 'error');
    }
  };

  return (
    <div className="modal-backdrop export-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !active) closeExport(); }}>
      <div className={`export-dialog ${active ? 'is-exporting' : ''}`} role="dialog" aria-modal="true" aria-label="Export video">
        <div className="export-dialog-head">
          <div>
            <span className="eyebrow">Deliver</span>
            <h2>{isDone ? 'Your film is ready' : active ? 'Rendering your edit' : 'Export video'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={closeExport} disabled={active} title="Close">
            <X size={18} />
          </button>
        </div>

        {active || isDone || isError ? (
          <div className="export-progress-view">
            <div className="export-poster export-poster-large" style={{ backgroundImage: `url(${poster})` }}>
              <div className="export-poster-shade" />
              <div className="export-poster-copy">
                <span className="eyebrow">LUMA CUT / MASTER</span>
                <strong>{project.name}</strong>
                <span>{formatTime(duration)} · {dims.width} × {dims.height} · {settings.fps} fps</span>
              </div>
            </div>

            <div className="export-progress-content">
              {active && (
                <>
                  <div className="export-progress-ring" style={{ '--progress': `${Math.round(progress.percent)}%` } as React.CSSProperties}>
                    <div className="ring-inner">
                      <strong>{Math.round(progress.percent)}%</strong>
                      <span>rendered</span>
                    </div>
                  </div>
                  <div className="export-progress-copy">
                    <span className="status-chip"><Loader2 size={13} className="spin" /> {progress.status === 'finalizing' ? 'Encoding' : progress.status === 'preparing' ? 'Preparing' : 'Capturing'}</span>
                    <strong>{progress.status === 'preparing' ? 'Getting the stage ready' : progress.status === 'finalizing' ? 'Finalizing your file' : 'Rendering in real time'}</strong>
                    <p>{progress.message || 'Keep this window in the foreground for a clean capture.'}</p>
                    <div className="export-steps">
                      <span className={progress.status === 'preparing' ? 'is-current' : 'is-done'}>Prepare</span>
                      <i />
                      <span className={progress.status === 'recording' ? 'is-current' : progress.status === 'finalizing' ? 'is-done' : ''}>Capture</span>
                      <i />
                      <span className={progress.status === 'finalizing' ? 'is-current' : ''}>Encode</span>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel export</button>
                  </div>
                </>
              )}

              {isDone && result && (
                <div className="export-done">
                  <div className="export-success-badge"><CheckCircle2 size={24} /></div>
                  <div>
                    <span className="status-chip success"><Check size={12} /> Export complete</span>
                    <strong>{result.filename}</strong>
                    <p>{formatBytes(result.size)} · {settings.format.toUpperCase()} · {dims.width} × {dims.height} · {String(result.codec || settings.codec).toUpperCase()}{result.bitDepth === 10 ? ' 10-bit' : ''}{result.hdr ? ' HDR' : ''}{result.hardware ? ' · AMD' : ''}</p>
                  </div>
                  <div className="export-path">
                    <FolderOpen size={14} />
                    <code>{result.path}</code>
                    <button type="button" className="copy-path" onClick={copyPath}>{copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? 'Copied' : 'Copy'}</button>
                  </div>
                  <div className="export-actions">
                    <a className="btn btn-primary" href={result.url} download={result.filename}><Download size={15} /> Download video</a>
                    <button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw size={14} /> Export again</button>
                    <button type="button" className="btn btn-ghost" onClick={closeExport}>Done</button>
                  </div>
                </div>
              )}

              {isError && (
                <div className="export-error">
                  <XCircle size={22} />
                  <strong>Export failed</strong>
                  <p>{progress.message}</p>
                  <div className="export-actions">
                    <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
                    <button type="button" className="btn btn-ghost" onClick={closeExport}>Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="export-settings-view">
            <div className="export-preview-column">
              <div className="export-poster" style={{ backgroundImage: `url(${poster})` }}>
                <div className="export-poster-shade" />
                <div className="export-poster-copy">
                  <span className="eyebrow">LUMA CUT / MASTER</span>
                  <strong>{project.name}</strong>
                  <span>{formatTime(duration)} · {dims.width} × {dims.height}</span>
                </div>
                <span className="export-play"><MonitorPlay size={18} /></span>
              </div>
              <div className="export-summary">
                <div><span>Duration</span><strong>{formatTime(duration)}</strong></div>
                <div><span>Resolution</span><strong>{dims.width} × {dims.height}</strong></div>
                <div><span>Frame rate</span><strong>{settings.fps} fps</strong></div>
                <div><span>Codec</span><strong>{summaryCodec}</strong></div>
              </div>
              <div className="export-tip">
                <Sparkles size={15} />
                <p>Rendering happens in real time on this machine. For long timelines, keep Aava Cut visible and your computer awake.</p>
              </div>
            </div>

            <div className="export-options">
              <label className="export-name-field">
                <span className="field-label">File name</span>
                <div className="name-input-wrap">
                  <input value={settings.name} onChange={(event) => setExportSettings({ name: event.target.value.replace(/[\\/:*?"<>|]/g, '-') })} />
                  <span>.{settings.format}</span>
                </div>
              </label>

              <div className="export-option-group">
                <span className="field-label">Resolution</span>
                <div className="resolution-cards">
                  {(['720p', '1080p', '4k'] as const).map((value) => (
                    <button type="button" key={value} className={settings.resolution === value ? 'is-active' : ''} onClick={() => setExportSettings({ resolution: value })}>
                      <strong>{value === '4k' ? '4K' : value.toUpperCase()}</strong>
                      <span>{value === '720p' ? 'Fast & light' : value === '1080p' ? 'Full HD master' : 'Ultra crisp'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="export-option-row">
                <div className="export-option-group">
                  <span className="field-label">Frame rate</span>
                  <div className="segmented">
                    {[24, 30, 60].map((value) => (
                      <button type="button" key={value} className={settings.fps === value ? 'is-active' : ''} onClick={() => setExportSettings({ fps: value as ExportSettings['fps'] })}>{value}</button>
                    ))}
                  </div>
                </div>
                <div className="export-option-group">
                  <span className="field-label">Format</span>
                  <div className="segmented">
                    <button type="button" className={settings.format === 'mp4' ? 'is-active' : ''} onClick={() => changeFormat('mp4')}>MP4</button>
                    <button type="button" className={settings.format === 'webm' ? 'is-active' : ''} onClick={() => changeFormat('webm')}>WebM</button>
                  </div>
                </div>
              </div>

              <div className="export-option-group">
                <span className="field-label">Codec</span>
                <div className="codec-cards">
                  {([
                    { id: 'auto' as const, label: 'Auto', hint: 'Best available' },
                    { id: 'h264' as const, label: 'H.264', hint: 'Compatibility' },
                    { id: 'hevc' as const, label: 'H.265', hint: 'HEVC · 10-bit' },
                    { id: 'av1' as const, label: 'AV1', hint: 'Modern · 10-bit' }
                  ]).map((option) => {
                    const available = codecAvailable(option.id);
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={settings.codec === option.id ? 'is-active' : ''}
                        disabled={!available}
                        title={codecReason(option.id)}
                        onClick={() => changeCodec(option.id)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
                {capabilities && !codecAvailable('hevc') && (
                  <div className="export-codec-hint">
                    <Info size={11} />
                    <span>H.265 needs FFmpeg with libx265 or a working HEVC VAAPI driver. Fedora: enable RPM Fusion, install ffmpeg, then restart Aava Cut.</span>
                    <a href="https://github.com/martintondel02/aava-cut/blob/main/docs/HARDWARE.md" target="_blank" rel="noreferrer">Guide</a>
                  </div>
                )}
              </div>

              <div className="export-option-row">
                <div className="export-option-group">
                  <span className="field-label">Bit depth</span>
                  <div className="segmented">
                    <button type="button" className={settings.bitDepth === 8 ? 'is-active' : ''} onClick={() => changeBitDepth(8)}>8-bit</button>
                    <button
                      type="button"
                      className={settings.bitDepth === 10 ? 'is-active' : ''}
                      disabled={!tenBitCapable(settings.codec)}
                      title={tenBitCapable(settings.codec) ? '10-bit 4:2:0 output' : 'Choose H.265 or AV1 for 10-bit output'}
                      onClick={() => changeBitDepth(10)}
                    >10-bit</button>
                  </div>
                </div>
                <div className="export-option-group">
                  <span className="field-label">HDR10</span>
                  <div className="export-hdr-control">
                    <span className={`hdr-badge ${settings.hdr ? 'is-on' : ''}`}>PQ · BT.2020</span>
                    <button
                      type="button"
                      className={`switch ${settings.hdr ? 'is-on' : ''}`}
                      aria-pressed={settings.hdr}
                      disabled={!hdrAvailable}
                      title={hdrAvailable ? 'Convert the SDR canvas to HDR10 PQ / BT.2020' : 'HDR10 requires MP4, 10-bit, and H.265 or AV1'}
                      onClick={() => setExportSettings({ hdr: !settings.hdr })}
                    ><span /></button>
                  </div>
                </div>
              </div>
              <p className="export-hdr-hint">
                {settings.hdr
                  ? 'HDR10 color-manages the SDR timeline to PQ / BT.2020 at a 100-nit reference. It does not recover source highlights.'
                  : settings.bitDepth === 10
                    ? '10-bit 4:2:0 output. HDR10 adds a PQ / BT.2020 conversion.'
                    : 'H.264 is 8-bit only. Choose H.265 or AV1 for 10-bit / HDR10.'}
              </p>

              <div className="export-option-group">
                <span className="field-label">Quality</span>
                <div className="quality-toggle">
                  <button type="button" className={settings.quality === 'standard' ? 'is-active' : ''} onClick={() => setExportSettings({ quality: 'standard' })}>
                    <Film size={15} /><span><strong>Standard</strong><em>Balanced · ~{Math.round(estimatedMb)} MB</em></span>
                  </button>
                  <button type="button" className={settings.quality === 'high' ? 'is-active' : ''} onClick={() => setExportSettings({ quality: 'high' })}>
                    <Sparkles size={15} /><span><strong>High</strong><em>Maximum detail · ~{Math.round(estimatedMb * 2)} MB</em></span>
                  </button>
                </div>
              </div>

              <div className={`export-accel ${hardwareForSelection ? 'is-available' : ''}`}>
                <span className="export-accel-icon"><Cpu size={15} /></span>
                <div className="export-accel-copy">
                  <span className="field-label">AMD GPU acceleration</span>
                  <strong>{hardwareForSelection ? hardwareForSelection.label : capabilities ? 'Software encoding' : 'Detecting…'}</strong>
                  <em>{accelerationDetail}</em>
                </div>
                <button
                  type="button"
                  className={`switch ${hardwareSelected ? 'is-on' : ''}`}
                  disabled={!hardwareForSelection}
                  aria-pressed={hardwareSelected}
                  title={hardwareForSelection ? 'Toggle AMD hardware encoding' : 'No hardware encoder available for this codec'}
                  onClick={() => setExportSettings({ hardwareAcceleration: !settings.hardwareAcceleration })}
                ><span /></button>
              </div>

              <div className="export-target">
                <FolderOpen size={14} />
                <span>Saved locally to your exports folder</span>
              </div>

              <button type="button" className="btn btn-primary export-start-btn" onClick={startExport}>
                <Download size={17} /> Start export
                <span>~{Math.round(estimatedMb)} MB · {formatTime(duration)}</span>
              </button>

              {history.length > 0 && (
                <div className="recent-exports">
                  <div className="section-mini-head"><span>Recent exports</span><span>{history.length}</span></div>
                  {history.slice(0, 3).map((entry) => (
                    <a key={entry.filename} href={entry.url} download={entry.filename} className="recent-export-row">
                      <Film size={13} />
                      <span>{entry.filename}</span>
                      <span>{formatBytes(entry.size)}</span>
                      <Download size={12} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function uploadWithProgress(form: FormData, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/export');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, (event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { 'Content-Type': 'application/json' } }));
    xhr.onerror = () => reject(new Error('Could not reach the export service. Is the Aava Cut server running?'));
    xhr.ontimeout = () => reject(new Error('The export service timed out.'));
    xhr.send(form);
  });
}

import { useState } from 'react';
import { ExternalLink, Loader2, Music2, ShieldAlert } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export function TikTokAudioCard() {
  const refreshAssets = useEditorStore((state) => state.refreshAssets);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addToast = useEditorStore((state) => state.addToast);
  const [url, setUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = async () => {
    if (!url.trim()) { setError('Paste a TikTok video URL first'); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/tiktok/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), confirmed })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'TikTok audio extraction failed');
      await refreshAssets();
      addAssetToTimeline(data.asset.id);
      addToast(`Imported “${data.asset.name}” from TikTok`, 'success');
      setUrl('');
      setConfirmed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'TikTok audio extraction failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tiktok-audio-card">
      <div className="tiktok-audio-head">
        <span className="tiktok-badge">TikTok</span>
        <span className="eyebrow">From a link</span>
      </div>
      <strong>Use the sound from a TikTok video.</strong>
      <p>Paste a TikTok URL. Aava Cut extracts the audio locally with the bundled yt-dlp helper and adds it to your sound library.</p>
      <div className="tiktok-url-row">
        <Music2 size={14} />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.tiktok.com/@creator/video/…"
          spellCheck={false}
          onKeyDown={(event) => { if (event.key === 'Enter' && confirmed && !busy) void extract(); }}
        />
        <button type="button" className="btn btn-primary btn-small" onClick={() => void extract()} disabled={busy || !url.trim() || !confirmed}>
          {busy ? <Loader2 size={13} className="spin" /> : 'Extract'}
        </button>
      </div>
      <label className="tiktok-consent">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I have the rights to use this audio</span>
      </label>
      <span className="tiktok-legal"><ShieldAlert size={12} /> Only download content you own or have permission to use. TikTok terms still apply.</span>
      {error && <div className="pixabay-error">{error}</div>}
      <a className="tiktok-link" href="https://www.tiktok.com/" target="_blank" rel="noreferrer">Open TikTok <ExternalLink size={11} /></a>
    </div>
  );
}

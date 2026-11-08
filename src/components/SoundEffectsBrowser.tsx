import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Pause, Play, Plus, Search, Volume2 } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../lib/utils';

type SoundHit = {
  provider: 'Lots of Sounds';
  id: string;
  name: string;
  description: string;
  tags: string[];
  duration: number;
  previewUrl: string;
  pageURL: string;
  license: string;
  licenseUrl: string;
};

type SoundResponse = {
  hits: SoundHit[];
  attribution: { text: string; url: string; license: string; licenseUrl: string };
  note?: string;
  cached?: boolean;
};

export function SoundEffectsBrowser() {
  const refreshAssets = useEditorStore((state) => state.refreshAssets);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addToast = useEditorStore((state) => state.addToast);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SoundResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '10' });
      const response = await fetch(`/api/sounds/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lots of Sounds search failed');
      setResults(data as SoundResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lots of Sounds search failed');
    } finally {
      setLoading(false);
    }
  };

  const preview = async (hit: SoundHit) => {
    if (playingId === hit.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(hit.previewUrl);
    audio.volume = 0.8;
    audio.onended = () => setPlayingId(null);
    try {
      await audio.play();
      audioRef.current = audio;
      setPlayingId(hit.id);
    } catch {
      addToast('Could not play that preview', 'error');
    }
  };

  const useSound = async (hit: SoundHit) => {
    setImportingId(hit.id);
    try {
      const response = await fetch('/api/sounds/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(hit)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sound import failed');
      await refreshAssets();
      addAssetToTimeline(data.asset.id);
      addToast(`Added “${hit.name}” from Lots of Sounds`, 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : 'Sound import failed', 'error');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="sounds-browser">
      <form className="sounds-search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search free sound effects" />
        <button type="submit" className="btn btn-primary btn-small" disabled={loading}>{loading ? <Loader2 size={13} className="spin" /> : 'Search'}</button>
      </form>
      {error && <div className="pixabay-error">{error}</div>}
      {results ? (
        <>
          <div className="sounds-meta"><span>{results.hits.length} sounds</span><span>{results.cached ? 'cached for 1h' : 'from Lots of Sounds'}</span></div>
          <div className="sounds-list">
            {results.hits.map((hit) => (
              <article key={hit.id} className="sound-card">
                <button type="button" className={`sound-preview ${playingId === hit.id ? 'is-playing' : ''}`} onClick={() => void preview(hit)} title={playingId === hit.id ? 'Pause preview' : 'Preview sound'}>
                  {playingId === hit.id ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div className="sound-copy">
                  <div className="sound-title-row"><strong>{hit.name}</strong><span>{formatTime(hit.duration)}</span></div>
                  <p>{hit.description}</p>
                  <span className="sound-tags">{hit.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}</span>
                </div>
                <button type="button" className="sound-use" onClick={() => void useSound(hit)} disabled={importingId === hit.id}>
                  {importingId === hit.id ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                  {importingId === hit.id ? 'Adding' : 'Use'}
                </button>
              </article>
            ))}
          </div>
          {!results.hits.length && <div className="panel-empty compact"><Volume2 size={22} /><strong>No sounds found</strong><p>Try a different word or a broader effect.</p></div>}
          <div className="sounds-attribution">
            <Volume2 size={13} />
            <span>{results.attribution.text} · <a href={results.attribution.licenseUrl} target="_blank" rel="noreferrer">{results.attribution.license}</a></span>
            <a href={results.attribution.url} target="_blank" rel="noreferrer">Lots of Sounds <ExternalLink size={10} /></a>
          </div>
          {results.note && <span className="pixabay-attribution">{results.note}</span>}
        </>
      ) : !loading && (
        <div className="sounds-empty">
          <div className="sounds-mark"><Volume2 size={23} /></div>
          <strong>Free sound effects, no key.</strong>
          <p>Search the curated CC0 sample collection from Lots of Sounds and drop an effect straight onto the timeline.</p>
          <span className="pixabay-attribution">Sound effects from Lots of Sounds · CC0 sample collection</span>
        </div>
      )}
      {loading && <div className="pixabay-loading"><Loader2 size={18} className="spin" /><span>Searching sound effects…</span></div>}
    </div>
  );
}

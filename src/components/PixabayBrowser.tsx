import { useState } from 'react';
import { ExternalLink, Film, Globe2, Image as ImageIcon, Loader2, Plus, Search, ShieldCheck } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatBytes, formatTime } from '../lib/utils';
import { Segmented } from './ui';

type PixabayResult = {
  provider: 'Pixabay';
  id: string;
  type: 'video' | 'image';
  kind: 'video' | 'image';
  title: string;
  tags: string;
  thumbnail: string;
  downloadUrl: string;
  pageURL: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  creator: string;
  creatorUrl: string;
  license: string;
  licenseUrl: string;
};

type PixabayResponse = {
  hits: PixabayResult[];
  total: number;
  totalHits: number;
  attribution: { text: string; url: string; license: string; licenseUrl: string };
  cached?: boolean;
  rateLimit?: { limit: string | null; remaining: string | null; reset: string | null };
};

export function PixabayBrowser() {
  const key = useSettingsStore((state) => state.pixabayApiKey);
  const openSettings = useSettingsStore((state) => state.openSettings);
  const refreshAssets = useEditorStore((state) => state.refreshAssets);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addToast = useEditorStore((state) => state.addToast);
  const [type, setType] = useState<'video' | 'image'>('video');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PixabayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (page = 1) => {
    if (!key) {
      openSettings();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type, q: query.trim(), page: String(page), per_page: '12' });
      const response = await fetch(`/api/pixabay/search?${params.toString()}`, {
        headers: { 'x-pixabay-key': key }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pixabay search failed');
      setResults(data as PixabayResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pixabay search failed');
    } finally {
      setLoading(false);
    }
  };

  const importResult = async (result: PixabayResult) => {
    if (!key) { openSettings(); return; }
    setImporting(result.id);
    try {
      const response = await fetch('/api/pixabay/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pixabay-key': key },
        body: JSON.stringify(result)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pixabay import failed');
      await refreshAssets();
      addAssetToTimeline(data.asset.id);
      addToast(`Added “${result.title}” from Pixabay`, 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : 'Pixabay import failed', 'error');
    } finally {
      setImporting(null);
    }
  };

  if (!key) {
    return (
      <div className="pixabay-connect">
        <div className="pixabay-brand-mark"><Globe2 size={22} /></div>
        <span className="pixabay-badge">Pixabay</span>
        <strong>Free stock media, one search away.</strong>
        <p>Add your free Pixabay API key in Settings to search photos and videos without leaving Aava Cut.</p>
        <div className="pixabay-connect-actions">
          <button type="button" className="btn btn-primary btn-small" onClick={openSettings}>Open Settings</button>
          <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer">Get a free key <ExternalLink size={12} /></a>
        </div>
        <span className="pixabay-attribution">Photos & videos from Pixabay · Pixabay Content License</span>
      </div>
    );
  }

  return (
    <div className="pixabay-browser">
      <Segmented
        options={[{ value: 'video', label: <><Film size={12} /> Videos</> }, { value: 'image', label: <><ImageIcon size={12} /> Photos</> }]}
        value={type}
        onChange={(value) => { setType(value); setResults(null); }}
      />
      <form className="pixabay-search" onSubmit={(event) => { event.preventDefault(); void search(1); }}>
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Pixabay videos & photos" />
        <button type="submit" className="btn btn-primary btn-small" disabled={loading}>{loading ? <Loader2 size={13} className="spin" /> : 'Search'}</button>
      </form>
      {error && <div className="pixabay-error">{error}</div>}
      {results ? (
        <>
          <div className="pixabay-result-meta">
            <span>{results.hits.length} results</span>
            <span>{results.cached ? 'cached for 24h' : 'fresh from Pixabay'}</span>
          </div>
          <div className="pixabay-grid">
            {results.hits.map((result) => (
              <article key={result.id} className="pixabay-card">
                <div className="pixabay-thumb" style={{ backgroundImage: `url(${result.thumbnail})` }}>
                  <span className="pixabay-card-badge">Pixabay</span>
                  <button type="button" className="pixabay-use" onClick={() => void importResult(result)} disabled={importing === result.id}>
                    {importing === result.id ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                    {importing === result.id ? 'Adding' : 'Use'}
                  </button>
                  {result.kind === 'video' && <span className="pixabay-duration">{formatTime(result.duration)}</span>}
                </div>
                <div className="pixabay-card-copy">
                  <strong>{result.title}</strong>
                  <span>{result.width}×{result.height}{result.size ? ` · ${formatBytes(result.size)}` : ''}</span>
                  <a href={result.pageURL} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    {result.creator} on Pixabay <ExternalLink size={10} />
                  </a>
                </div>
              </article>
            ))}
          </div>
          {!results.hits.length && <div className="panel-empty compact"><Globe2 size={22} /><strong>No results</strong><p>Try a broader search.</p></div>}
          <div className="pixabay-footer">
            <ShieldCheck size={13} />
            <span>{results.attribution?.text || 'Photos and videos from Pixabay'} · <a href={results.attribution?.licenseUrl || 'https://pixabay.com/service/license-summary/'} target="_blank" rel="noreferrer">Pixabay Content License</a></span>
            <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay <ExternalLink size={10} /></a>
          </div>
        </>
      ) : !loading && (
        <div className="pixabay-empty">
          <Globe2 size={26} />
          <strong>Stock footage, without the tab switch.</strong>
          <p>Search Pixabay videos and photos, preview the source, then add it straight to your timeline. Results are cached for 24 hours.</p>
          <span className="pixabay-attribution">Photos & videos from Pixabay · Pixabay Content License</span>
        </div>
      )}
      {loading && <div className="pixabay-loading"><Loader2 size={18} className="spin" /><span>Searching Pixabay…</span></div>}
    </div>
  );
}

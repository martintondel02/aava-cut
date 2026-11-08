import { useMemo, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import type { MediaAsset } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { formatBytes, formatTime } from '../../lib/utils';

export function MediaPanel() {
  const assets = useEditorStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAsset = useEditorStore((state) => state.setSelectedAsset);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const uploadFiles = useEditorStore((state) => state.uploadFiles);
  const uploading = useEditorStore((state) => state.uploading);
  const uploadProgress = useEditorStore((state) => state.uploadProgress);
  const removeAsset = useEditorStore((state) => state.removeAsset);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mediaAssets = useMemo(() => assets.filter((asset) => asset.kind === 'video' || asset.kind === 'image'), [assets]);
  const filtered = mediaAssets.filter((asset) => {
    if (filter !== 'all' && asset.kind !== filter) return false;
    return asset.name.toLowerCase().includes(search.toLowerCase());
  });
  const totalSize = mediaAssets.reduce((sum, asset) => sum + (asset.size || 0), 0);

  const importFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).filter((file) => /^(video|image|audio)\//.test(file.type) || /\.(mp4|mov|webm|mkv|avi|jpg|jpeg|png|webp|gif|mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name));
    if (list.length) void uploadFiles(list);
  };

  return (
    <div className="panel-page">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,image/*,audio/*,.mkv,.mov,.webm,.m4a"
        hidden
        onChange={(event) => { importFiles(event.target.files); event.target.value = ''; }}
      />

      <div className="panel-actions-row">
        <button type="button" className="btn btn-primary panel-import-btn" onClick={() => inputRef.current?.click()}>
          <Plus size={16} /> Import media
        </button>
        <span className="panel-actions-hint" title="Supported: MP4, MOV, WebM, JPG and PNG"><span>MP4 · MOV · WebM</span><span>JPG · PNG</span></span>
      </div>

      <div className="search-box">
        <Search size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your media" />
        {search && <button type="button" onClick={() => setSearch('')}><X size={13} /></button>}
      </div>

      <div className="filter-chips">
        {(['all', 'video', 'image'] as const).map((value) => (
          <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
            {value === 'all' ? 'All' : value === 'video' ? 'Video' : 'Photos'}
            <span>{value === 'all' ? mediaAssets.length : mediaAssets.filter((asset) => asset.kind === value).length}</span>
          </button>
        ))}
      </div>

      <div
        className={`media-dropzone ${dragging ? 'is-dragging' : ''} ${uploading ? 'is-uploading' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          importFiles(event.dataTransfer.files);
        }}
      >
        {uploading ? (
          <>
            <div className="dropzone-icon"><UploadCloud size={20} /></div>
            <div className="dropzone-copy"><strong>Importing…</strong><span>{uploadProgress}%</span></div>
            <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }} /></div>
          </>
        ) : (
          <>
            <div className="dropzone-icon"><UploadCloud size={20} /></div>
            <div className="dropzone-copy"><strong>Drop media anywhere</strong><span>or click Import. Files stay on this machine.</span></div>
          </>
        )}
      </div>

      {filtered.length ? (
        <div className="media-grid">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={selectedAssetId === asset.id}
              onSelect={() => setSelectedAsset(asset.id)}
              onAdd={() => addAssetToTimeline(asset.id)}
              onRemove={asset.source === 'upload' ? () => void removeAsset(asset.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="panel-empty">
          <div className="panel-empty-icon"><Film size={24} /></div>
          <strong>No media found</strong>
          <p>{mediaAssets.length ? 'Try a different search or filter.' : 'Import videos and photos to start building your story.'}</p>
          {!mediaAssets.length && <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}><Plus size={15} /> Choose files</button>}
        </div>
      )}

      <div className="panel-footer">
        <span>{mediaAssets.length} items</span>
        <span>{formatBytes(totalSize)} · local library</span>
      </div>

      {dragging && <div className="panel-drop-overlay">Drop to import</div>}
    </div>
  );
}

function AssetCard({
  asset, selected, onSelect, onAdd, onRemove
}: {
  asset: MediaAsset;
  selected: boolean;
  onSelect: () => void;
  onAdd: () => void;
  onRemove?: () => void;
}) {
  const kindLabel = asset.kind === 'video' ? 'Video' : 'Photo';
  return (
    <article
      className={`media-card ${selected ? 'is-selected' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-lumacut-asset', asset.id);
        event.dataTransfer.setData('text/plain', asset.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onSelect}
      onDoubleClick={onAdd}
      title={`${asset.name}\nDouble-click to add to timeline`}
    >
      <div className="media-thumb" style={asset.thumbnail ? { backgroundImage: `url(${asset.thumbnail})` } : undefined}>
        {!asset.thumbnail && <div className="media-thumb-fallback"><Film size={22} /></div>}
        <span className="media-kind-badge">{asset.kind === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}{kindLabel}</span>
        {asset.kind === 'video' && <span className="media-duration-badge">{formatTime(asset.duration)}</span>}
        <button
          type="button"
          className="media-quick-add"
          title="Add to timeline"
          onClick={(event) => { event.stopPropagation(); onAdd(); }}
        >
          <Plus size={15} />
        </button>
        {onRemove && (
          <button
            type="button"
            className="media-remove"
            title="Remove from library"
            onClick={(event) => { event.stopPropagation(); onRemove(); }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="media-card-meta">
        <span className="media-name">{asset.name}</span>
        <span className="media-sub">
          {asset.kind === 'video' ? `${asset.width}×${asset.height}` : `${asset.width}×${asset.height}`}
          {asset.size ? ` · ${formatBytes(asset.size)}` : ''}
        </span>
      </div>
    </article>
  );
}

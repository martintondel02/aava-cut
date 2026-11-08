import { useEffect, useState } from 'react';
import {
  ArrowUpRight, Bot, Check, CircleHelp, Copy, Cpu, Download, ExternalLink, Gauge, Github, Globe2, Info, KeyRound, LayoutPanelTop, Moon, Monitor,
  Palette, Play, RotateCcw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, TimerReset, Trash2, Volume2, X
} from 'lucide-react';
import { useSettingsStore, type Accent, type ThemeMode } from '../store/settingsStore';
import { useEditorStore, STORAGE_KEY } from '../store/editorStore';
import { Segmented, ToggleRow } from './ui';
import { LogoMark } from './brand/LogoMark';
import { formatBytes } from '../lib/utils';

type SettingsSection = 'appearance' | 'playback' | 'timeline' | 'pixabay' | 'agent' | 'export' | 'storage' | 'about';

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: typeof Palette }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'timeline', label: 'Timeline', icon: LayoutPanelTop },
  { id: 'pixabay', label: 'Pixabay', icon: Globe2 },
  { id: 'agent', label: 'Agent bridge', icon: Bot },
  { id: 'export', label: 'Export', icon: Download },
  { id: 'storage', label: 'Storage', icon: TimerReset },
  { id: 'about', label: 'About', icon: Info }
];

const ACCENTS: Array<{ id: Accent; label: string }> = [
  { id: 'mint', label: 'Mint' },
  { id: 'blue', label: 'Blue' },
  { id: 'amber', label: 'Amber' },
  { id: 'rose', label: 'Rose' }
];

const THEMES: Array<{ id: ThemeMode; label: string; icon: typeof Sun; copy: string }> = [
  { id: 'system', label: 'System', icon: Monitor, copy: 'Follow Linux' },
  { id: 'dark', label: 'Dark', icon: Moon, copy: 'Late-night edit' },
  { id: 'light', label: 'Light', icon: Sun, copy: 'Editorial daylight' }
];

export function SettingsPage() {
  const open = useSettingsStore((state) => state.open);
  const closeSettings = useSettingsStore((state) => state.closeSettings);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeSettings]);

  if (!open) return null;
  return <SettingsSheet onClose={closeSettings} />;
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  const addToast = useEditorStore((state) => state.addToast);
  const [section, setSection] = useState<SettingsSection>('appearance');
  const [serverOnline, setServerOnline] = useState(false);
  const [hardware, setHardware] = useState<{ detected: boolean; label: string | null; codec: string | null } | null>(null);
  const [agentInfo, setAgentInfo] = useState<{ mcpPath?: string; apiVersion?: string } | null>(null);
  const [storage, setStorage] = useState<{ media: { bytes: number; files: number }; thumbs: { bytes: number; files: number }; frames: { bytes: number; files: number }; exports: { bytes: number; files: number }; data: { bytes: number; files: number }; total: number; assets: number } | null>(null);
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const refreshAssets = useEditorStore((state) => state.refreshAssets);

  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => {
        setServerOnline(response.ok);
        if (!response.ok) return;
        const data = await response.json();
        setHardware(data.hardware || null);
      })
      .catch(() => setServerOnline(false));
    fetch('/api/agent/capabilities')
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setAgentInfo(data); })
      .catch(() => {});
    fetch('/api/storage').then(async (response) => response.ok ? response.json() : null).then((data) => { if (data) setStorage(data); }).catch(() => {});
  }, []);

  const resetAll = () => {
    if (!window.confirm('Reset all appearance, playback, timeline and export settings?')) return;
    useSettingsStore.getState().reset();
    addToast('Settings reset to defaults', 'success');
  };

  const clearAutosave = () => {
    if (!window.confirm('Remove the browser autosave? The current edit stays open, but a reload will start with a blank project.')) return;
    localStorage.removeItem(STORAGE_KEY);
    addToast('Browser autosave cleared', 'info');
  };

  const refreshStorage = async () => {
    const response = await fetch('/api/storage').catch(() => null);
    if (response?.ok) setStorage(await response.json());
  };

  const cleanupStorage = async (scope: 'frames' | 'exports' | 'unused-assets') => {
    let body: Record<string, unknown> = { scope };
    if (scope === 'unused-assets') {
      const keep = new Set((project?.clips || []).map((clip) => clip.assetId).filter(Boolean));
      const unused = assets.filter((asset) => !keep.has(asset.id));
      if (!unused.length) { addToast('Every library asset is used by this project', 'info'); return; }
      if (!window.confirm(`Remove ${unused.length} unused ${unused.length === 1 ? 'asset' : 'assets'} from the library and delete their source files?`)) return;
      body = { scope, keepAssetIds: [...keep] };
    } else if (scope === 'exports') {
      if (!window.confirm('Delete every file in the exports folder? This cannot be undone.')) return;
    } else if (!window.confirm('Clear all generated frame and contact-sheet caches?')) return;
    const response = await fetch('/api/storage/cleanup', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) { addToast(data.error || 'Cleanup failed', 'error'); return; }
    await refreshAssets();
    setStorage(data.storage);
    addToast(scope === 'unused-assets' ? 'Unused media removed' : 'Storage cleaned', 'success');
  };

  return (
    <div className="settings-overlay">
      <div className="settings-page" role="dialog" aria-modal="true" aria-label="Aava Cut settings">
        <header className="settings-topbar">
          <div className="settings-brand">
            <span className="settings-brand-icon"><Settings2 size={17} /></span>
            <div>
              <span className="eyebrow">Preferences</span>
              <h1>Settings</h1>
            </div>
          </div>
          <div className="settings-topbar-right">
            <span className={`server-pill ${serverOnline ? 'is-online' : 'is-offline'}`}><span />{serverOnline ? 'Local server online' : 'Server offline'}</span>
            <button type="button" className="btn btn-primary btn-small" onClick={onClose}>Back to editor <kbd>Esc</kbd></button>
            <button type="button" className="icon-btn" onClick={onClose} title="Close settings"><X size={18} /></button>
          </div>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <span className="settings-nav-label">Preferences</span>
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button type="button" key={item.id} className={section === item.id ? 'is-active' : ''} onClick={() => setSection(item.id)}>
                  <Icon size={15} /> {item.label}
                </button>
              );
            })}
            <div className="settings-nav-footer">
              <a href="https://github.com/martintondel02/aava-cut" target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a>
              <a href="https://github.com/martintondel02/aava-cut/blob/main/docs/AGENT_ROADMAP.md" target="_blank" rel="noreferrer"><CircleHelp size={14} /> Roadmap</a>
            </div>
          </nav>

          <main className="settings-content">
            {section === 'appearance' && (
              <SettingsSection title="Appearance" eyebrow="Look & feel" description="Choose how Aava Cut looks and how much room the interface takes.">
                <div className="theme-grid">
                  {THEMES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`theme-card theme-${item.id} ${settings.theme === item.id ? 'is-active' : ''}`}
                        onClick={() => settings.update({ theme: item.id })}
                      >
                        <span className="theme-card-preview">
                          <span className="theme-mock-top" />
                          <span className="theme-mock-panel" />
                          <span className="theme-mock-center" />
                          <span className="theme-mock-track track-one" />
                          <span className="theme-mock-track track-two" />
                          {item.id === 'system' && <span className="theme-mock-split" />}
                        </span>
                        <span className="theme-card-copy"><Icon size={14} /><span><strong>{item.label}</strong><em>{item.copy}</em></span>{settings.theme === item.id && <Check size={15} />}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="settings-group">
                  <div className="settings-group-head">
                    <div><span className="settings-label">Accent color</span><span className="settings-help">Selections, active tools and focus states.</span></div>
                  </div>
                  <div className="accent-row">
                    {ACCENTS.map((accent) => (
                      <button type="button" key={accent.id} className={`accent-swatch accent-${accent.id} ${settings.accent === accent.id ? 'is-active' : ''}`} onClick={() => settings.update({ accent: accent.id })} title={accent.label}>
                        <span />{accent.label}{settings.accent === accent.id && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <div className="settings-group-head">
                    <div><span className="settings-label">Interface scale</span><span className="settings-help">Make every panel, control and clip easier to read.</span></div>
                    <strong className="scale-readout">{settings.scale}%</strong>
                  </div>
                  <input
                    className="range-input settings-range"
                    type="range"
                    min={80}
                    max={140}
                    step={5}
                    value={settings.scale}
                    style={{ '--range-progress': `${((settings.scale - 80) / 60) * 100}%` } as React.CSSProperties}
                    onChange={(event) => settings.update({ scale: Number(event.target.value) })}
                  />
                  <div className="scale-presets">
                    {[80, 90, 100, 110, 120, 140].map((value) => (
                      <button type="button" key={value} className={settings.scale === value ? 'is-active' : ''} onClick={() => settings.update({ scale: value })}>{value}%</button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <div className="settings-group-head">
                    <div><span className="settings-label">Density</span><span className="settings-help">Compact mode fits more controls above the fold.</span></div>
                  </div>
                  <Segmented
                    options={[{ value: 'comfortable', label: 'Comfortable', title: 'More breathing room' }, { value: 'compact', label: 'Compact', title: 'More interface per screen' }]}
                    value={settings.density}
                    onChange={(value) => settings.update({ density: value })}
                  />
                </div>

                <ToggleRow label="Reduce motion" hint="Turn off non-essential interface animation. Export is unaffected." checked={settings.reduceMotion} onChange={(checked) => settings.update({ reduceMotion: checked })} />
              </SettingsSection>
            )}

            {section === 'playback' && (
              <SettingsSection title="Playback" eyebrow="Monitor" description="Control the preview experience without changing your export.">
                <div className="settings-group">
                  <div className="settings-group-head"><div><span className="settings-label">Preview quality</span><span className="settings-help">Lower quality gives smoother scrubbing on slower machines.</span></div></div>
                  <div className="preference-cards three">
                    {[
                      { value: 'auto' as const, label: 'Auto', copy: 'Adaptive' },
                      { value: 'full' as const, label: 'Full', copy: 'Best detail' },
                      { value: 'half' as const, label: 'Half', copy: 'Smoother' }
                    ].map((option) => (
                      <button type="button" key={option.value} className={settings.previewQuality === option.value ? 'is-active' : ''} onClick={() => settings.update({ previewQuality: option.value })}>
                        <strong>{option.label}</strong><span>{option.copy}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleRow label="Audio visualizer" hint="Show the live analyser as its own section in the Sound panel." checked={settings.visualizer} onChange={(checked) => settings.update({ visualizer: checked })} />
                <div className="settings-group">
                  <div className="settings-group-head"><div><span className="settings-label">Visualizer style</span><span className="settings-help">Choose the shape of the live analyser.</span></div></div>
                  <Segmented
                    options={[{ value: 'spectrum', label: 'Spectrum' }, { value: 'waveform', label: 'Waveform' }, { value: 'radial', label: 'Radial' }]}
                    value={settings.visualizerStyle}
                    onChange={(value) => settings.update({ visualizerStyle: value })}
                  />
                </div>
                <ToggleRow label="Loop playback" hint="Restart the cut when the playhead reaches the end." checked={settings.loopPlayback} onChange={(checked) => settings.update({ loopPlayback: checked })} />
              </SettingsSection>
            )}

            {section === 'timeline' && (
              <SettingsSection title="Timeline" eyebrow="Editor behavior" description="Tune the timeline for the way you cut.">
                <ToggleRow label="Show audio waveforms" hint="Draw waveform peaks inside audio and video clips." checked={settings.showWaveforms} onChange={(checked) => settings.update({ showWaveforms: checked })} />
                <ToggleRow label="Follow playhead" hint="Scroll the timeline during playback to keep the playhead in view." checked={settings.followPlayhead} onChange={(checked) => settings.update({ followPlayhead: checked })} />
                <ToggleRow label="Ripple delete" hint="Move later clips on the same track left to close the gap when deleting." checked={settings.rippleDelete} onChange={(checked) => settings.update({ rippleDelete: checked })} />
                <ToggleRow label="Auto-expand keyframe lanes" hint="Open animated channels when a keyframed clip is selected." checked={settings.autoExpandKeyframes} onChange={(checked) => settings.update({ autoExpandKeyframes: checked })} />
                <ToggleRow label="Auto-key by default" hint="Create a keyframe when an animatable property changes at the playhead." checked={settings.autoKeyframe} onChange={(checked) => settings.update({ autoKeyframe: checked })} />
                <div className="settings-group">
                  <div className="settings-group-head"><div><span className="settings-label">Timeline shortcuts</span><span className="settings-help">The editor's time shortcuts are always available.</span></div></div>
                  <div className="settings-kbd-grid">
                    <span><kbd>Space</kbd> Play</span><span><kbd>B</kbd> Split</span><span><kbd>← →</kbd> Frame</span><span><kbd>Del</kbd> Delete</span>
                  </div>
                </div>
              </SettingsSection>
            )}

            {section === 'pixabay' && (
              <SettingsSection title="Pixabay" eyebrow="Stock media" description="Search free photos and videos from Pixabay without leaving the edit. Results are cached for 24 hours and every result keeps its creator and license attribution.">
                <div className="settings-group pixabay-settings-card">
                  <div className="settings-group-head">
                    <div>
                      <span className="settings-label">Pixabay API key</span>
                      <span className="settings-help">Stored only in this browser's local settings. It is sent to the local Aava Cut server to call Pixabay.</span>
                    </div>
                    <span className={`pixabay-key-status ${settings.pixabayApiKey ? 'is-set' : ''}`}>{settings.pixabayApiKey ? 'Key saved' : 'Not connected'}</span>
                  </div>
                  <label className="settings-input-wrap">
                    <KeyRound size={14} />
                    <input
                      type="password"
                      value={settings.pixabayApiKey}
                      onChange={(event) => settings.update({ pixabayApiKey: event.target.value.trim() })}
                      placeholder="Paste your Pixabay API key"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="pixabay-settings-actions">
                    <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer">Get a free Pixabay API key <ExternalLink size={12} /></a>
                    <span><ShieldCheck size={12} /> Photos & videos from Pixabay</span>
                  </div>
                </div>
                <div className="pixabay-settings-note">
                  <Globe2 size={16} />
                  <div>
                    <strong>Music and sound effects</strong>
                    <p>Pixabay's public API currently exposes photos and videos. Use the Pixabay links in the Sound panel to browse music and SFX, then import the downloaded audio file.</p>
                  </div>
                </div>
              </SettingsSection>
            )}

            {section === 'agent' && (
              <SettingsSection title="Agent bridge" eyebrow="Bring your own agent" description="Connect Claude Code, Codex, DeepSeek Harness or OpenCode to the live timeline through a local MCP server. The agent gets validated editing tools, not shell access.">
                <AgentBridgeCard settings={settings} serverOnline={serverOnline} agentInfo={agentInfo} addToast={addToast} />
              </SettingsSection>
            )}

            {section === 'export' && (
              <SettingsSection title="Export" eyebrow="Delivery" description="These defaults are applied every time you open the export dialog. Codec, bit depth and HDR10 are chosen per export.">
                <div className="settings-group">
                  <div className="settings-group-head"><div><span className="settings-label">Default resolution</span><span className="settings-help">You can still change this per export.</span></div></div>
                  <Segmented
                    options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }, { value: '4k', label: '4K' }]}
                    value={settings.exportDefaults.resolution}
                    onChange={(value) => settings.update({ exportDefaults: { ...settings.exportDefaults, resolution: value } })}
                  />
                </div>
                <div className="settings-two-col">
                  <div className="settings-group">
                    <div className="settings-group-head"><div><span className="settings-label">Frame rate</span></div></div>
                    <Segmented
                      options={[{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }]}
                      value={settings.exportDefaults.fps}
                      onChange={(value) => settings.update({ exportDefaults: { ...settings.exportDefaults, fps: value as 24 | 30 | 60 } })}
                    />
                  </div>
                  <div className="settings-group">
                    <div className="settings-group-head"><div><span className="settings-label">Format</span></div></div>
                    <Segmented
                      options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }]}
                      value={settings.exportDefaults.format}
                      onChange={(value) => settings.update({ exportDefaults: { ...settings.exportDefaults, format: value } })}
                    />
                  </div>
                </div>
                <div className="settings-group">
                  <div className="settings-group-head"><div><span className="settings-label">Quality</span><span className="settings-help">High uses more disk and encode time.</span></div></div>
                  <div className="preference-cards">
                    <button type="button" className={settings.exportDefaults.quality === 'standard' ? 'is-active' : ''} onClick={() => settings.update({ exportDefaults: { ...settings.exportDefaults, quality: 'standard' } })}>
                      <strong>Standard</strong><span>Balanced, smaller files</span>
                    </button>
                    <button type="button" className={settings.exportDefaults.quality === 'high' ? 'is-active' : ''} onClick={() => settings.update({ exportDefaults: { ...settings.exportDefaults, quality: 'high' } })}>
                      <strong>High</strong><span>Maximum detail</span>
                    </button>
                  </div>
                </div>
                <ToggleRow
                  label="AMD GPU acceleration"
                  hint={hardware?.detected
                    ? `${hardware.label || 'AMD VAAPI encoder detected'}. Hardware export falls back to CPU if the driver rejects a frame.`
                    : hardware
                      ? 'No AMD VAAPI encoder detected. Exports use the CPU.'
                      : 'Checking the local server for AMD hardware…'}
                  checked={settings.exportDefaults.hardwareAcceleration}
                  onChange={(checked) => settings.update({ exportDefaults: { ...settings.exportDefaults, hardwareAcceleration: checked } })}
                />
              </SettingsSection>
            )}

            {section === 'storage' && (
              <SettingsSection title="Storage" eyebrow="Local data" description="Aava Cut keeps everything on this machine. These controls only affect local data.">
                <div className="storage-card">
                  <div><span className="settings-label">Browser autosave</span><span className="settings-help">The current project is saved automatically as you edit.</span></div>
                  <button type="button" className="btn btn-secondary" onClick={clearAutosave}><RotateCcw size={14} /> Clear autosave</button>
                </div>
                <div className="storage-card">
                  <div><span className="settings-label">Settings</span><span className="settings-help">Restore theme, scale, playback and export preferences.</span></div>
                  <button type="button" className="btn btn-secondary" onClick={resetAll}><RotateCcw size={14} /> Reset settings</button>
                </div>
                <div className="storage-card">
                  <div>
                    <span className="settings-label">Disk usage</span>
                    <span className="settings-help">{storage ? `${formatBytes(storage.total)} across ${storage.assets} assets · ${storage.frames.files} generated frames` : 'Reading local storage…'}</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => void refreshStorage()} disabled={!serverOnline}>Refresh</button>
                </div>
                {storage && (
                  <div className="storage-breakdown">
                    <div><span>Source media</span><strong>{formatBytes(storage.media.bytes)}</strong><em>{storage.media.files} files</em></div>
                    <div><span>Thumbnails</span><strong>{formatBytes(storage.thumbs.bytes)}</strong><em>{storage.thumbs.files} files</em></div>
                    <div><span>Frames cache</span><strong>{formatBytes(storage.frames.bytes)}</strong><em>{storage.frames.files} files</em></div>
                    <div><span>Exports</span><strong>{formatBytes(storage.exports.bytes)}</strong><em>{storage.exports.files} files</em></div>
                    <div><span>Project data</span><strong>{formatBytes(storage.data.bytes)}</strong><em>{storage.data.files} files</em></div>
                  </div>
                )}
                <div className="storage-card">
                  <div><span className="settings-label">Generated frame cache</span><span className="settings-help">Timeline frames, contact sheets and agent previews. Safe to clear; they regenerate on demand.</span></div>
                  <button type="button" className="btn btn-secondary" onClick={() => void cleanupStorage('frames')} disabled={!serverOnline}><Trash2 size={14} /> Clear cache</button>
                </div>
                <div className="storage-card">
                  <div><span className="settings-label">Unused library media</span><span className="settings-help">Deleting a timeline clip keeps its source in the library. This removes assets not used by the current project and deletes their files.</span></div>
                  <button type="button" className="btn btn-secondary" onClick={() => void cleanupStorage('unused-assets')} disabled={!serverOnline || !assets.length}><Trash2 size={14} /> Remove unused</button>
                </div>
                <div className="storage-card">
                  <div><span className="settings-label">Exports</span><span className="settings-help">Finished renders stay in the exports folder until you remove them.</span></div>
                  <button type="button" className="btn btn-secondary" onClick={() => void cleanupStorage('exports')} disabled={!serverOnline}><Trash2 size={14} /> Clear exports</button>
                </div>

                <div className="storage-summary">
                  <div><span>Media</span><strong>media/</strong><em>Uploaded source files</em></div>
                  <div><span>Exports</span><strong>exports/</strong><em>Finished renders</em></div>
                  <div><span>Projects</span><strong>localStorage</strong><em>Instant autosave</em></div>
                </div>
              </SettingsSection>
            )}

            {section === 'about' && (
              <SettingsSection title="About Aava Cut" eyebrow="Version 2.1.0" description="A local-first video editor for Linux, tuned for AMD Radeon, Fedora and 10-bit delivery.">
                <div className="about-hero">
                  <div className="about-mark"><LogoMark size={50} /></div>
                  <div>
                    <h2>Aava Cut <span>2.1.0</span></h2>
                    <p>Cut. Color. Caption. Create.</p>
                    <div className="about-badges"><span>MIT</span><span>Linux</span><span>AMD Radeon</span><span>Fedora RPM</span><span>10-bit HDR</span><span>Local-first</span></div>
                  </div>
                </div>
                <div className="about-links">
                  <a href="https://martintondel02.github.io/aava-site/" target="_blank" rel="noreferrer"><Globe2 size={16} /><span><strong>Aava website</strong><em>aava.dev · suite home and releases</em></span><ExternalLink size={13} /></a>
                  <a href="https://github.com/martintondel02/aava-cut" target="_blank" rel="noreferrer"><Github size={16} /><span><strong>GitHub repository</strong><em>Source, issues and releases</em></span><ExternalLink size={13} /></a>
                  <a href="https://github.com/martintondel02/aava-cut/blob/main/docs/BRAND.md" target="_blank" rel="noreferrer"><Gauge size={16} /><span><strong>Aava brand guide</strong><em>Logo, colour, voice and product naming</em></span><ExternalLink size={13} /></a>
                  <a href="https://github.com/martintondel02/aava-cut/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer"><Gauge size={16} /><span><strong>Changelog</strong><em>Aava Cut 2.1, polish and brand guide</em></span><ExternalLink size={13} /></a>
                  <a href="https://github.com/martintondel02/aava-cut/blob/main/docs/HARDWARE.md" target="_blank" rel="noreferrer"><Cpu size={16} /><span><strong>Hardware & codecs</strong><em>H.265 install, AMD VAAPI, HDR10 and 10-bit</em></span><ExternalLink size={13} /></a>
                  <a href="https://github.com/martintondel02/aava-cut/releases/latest" target="_blank" rel="noreferrer"><Sparkles size={16} /><span><strong>Download latest</strong><em>AppImage · DEB · RPM</em></span><ExternalLink size={13} /></a>
                </div>
                <div className="about-facts">
                  <div><span>Runtime</span><strong>{navigator.userAgent.includes('Electron') ? 'Electron desktop' : 'Web app'}</strong></div>
                  <div><span>Audio engine</span><strong>Web Audio API</strong></div>
                  <div><span>Encoding</span><strong>FFmpeg {serverOnline ? '· online' : '· offline'}</strong></div>
                  <div><span>GPU acceleration</span><strong>{hardware?.detected ? hardware.label || 'CPU fallback' : 'CPU fallback'}</strong></div>
                  <div><span>Codecs</span><strong>H.264 · H.265 · AV1</strong></div>
                  <div><span>Bit depth</span><strong>8-bit · 10-bit · HDR10</strong></div>
                  <div><span>Packages</span><strong>AppImage · DEB · RPM</strong></div>
                  <div><span>Auto captions</span><strong>Whisper.cpp · local</strong></div>
                  <div><span>Privacy</span><strong>Local only</strong></div>
                </div>
                <p className="about-credit">Aava Cut is the first product from Aava. Built with React, TypeScript, Canvas, Web Audio and FFmpeg. Independent project; not affiliated with CapCut or ByteDance.</p>
              </SettingsSection>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function makeAgentToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `lc_${crypto.randomUUID().replace(/-/g, '')}`;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `lc_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function AgentBridgeCard({
  settings,
  serverOnline,
  agentInfo,
  addToast
}: {
  settings: ReturnType<typeof useSettingsStore.getState>;
  serverOnline: boolean;
  agentInfo: { mcpPath?: string; apiVersion?: string } | null;
  addToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}) {
  const token = settings.agentBridgeToken;
  const enabled = settings.agentBridgeEnabled;
  const maskedToken = token ? `${token.slice(0, 12)}…${token.slice(-6)}` : 'Generated when enabled';
  const mcpPath = agentInfo?.mcpPath || 'server/mcp.mjs';
  const config = JSON.stringify({
    mcpServers: {
      aava: {
        command: 'node',
        args: [mcpPath],
        env: {
          AAVA_AGENT_URL: window.location.origin,
          AAVA_AGENT_TOKEN: token || '<enable Agent Bridge to generate>'
        }
      }
    }
  }, null, 2);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${label} copied`, 'success');
    } catch {
      addToast('Clipboard access was blocked', 'error');
    }
  };

  const toggle = (checked: boolean) => {
    const nextToken = token || makeAgentToken();
    settings.update({ agentBridgeEnabled: checked, agentBridgeToken: nextToken });
  };

  return (
    <div className={`agent-bridge-card ${enabled ? 'is-live' : ''}`}>
      <div className="agent-bridge-hero">
        <div className="agent-orbit"><Bot size={22} /></div>
        <div className="agent-bridge-copy">
          <span className="eyebrow">Local MCP · live timeline</span>
          <h3>Give your agent the timeline.</h3>
          <p>External harnesses connect to the open project over localhost. Every edit is a validated command with a previewable diff.</p>
        </div>
        <span className={`agent-bridge-status ${enabled && serverOnline ? 'is-live' : ''}`}><i />{enabled ? (serverOnline ? 'Live' : 'Waiting for server') : 'Off'}</span>
      </div>

      <ToggleRow
        label="Enable Agent Bridge"
        hint="Starts a live local session and keeps the open timeline in sync. Disable to revoke access."
        checked={enabled}
        onChange={toggle}
      />

      <div className="agent-bridge-grid">
        <div className="agent-bridge-field">
          <span><Terminal size={12} /> MCP endpoint</span>
          <code>{window.location.origin}</code>
        </div>
        <div className="agent-bridge-field">
          <span><KeyRound size={12} /> Session token</span>
          <code>{maskedToken}</code>
          <button type="button" className="icon-btn" title="Copy session token" disabled={!token} onClick={() => void copy(token, 'Token')}><Copy size={13} /></button>
        </div>
      </div>

      <div className="agent-bridge-config">
        <div className="agent-bridge-config-head">
          <span><Terminal size={13} /> MCP client config</span>
          <button type="button" className="btn btn-small" disabled={!token} onClick={() => void copy(config, 'MCP config')}><Copy size={12} /> Copy config</button>
        </div>
        <pre>{config}</pre>
      </div>

      <div className="agent-bridge-notes">
        <ShieldCheck size={14} />
        <span>Localhost only. The token can be rotated by disabling and re-enabling the bridge.</span>
        <a href="https://github.com/martintondel02/aava-cut/blob/main/docs/AGENT_ROADMAP.md" target="_blank" rel="noreferrer">Roadmap <ArrowUpRight size={12} /></a>
      </div>
    </div>
  );
}

function SettingsSection({ title, eyebrow, description, children }: {
  title: string;
  eyebrow: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-section-page">
      <div className="settings-section-head">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-section-body">{children}</div>
    </div>
  );
}

export function QuickThemeButton() {
  const theme = useSettingsStore((state) => state.theme);
  const update = useSettingsStore((state) => state.update);
  const resolved = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  return (
    <button
      type="button"
      className="icon-btn theme-quick-btn"
      title={`Switch to ${resolved === 'light' ? 'dark' : 'light'} theme`}
      onClick={() => update({ theme: resolved === 'light' ? 'dark' : 'light' })}
    >
      {resolved === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

# Changelog

## 1.15.0 — 2026-11-08

### Added

- **Storage management** in Settings → Storage
  - real usage for source media, thumbnails, generated frames, exports and project data
  - clear generated frame/contact-sheet caches
  - remove library assets not used by the current project and delete their source files
  - clear finished exports
  - confirmation for every destructive action
- **Delete source from library** button on audio cards (including TikTok and Lots of Sounds imports)
- Usage-aware removal warnings when a file is still referenced by timeline clips
- Shared source-file + thumbnail deletion for imported stock and extracted audio

### Clarified

- Deleting a timeline clip intentionally keeps the source file in the library so undo/reuse works
- Asset deletion is a separate explicit action
- Storage usage is exposed through `/api/storage`; cleanup is handled by `/api/storage/cleanup`

### Verification

- 34/34 Playwright tests pass
- Added storage usage and Storage-panel tests
- Typecheck, production build, AppImage, DEB and RPM pass
- Bundled yt-dlp packaging verified again

## 1.14.0 — 2026-11-08

### Added

- **TikTok audio from a link**
  - paste a TikTok URL in the Audio panel
  - explicit rights-confirmation checkbox
  - local extraction through the **bundled yt-dlp** helper
  - FFmpeg MP3 conversion, local library import and timeline insertion
  - TikTok provenance, creator and source URL retained
  - actionable errors for invalid links, missing consent, unsupported content and concurrent jobs
- **yt-dlp packaging**
  - checksum-pinned standalone binary downloaded by `npm run fetch:yt-dlp`
  - bundled under `resources/bin/yt-dlp` via electron-builder `extraResources`
  - release workflow fetches and verifies it before packaging
  - source/dev falls back to a system `yt-dlp`

### Security

- only `tiktok.com` and its short-link hosts are accepted
- yt-dlp is spawned with an argument array, never a shell
- 180-second timeout, size cap, one extraction at a time
- temporary directories removed after success or failure
- consent is required before any network extraction

### Verification

- 33/33 Playwright tests pass
- New tests cover non-TikTok rejection, consent enforcement, bundled-extractor capability and the Audio-panel UI
- Typecheck, production build, AppImage, DEB and RPM pass
- Packaged binary path verified

## 1.13.0 — 2026-11-08

### Added

- **Lots of Sounds** sound-effect browser in the Audio panel
  - no API key required for the CC0 sample collection
  - search, preview and **Use** to download locally and add to the timeline
  - creator/provider attribution and CC0 license links on every result
  - 1-hour search cache; temporary signed previews
- **Resizable side panels**
  - drag the left asset panel and right inspector edges
  - widths persist in local settings
  - double-click a resize handle to reset to 340 px
  - pointer-aware at 80–140% interface scale

### Changed

- Audio panel now has **My audio** and **Sound effects** modes
- Imported sound effects show their **Lots of Sounds** attribution in the library
- README, roadmap and feature tables updated for 1.13.0

### Verification

- 32/32 Playwright tests pass
- Added tests for panel resizing/persistence and attributed sound-effect results
- Live Lots of Sounds sample search verified against the public API
- Typecheck, production build, AppImage, DEB and RPM pass

## 1.12.0 — 2026-11-08

### Added

- **Pixabay stock media** integration
  - search photos and videos from the Media panel
  - preview results and add them straight to the timeline
  - import downloads media into the local LumaCut library instead of hotlinking
  - Pixabay API key management under Settings → Pixabay
- **Attribution everywhere**
  - Pixabay badge on every search result and imported asset
  - contributor link to the original Pixabay page
  - Pixabay Content License links in the browser and footer
- **Sound panel links** to Pixabay music and sound-effect libraries
- 24-hour server-side search cache and API-key-aware requests

### Notes

- Pixabay's public API currently documents photo and video endpoints only. Music and SFX are linked out to Pixabay and imported as local files.
- The API key is stored in local browser settings and is sent only to the local LumaCut server.
- Pixabay requires attribution whenever results are displayed; LumaCut keeps the badge, creator and license visible.

### Verification

- 30/30 Playwright tests pass
- Added tests for Pixabay key handling, URL validation, clean attributed results and Settings integration
- Typecheck, production build, AppImage, DEB and RPM pass

## 1.11.0 — 2026-11-08

### Added

- **Ctrl/⌘ + wheel** zooms the timeline in and out around the pointer
- **Caption animations**: Pop in, Bounce, Typewriter, Fade and Slide up
  - applied to every existing cue from Caption Studio
  - new captions inherit the selected caption animation
  - Inspector exposes the same Pop and Bounce options for text clips

### Fixed

- Importing a media asset now uses its **full duration** by default
  - previously clips were silently capped at 12 seconds and had to be dragged out
- The media clip helper and the timeline import path now share the same full-duration behavior

### Verification

- 28/28 Playwright tests pass
- New tests cover long-clip import, Ctrl+wheel zoom and caption animation application
- Typecheck, production build, AppImage, DEB and RPM pass

## 1.10.0 — 2026-11-08

### Added — agent vision and verification

- **Source and timeline frames**
  - `GET /api/assets/:id/frame?at=&w=`
  - `GET /api/agent/sessions/:id/frame?at=&w=`
  - MCP tools `get_frame`, `get_contact_sheet`
- **Contact sheets** in one call: `GET /api/agent/sessions/:id/sheet?from=&to=&step=&w=`
- **Asset analysis** precomputed on import and available via `GET /api/assets/:id/analysis`:
  - scene cuts, silences, loudness, black spans, static spans, screen-recording content box
- **Preview proxy renderer** for the top visible video layer:
  - `POST /api/agent/sessions/:id/proxy`
  - MCP tool `render_proxy`
- **`clip.crop`** command with source-pixel rectangles; applied in preview, export and rendered frames
- **Machine-readable command schemas** in `/api/agent/capabilities` (types, units, ranges, defaults, examples)
- **Lean asset listing** with `GET /api/assets?lean=1`

### Changed — agent feedback fixes

- Added visible **Agent connected / Agent working** pill and pulsing clip highlights while commands are applied
- Agent tools broadcast activity through the live session; the editor reflects it immediately
- `clip.trim` validates `trimIn + duration × speed` against asset duration
- `clip.add` defaults to the full asset duration instead of silently capping at 12s
- `clip.split` and `clip.add` accept stable client-supplied IDs
- Batch commands return **all** validation errors with indices
- `clip.split` accepts `timelineAt`, `clip.trim` accepts `sourceIn`
- Source range and crop bounds are validated

### Verification

- 25/25 Playwright tests pass
- Added coverage for crop, frames, contact sheets, analysis, proxy render and agent activity
- Typecheck, production build, AppImage, DEB and RPM pass

## 1.9.0 — 2026-11-08

### Added

- **Live Agent Bridge** in Settings → Agent bridge
  - starts a local live project session and keeps it in sync with the editor
  - generated local session token; agent API requires `x-lumacut-agent-token`
  - copy-ready MCP client config for Claude Code, Codex, DeepSeek Harness, OpenCode and other MCP clients
  - live status card, endpoint/token fields and secure-localhost notes
- **MCP stdio server** at `server/mcp.mjs` with tools:
  - `get_project`, `list_assets`, `get_thumbnail`, `get_capabilities`
  - `apply_commands`, `create_proposal`, `apply_proposal`, `reject_proposal`
- **Agent API auth + live sync**
  - `GET /api/agent/current` resolves the active session from the token
  - `POST /api/agent/sessions/:id/sync` keeps the open editor and session in revision-safe sync
  - remote commands increment a revision; the editor polls and applies new revisions as a normal undoable change
- `get_thumbnail` returns MCP image content so agents can inspect source media
- Expanded `docs/AGENT_ROADMAP.md` and a new README **Bring your own agent** section

### Verification

- 25/25 Playwright tests pass, including live sync into the open editor, MCP stdio discovery and the Agent Bridge settings flow
- Typecheck and production build pass
- AppImage, DEB and RPM builds pass
- MCP SDK and zod are bundled for the packaged helper

## 1.8.0 — 2026-11-08

### Added

- **Agent-ready command core** at `shared/project-commands.mjs`
  - validated, all-or-nothing commands: move, trim, split, delete/ripple, set, add media, track set
  - structured clip/track diffs and readable summaries
- **Experimental local agent API** with in-memory sessions:
  - read/apply/dry-run command batches
  - previewable proposals with apply/reject
  - capability discovery at `GET /api/agent/capabilities`
- **Agent roadmap** at `docs/AGENT_ROADMAP.md`, including the planned MCP tool surface

### Notes

- The API is localhost-only and not yet wired to the open editor session
- Authentication, live project sync and MCP packaging are deliberately deferred to the next milestone
- The headless core is the foundation for external harnesses such as Claude Code, Codex, DeepSeek Harness and OpenCode

### Verification

- 22/22 Playwright tests pass, including command sessions, dry runs, proposals, ripple delete and error handling
- Typecheck and production build pass
- AppImage, DEB and RPM build successfully

## 1.7.0 — 2026-11-08

### Added

- **Ripple delete** toggle in the timeline toolbar and Settings → Timeline
- When enabled, deleting clips closes the gap by moving later clips on the same track left
- Multi-clip deletions are handled with interval-aware shifts and remain undoable
- Ripple delete is on by default and can be switched off for gap-preserving deletes

### Verification

- 21/21 Playwright tests pass, including on/off ripple behavior
- Typecheck and production build pass
- AppImage, DEB and RPM build successfully

## 1.6.2 — 2026-11-08

### Changed

- Increased all UI text up to 12 px by **35%**, with a 9.5 px floor for the tiniest decorative labels
- Widened the asset panel and Inspector to 340 px and the icon rail to 82 px so the larger labels fit
- Kept the media format hint as two balanced lines instead of a clipped `PNG`
- Capped rail labels to 10.5 px so long names such as Templates do not clip or wrap

### Verification

- 20/20 Playwright tests pass, including minimum readable media/track label sizes and the 120% scale alignment test
- Checked at 1200 px and 1679 px with no page overflow

## 1.6.1 — 2026-11-08

### Fixed

- Extracting audio from a video clip now **mutes the source video clip**, including removing any volume keyframes that would otherwise override the mute, so the same audio is not heard twice
- Updated the Extract audio labels and toast to make the mute behavior explicit

## 1.6.0 — 2026-11-08

The visualizer and gain release.

### Added

- Dedicated **Audio visualizer** section in the Sound panel with Spectrum, Waveform and Radial styles
- **0–1000% gain** for clip volume, track level and preview master volume
- A master **DynamicsCompressor limiter** protects boosted output from clipping

### Changed

- Removed the visualizer overlay and toolbar toggle from the program monitor; the canvas now stays clean
- The visualizer is controlled by Settings → Playback and styled directly in the Sound panel
- Volume readout beside the preview master slider shows 0–1000%

## 1.5.0 — 2026-11-08

The timeline UX and editing release.

### Added

- **Ctrl/⌘ + drag marquee selection** on the timeline; **Ctrl/⌘ + A** selects every clip
- **Extract audio** from a video clip into the bottom audio track via the clip context menu
- Larger, higher-contrast UI typography across panels, inspector, timeline, menus, captions and settings
- Fixed UI-scale coordinate handling for context menus, playhead scrubbing, clip dragging, keyframe dragging and track detection
- Blank first-run project; bundled sample media and sample audio library removed

### Changed

- Space is captured as play/pause even when a toolbar button has focus, instead of activating the button
- Ctrl/⌘ + A no longer selects page text unless focus is in a text field
- Context menus clamp within the viewport at 80–140% UI scale
- The media library now contains only user-imported assets

## 1.4.1 — 2026-11-08

The readability polish release.

### Changed

- Brightened secondary text tokens in both dark and light themes for better contrast
- Rebuilt **Canvas format** cards with larger labels and ratio values, tooltips, a selected check mark and keyboard focus rings
- Kept the media import hint on one line (`MP4 · MOV · WebM · JPG/PNG`) so `PNG` no longer orphans
- Increased the smallest rail, caption, media metadata, inspector hint and auto-caption card text
- Added a regression test for canvas label size and media-hint wrapping

## 1.4.0 — 2026-11-08

The local auto-caption release.

### Added

- **Auto captions** in Caption Studio, powered by a bundled whisper.cpp 1.9.5 Vulkan runtime
- **AMD GPU transcribe** on Radeon through Vulkan, with automatic CPU retry and a manual CPU option
- **Whisper large-v3-turbo q5_0** (547 MiB, multilingual) and **small** (466 MiB) model choices
- **Silero VAD** and no-speech filtering to avoid hallucinated cues in silence or music
- **Full timeline mix** or **selected clip** as the audio source
- **Word-level token timings** mapped back across VAD-reduced audio, grouped into readable cues
- **Review before apply**: edit text, remove cues, append or replace existing captions
- **On-demand model download** from Hugging Face with SHA-256 verification, progress and safe cancel
- **Local-only privacy**: no speech API, account or telemetry; only the model download uses the network
- Model/runtime capabilities at `GET /api/captions/capabilities`
- Caption job API with progress, retry, cancellation and result endpoints
- [docs/AUTOCAPTIONS.md](docs/AUTOCAPTIONS.md) with setup, model, privacy and troubleshooting details

### Changed

- Caption Studio now opens with a local AI card above the manual and script tools
- Added a caption review dialog and low-confidence highlighting
- Added session resume for caption jobs when the panel is closed and reopened
- RPM now depends on `vulkan-loader`; DEB depends on `libvulkan1`
- Bundled the pinned whisper.cpp Vulkan runtime under `resources/whisper`

### Notes

- The model is not bundled in the packages; the first job downloads it once and verifies its checksum.
- Measured on an RX 9070 XT: 9 minutes of speech in about 6.5 s, ~925 MiB VRAM delta. The 8 GB target is comfortable.
- Speaker diarization is not included in 1.4.
- Whisper timings are token-derived; review is still required for difficult audio.

## 1.3.0 — 2026-11-08

The codec and 10-bit release.

### Added

- Explicit **Auto / H.264 / H.265 / AV1** codec picker with live availability from the local server
- **8-bit and 10-bit** output selection; H.265 and AV1 support 10-bit, H.264 is 8-bit only
- **HDR10** output for MP4 10-bit H.265/AV1, using a color-managed SDR → PQ/BT.2020 conversion
- 10-bit AV1 VAAPI hardware encoding, including p010 upload into the AMD encoder
- H.265/HEVC software support through `libx265`, with install guidance when the encoder is missing
- Codec availability, bit depth and HDR metadata in the export result and UI summary
- Codec catalogue exposed at `/api/capabilities` for the picker and install hints

### Changed

- Export dialog now groups codec, bit depth and HDR10 alongside the existing format/quality controls
- AMD acceleration controls follow the selected codec and bit depth
- HDR is intentionally restricted to MP4 + 10-bit + H.265/AV1
- H.264 remains the compatibility choice and is always 8-bit

### Notes

- HDR10 is converted from the 8-bit SDR canvas. It tags and color-manages the output as PQ/BT.2020 but cannot reconstruct HDR highlights that are not in the timeline.
- Fedora's stock `ffmpeg-free` may not include `libx265`; the H.265 card stays disabled until RPM Fusion FFmpeg (or a working HEVC VAAPI driver) is available.

## 1.2.0 — 2026-11-08

The AMD and Fedora release.

### Added

- AMD Radeon detection through sysfs and `lspci`, followed by real VAAPI encoder probes for H.264, HEVC, AV1 and VP9
- Hardware-accelerated MP4 (AV1/H.264/HEVC) and WebM (AV1/VP9) exports, with an automatic software retry if a hardware encode fails
- AMD GPU acceleration toggle in the Export dialog and Settings → Export, with detected encoder labels and actual codec reporting in the export result
- Fedora RPM package target, `/usr/bin/ffmpeg` dependency (works with `ffmpeg-free` or RPM Fusion `ffmpeg`), and RPM assets in the release workflow
- Settings → About GPU information, package badges and a hardware guide in `docs/HARDWARE.md`
- Dependabot updates for npm and GitHub Actions
- Protected `main` branch configuration with required CI, pull-request enforcement and blocked force-pushes

### Changed

- `npm run dist:linux` now builds AppImage, `.deb` and `.rpm`
- Release assets include `SHA256SUMS` covering all three Linux packages
- Export progress and summary labels report the selected AMD encoder or CPU fallback
- Repository metadata and README focus on AMD Radeon and Fedora

## 1.1.0 — 2026-11-08

The accessibility and animation release.

### Added

- Settings page with System / Dark / Light themes, four accent colors, 80–140% interface scale, compact density and reduced motion
- Real light-mode palette across the editor, timeline, dialogs, popovers and settings
- Keyframes 2.0: transform, opacity, filter intensity, manual color, text styling, audio volume and per-effect intensity
- Spring (soft/snappy) and bounce easing alongside linear, ease-in, ease-out and ease-in-out
- Expandable keyframe lanes on the timeline with add, drag-to-retime, selection, delete, double-click-to-add and easing controls
- Auto-key mode for property changes at the playhead
- Audio visualizer in the program monitor with spectrum, waveform and radial views
- Master 10-band graphic equalizer with presets and a per-track 3-band tone stack, gain and solo
- Track management: add, remove with confirmation, reorder by drag, rename, solo and gain
- Downloadable Linux AppImage and `.deb` build configuration plus a tagged release workflow
- Project schema migration from 1.0 (string effects → effect layers, new easing and track audio fields)

### Changed

- Top-bar settings entry point and quick dark/light toggle
- Track headers widened and reorganized for management controls
- Keyframe, effect and EQ inspectors are more compact and actionable
- README, screenshots, issue templates, CI and release documentation refreshed

### Known limits

- Export is still real-time capture followed by FFmpeg encode
- The audio visualizer is monitor-only and is not baked into exports
- Custom bezier easing and automatic speech-to-text remain future work

## 1.0.0 — 2026-11-07

Initial public release of LumaCut.

### Added

- Multi-track timeline with drag, trim, split, duplicate and snapping
- Canvas preview with transforms, filters, effects, transitions and keyframes
- Typography presets, stickers, shapes and shape layers
- Caption Studio with SRT import/export and script-to-captions
- Audio playback, fades, track mute and microphone voiceover recording
- H.264 MP4 and VP9 WebM export at 720p/1080p/4K and 24/30/60 fps
- Local autosave, undo/redo, `.lumacut` project files and export history
- Electron desktop shell and Linux installer script
- Playwright smoke tests and project documentation

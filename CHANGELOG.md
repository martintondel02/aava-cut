# Changelog

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
- Original demo film "Chase the Light" generated locally with FFmpeg
- Audio playback, fades, track mute and microphone voiceover recording
- H.264 MP4 and VP9 WebM export at 720p/1080p/4K and 24/30/60 fps
- Local autosave, undo/redo, `.lumacut` project files and export history
- Electron desktop shell and Linux installer script
- Playwright smoke tests and project documentation

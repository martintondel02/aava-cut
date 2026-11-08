<p align="center">
  <img src="docs/banner.png" alt="LumaCut — Cut. Color. Caption. Create." width="100%">
</p>

<h1 align="center">LumaCut</h1>

<p align="center">
  <strong>A local-first, CapCut-style video editor for Linux.</strong><br>
  Multi-track editing, spring-eased keyframes, captions, effects, a 10-band audio EQ, AMD Radeon hardware encoding and 10-bit HDR delivery — tuned for Fedora, packaged for Linux. **Now with a live, seeing MCP agent bridge.**
</p>

<p align="center">
  <a href="https://github.com/martintondel02/lumacut/releases/latest"><img src="https://img.shields.io/github/v/release/martintondel02/lumacut?style=flat-square&color=72f5d1&label=download" alt="Latest release"></a>
  <a href="#bring-your-own-agent"><img src="https://img.shields.io/badge/MCP-live%20agent%20bridge-72f5d1?style=flat-square" alt="MCP live agent bridge"></a>
  <a href="#stock-media-from-pixabay"><img src="https://img.shields.io/badge/Pixabay-stock%20media-f7d66b?style=flat-square" alt="Pixabay stock media"></a>
  <a href="https://github.com/martintondel02/lumacut/actions/workflows/ci.yml"><img src="https://github.com/martintondel02/lumacut/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-72f5d1?style=flat-square" alt="MIT"></a>
  <img src="https://img.shields.io/badge/platform-Linux-72f5d1?style=flat-square&logo=linux&logoColor=white" alt="Linux">
  <img src="https://img.shields.io/badge/AMD-Radeon%20VAAPI-ED1C24?style=flat-square" alt="AMD Radeon">
  <img src="https://img.shields.io/badge/codecs-H.264%20%C2%B7%20H.265%20%C2%B7%20AV1-62e6c1?style=flat-square" alt="Codecs">
  <img src="https://img.shields.io/badge/10--bit-HDR10-ffc76b?style=flat-square" alt="10-bit HDR10">
  <img src="https://img.shields.io/badge/Fedora-RPM-51A2DA?style=flat-square&logo=fedora&logoColor=white" alt="Fedora RPM">
  <img src="https://img.shields.io/badge/Electron-45-2B2E3A?style=flat-square&logo=electron&logoColor=9FEAF9" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/FFmpeg-powered-003B1F?style=flat-square&logo=ffmpeg&logoColor=white" alt="FFmpeg">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#bring-your-own-agent">Agent bridge</a> ·
  <a href="#stock-media-from-pixabay">Pixabay</a> ·
  <a href="#features">Features</a> ·
  <a href="#local-auto-captions">Auto captions</a> ·
  <a href="#amd-radeon-acceleration">AMD acceleration</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

## Install

**[Download the latest release →](https://github.com/martintondel02/lumacut/releases/latest)**

| Package | Best for |
| --- | --- |
| **`LumaCut-1.12.0-x86_64.rpm`** | Fedora 40+ x86_64 (tested on Fedora 45) |
| **`LumaCut-1.12.0-amd64.deb`** | Debian, Ubuntu, Linux Mint and derivatives |
| **`LumaCut-1.12.0-x86_64.AppImage`** | Arch, other Linux distributions, or a no-install test |

All packages include the editor, its local media server and the **whisper.cpp auto-caption runtime**. **Node.js is not required** for packaged builds. You do need **FFmpeg / ffprobe** on `PATH`; auto captions also need the system **Vulkan loader**. The RPM and DEB declare these dependencies, so installing through `dnf` / `apt` pulls them automatically.

> All builds are **x86_64 only**. The RPM is a Fedora package — do not install it on Arch or Debian.

### Fedora

Tested on Fedora 45. Download the RPM, then install it with `dnf` so dependencies are resolved:

```bash
cd ~/Downloads
sudo dnf install ./LumaCut-1.12.0-x86_64.rpm
```

If you do not already have FFmpeg and the Vulkan loader:

```bash
sudo dnf install ffmpeg-free vulkan-loader
```

Launch **LumaCut** from the GNOME/KDE overview or run:

```bash
/opt/LumaCut/lumacut
```

The RPM creates a desktop entry but does **not** add a `lumacut` command to your `PATH`.

If `dnf` rejects the unsigned local package, verify the checksum first and then install with `--nogpgcheck`:

```bash
sha256sum -c SHA256SUMS
sudo dnf install --nogpgcheck ./LumaCut-1.12.0-x86_64.rpm
```

For H.265 export with `libx265`, install RPM Fusion FFmpeg — see [H.265 installation](docs/HARDWARE.md#h265--hevc-installation).

### Debian / Ubuntu

```bash
cd ~/Downloads
sudo apt install ./LumaCut-1.12.0-amd64.deb
```

`apt` pulls `ffmpeg` and `libvulkan1`. Launch from the application menu or:

```bash
/opt/LumaCut/lumacut
```

### Arch Linux

Arch does **not** use RPM or DEB packages. Use the **AppImage** or run from source.

**AppImage (recommended for Arch):**

```bash
sudo pacman -S --needed fuse2 ffmpeg vulkan-icd-loader vulkan-radeon

chmod +x LumaCut-1.12.0-x86_64.AppImage
./LumaCut-1.12.0-x86_64.AppImage
```

`fuse2` is in Arch's `extra` repository. For Intel GPUs install `vulkan-intel` instead of `vulkan-radeon`. If FUSE is unavailable, run the AppImage in extraction mode:

```bash
./LumaCut-1.12.0-x86_64.AppImage --appimage-extract-and-run
```

**Build from source:**

```bash
sudo pacman -S --needed git nodejs npm ffmpeg vulkan-icd-loader vulkan-radeon

git clone https://github.com/martintondel02/lumacut.git
cd lumacut
npm ci
npm run desktop
```

`npm run desktop` builds the frontend and launches the Electron app. It does not create a system-wide desktop entry. See [Quick start](#quick-start) for the full development setup.

### Other Linux distributions

Use the AppImage. Install the AppImage FUSE runtime if your distribution does not ship it:

```bash
# Debian / Ubuntu
sudo apt install libfuse2

# Fedora
sudo dnf install fuse-libs

# Arch
sudo pacman -S fuse2
```

Then:

```bash
chmod +x LumaCut-1.12.0-x86_64.AppImage
./LumaCut-1.12.0-x86_64.AppImage
```

If the AppImage will not start, use:

```bash
./LumaCut-1.12.0-x86_64.AppImage --appimage-extract-and-run
```

### Verify the download

Release assets include a `SHA256SUMS` file:

```bash
sha256sum -c SHA256SUMS
```

### First launch

- Project data, media and exports live in `~/Videos/LumaCut`.
- Auto captions download the selected Whisper model on first use (547 MiB for large-v3-turbo). The model is checksum-verified.
- The RPM creates a menu entry. The AppImage and source builds do not integrate automatically.
- `main` is protected; releases are built from tagged commits by GitHub Actions.

---

## Why LumaCut?

Most editors make you choose between a polished timeline and owning your footage. LumaCut is built for the other path:

- **Local-first by design.** Your media, waveforms, projects and exports live in folders on your Linux machine. No account, no upload, no telemetry.
- **A real timeline.** Multi-track clips, trim handles, snapping, keyframe rails, direct manipulation and complete track management.
- **Finished-film tools.** Local AI auto captions, typography, transitions, effects, color grades, spring keyframes, audio mixing and 4K exports.
- **Yours to shape.** Light/dark themes, four accent colors, 80–140% interface scaling, compact density and reduced motion.
- **Tuned for AMD.** LumaCut probes the actual VAAPI encoders on your Radeon, uses AV1/H.264/HEVC hardware encoding when available, and falls back cleanly to CPU. The Fedora RPM is a first-class target.
- **Hackable.** React + TypeScript on the front end, a small Express/FFmpeg media server, and an Electron shell. Read it, run it, change it.

> LumaCut is an independent, original project inspired by modern mobile/desktop editors. It is not affiliated with CapCut or ByteDance.

---

## Bring your own agent

LumaCut 1.10 ships a **live, seeing MCP bridge**. Connect Claude Code, Codex, DeepSeek Harness, OpenCode or any MCP-capable client to the editor you already have open — the agent gets validated timeline tools, not shell access.

<p align="center">
  <img src="docs/screenshots/agent-bridge.png" alt="LumaCut Agent Bridge settings with live MCP status, token and copy-ready client config" width="100%">
</p>

### Connect in four steps

1. Open **Settings → Agent bridge**.
2. Enable the bridge. LumaCut generates a local session token and starts a live project session.
3. Copy the ready-made **MCP client config**.
4. Paste it into your harness config, then prompt normally.

```json
{
  "mcpServers": {
    "lumacut": {
      "command": "node",
      "args": ["/opt/LumaCut/resources/app/server/mcp.mjs"],
      "env": {
        "LUMACUT_AGENT_URL": "http://127.0.0.1:4320",
        "LUMACUT_AGENT_TOKEN": "lc_…"
      }
    }
  }
}
```

The bridge is localhost-only. The optional MCP helper requires **Node.js 20+**; the editor itself does not. Frames and proxies are server-side; the full composited export (text, transitions, effects, audio) remains the next renderer milestone.

### What the agent can do

- Read the live project, tracks, clips, keyframes, assets and thumbnails
- See timeline frames and one-call contact sheets; inspect source frames and precomputed scene/silence/black/static analysis
- Move, trim, split, ripple-delete, add media and change audio/visual properties
- Crop screen recordings to a source-pixel rectangle
- Render a low-res verification proxy of the top video layer
- Read rich JSON Schemas for every command, including units, ranges and examples
- Create previewable proposals with a rationale and structured diff
- Apply or reject a proposal while the human keeps editing
- Work against the same undoable project the UI uses
- Broadcast **Agent working** activity; the editor shows a live pill and pulses the clips it touches

Prompt examples:

> Tighten the opening: remove the second clip, ripple the rest left, and put the B-roll on the main track at 12 seconds.

> Make the middle section 20% faster by trimming the three longest clips, then show me the diff before applying.

> Move all soundtrack clips to start exactly with the main video and lower the music under the voiceover.

See the full [Agent roadmap](docs/AGENT_ROADMAP.md) for the tool surface, security model and the upcoming headless renderer.

---

## Stock media from Pixabay

Search and import free photos and videos from **Pixabay** without leaving the edit.

1. Get a free API key from [pixabay.com/api/docs](https://pixabay.com/api/docs/).
2. Open **Settings → Pixabay** and paste it.
3. Open **Media → Pixabay**, search, preview, and hit **Use**.

Imported media is downloaded into your local LumaCut library — no hotlinking. Every result and imported asset keeps its **Pixabay** badge, creator link and **Pixabay Content License** attribution. Searches are cached for 24 hours.

**Music & sound effects:** Pixabay's public API currently covers photos and videos. LumaCut's Sound panel links to Pixabay's music and SFX libraries; download the track there and import the file locally.

---

## Features

### Timeline & track management

| | |
| --- | --- |
| **Stock media** | Pixabay photo and video search, creator attribution, local downloads, 24h cache |
| **Multi-track timeline** | Video, overlay, titles, captions, soundtrack and SFX tracks |
| **Direct manipulation** | Drag clips in time or across compatible tracks, trim in/out, snap; double-click imports the full asset duration |
| **Clip operations** | Split, duplicate, copy/paste, Ctrl/⌘-drag marquee, Ctrl/⌘-click, Ctrl/⌘+A, ripple delete toggle, lock-safe editing |
| **Track management** | Add, remove with confirmation, drag-reorder, rename, recolor, hide, lock |
| **Audio tracks** | Mute, solo, per-track gain and a 3-band tone stack |
| **Navigation** | Ruler scrubbing, 12–220 px/s zoom, Ctrl/⌘+wheel zoom around the pointer, fit-to-view, resizable timeline |
| **Visual feedback** | Repeated thumbnails, waveform peaks, keyframe lanes, FX/filter/transition badges |

### Keyframes & motion

| | |
| --- | --- |
| **Keyframes 2.0** | Position, scale, rotation, opacity, color grading, filter intensity, text styling, effect strength and volume |
| **Easing** | Linear, ease in, ease out, ease in/out, **spring (soft)**, **spring (snappy)** and **bounce** |
| **Timeline keyframes** | Expand a selected clip into color-coded lanes, add with double-click, drag to retime, select and delete |
| **Inspector editor** | Add keys per channel, edit time/value/easing, remove, or use quick fade-in/out helpers |
| **Auto-key** | Optional mode that writes a keyframe when you change an animatable property at the playhead |
| **Speed** | 0.25×–4× with source-aware retiming, plus Ken Burns push-ins on stills |

### Audio & EQ

| | |
| --- | --- |
| **Visualizer** | Dedicated spectrum, waveform and radial analyser section in the Sound panel — no monitor overlay |
| **Gain** | Clip and track gain from 0–1000%; preview master volume also 0–1000%, with a limiter protecting the output |
| **Master EQ** | 10-band graphic equalizer with live curve and Flat / Podcast / Cinematic / Bass / Vocal / Airy presets |
| **Track tone** | Per-track low shelf, mid peak and high shelf, ±12 dB, plus track gain and solo |
| **Preview = export** | The track EQ, master EQ and gain bus feed both the monitor and the capture destination |
| **Voiceover** | Record a microphone take and drop it onto the timeline |
| **Fades** | Per-clip audio fades, volume keyframes and transition-aware mixing |
| **Extract audio** | Lift audio from a video clip onto the bottom audio track and mute the source clip, from the context menu or Inspector |

### Program monitor

| | |
| --- | --- |
| **Canvas compositor** | Up to 4K-shaped projects, 16:9 / 9:16 / 1:1 / 4:5 / 21:9 |
| **Layer transforms** | Move, scale, rotate, flip, opacity and blend modes in the preview |
| **Monitoring** | Safe margins, rule-of-thirds grid, snapshot, fullscreen |

### Type, captions & design

| | |
| --- | --- |
| **Typography** | Six presets + bundled Montserrat, Open Sans and Luma Serif |
| **Text controls** | Font, size, weight, colour, stroke, shadow, box, alignment, spacing |
| **Animations** | Fade, slide, zoom, spin and typewriter entrances/exits |
| **Caption animations** | Pop in, bounce, typewriter, fade and slide-up; apply to all cues or new cues |
| **Auto captions** | Local whisper.cpp transcription with VAD, word timings, language detection and review-before-apply |
| **Captions** | Single cues, script-to-timed-captions, SRT import/export, caption styling |
| **Stickers & shapes** | Emoji layers and vector shapes with transforms and keyframes |
| **Color** | Ten cinematic grades, intensity, manual brightness/contrast/saturation/temperature/hue |
| **Effects** | Film grain, light leak, sparkles, snow, bokeh, VHS, glitch and confetti |
| **Transitions** | Dissolve, fade to black/white, slides, zoom, blur, whip pan and spiral |

### Settings & accessibility

| | |
| --- | --- |
| **Theme** | System / Dark / Light, applied before first paint, plus a quick top-bar toggle |
| **Accent** | Mint, blue, amber and rose, with coordinated light-theme tokens |
| **Interface scale** | 80–140% with corrected pointer/menu coordinates and a larger, higher-contrast type scale |
| **Typography** | 35% larger UI text across the editor, with wider panels and intentional two-line format hints |
| **Agent bridge** | Live MCP sessions, token auth, validated commands, proposals, frames, analysis and proxy renders |
| **Density** | Comfortable and compact spacing for smaller displays |
| **Motion** | Reduced-motion preference and `prefers-reduced-motion` support |
| **Playback** | Preview quality, loop, follow playhead, waveform visibility and auto-expand keyframes |
| **Export defaults** | Resolution, frame rate, format and quality |

### Projects & delivery

| | |
| --- | --- |
| **Autosave** | Instant local project persistence with undo/redo history |
| **Portable projects** | Download and reopen `.lumacut` files |
| **Auto captions** | Local Whisper large-v3-turbo on AMD Vulkan · CPU fallback · full mix or selected clip |
| **AMD acceleration** | Auto-detects AMD Radeon VAAPI · AV1, H.264 or HEVC · live encoder label · CPU fallback |
| **Codec picker** | Explicit Auto / H.264 / H.265 / AV1 with live availability and install guidance |
| **10-bit & HDR10** | 10-bit H.265/AV1 in MP4 or WebM; HDR10 PQ/BT.2020 for MP4 10-bit |
| **Export** | H.264 / H.265 / AV1 MP4 · VP9 / AV1 WebM · AAC/Opus · 720p / 1080p / 4K · 24/30/60 fps |
| **Export workflow** | Real-time canvas capture + server-side FFmpeg hardware/software encoding and trimming |
| **History** | Recent exports with file paths, sizes and direct download |
| **Schema migration** | Opening a 1.0 project upgrades effects, keyframes, tracks and audio fields in place |

---

### Local auto captions

LumaCut 1.6 can transcribe the timeline locally with **whisper.cpp on AMD Vulkan** — no cloud speech API. Choose **Full timeline mix** or **Selected clip**, pick a language and accuracy level, then review the transcript before applying it.

- **Default model:** Whisper large-v3-turbo q5_0, 547 MiB, multilingual, comfortable on an 8 GB GPU.
- **Smaller model:** Whisper small, 466 MiB, for lower-end GPUs and CPUs.
- **Speech detection:** Silero VAD avoids inventing captions from music or silence.
- **Review first:** edit cues, inspect confidence, then replace or append to the caption track as one undoable edit.
- **Private by default:** audio stays local. The only network request is the one-time, checksum-verified model download.
- **Benchmark:** 9 minutes of speech transcribed in ~6.5 s on an RX 9070 XT, with a ~925 MiB VRAM delta.

See **[docs/AUTOCAPTIONS.md](docs/AUTOCAPTIONS.md)** for requirements, model management, performance and troubleshooting.

---

## Agent roadmap

The agent bridge is the first half of the agent story. The next milestone is a **headless renderer**: deterministic preview frames and final renders without real-time browser capture. That unlocks visual iteration and contact sheets for agents.

- **Shipped:** validated command core, live session sync, local token, MCP stdio server, proposals, asset analysis, frame/contact-sheet access, crop, command JSON schemas and a proxy renderer
- **Next:** full composited server-side export (transforms, text, transitions, effects, audio), session revision restore and transcript tools
- **Then:** in-app prompt panel with the same tools, diff review and permission scopes

Read the full architecture and protocol in **[docs/AGENT_ROADMAP.md](docs/AGENT_ROADMAP.md)**. The next milestone — composited export, offline audio, durable sessions, brief and markers — is specified in **[docs/RENDER_AND_SESSION_ROADMAP.md](docs/RENDER_AND_SESSION_ROADMAP.md)**.

---

## AMD Radeon acceleration

LumaCut 1.12.0 is built with AMD Radeon systems in mind. The media server does not simply trust `ffmpeg -encoders`; it finds AMD GPUs through sysfs and `lspci`, then probes every available VAAPI encoder with a tiny real encode on each render node.

- **MP4:** H.264 → HEVC → AV1, whichever the driver actually exposes.
- **WebM:** AV1 → VP9 hardware, with software VP9 as the fallback.
- **Safe fallback:** if a hardware encode fails mid-export, auto mode retries the exact same file with the CPU encoder.
- **Visible state:** the Export dialog and Settings → About show the detected GPU, the selected encoder, and whether a hardware encode succeeded.

On some Fedora + Mesa combinations — including RDNA4 cards — **AV1 VAAPI** is exposed while H.264/HEVC VAAPI is not. That is handled automatically: LumaCut exports AV1 with real GPU acceleration. If you need maximum player compatibility, pick **H.264** in the codec picker and turn **AMD GPU acceleration** off, or install RPM Fusion FFmpeg for software H.265.

### H.265 / HEVC installation

Fedora's `ffmpeg-free` often lacks `libx265`, so the H.265 codec card is disabled until you install an FFmpeg build that has it:

```bash
sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm

# If Fedora's ffmpeg-free is installed:
sudo dnf swap ffmpeg-free ffmpeg --allowerasing
# Otherwise:
sudo dnf install ffmpeg

ffmpeg -hide_banner -encoders | grep libx265
```

Restart LumaCut after installing; the server probes codecs at startup. Ubuntu's FFmpeg normally includes `libx265` already.

### 10-bit and HDR10

- **10-bit** is available for H.265 and AV1; H.264 stays 8-bit.
- **HDR10** is available for MP4 + 10-bit + H.265/AV1.
- LumaCut color-manages the SDR canvas to **PQ / BT.2020** at a 100-nit reference. It tags HDR10 correctly, but it **does not recover HDR highlights from an SDR timeline**; native HDR source grading is future work.
- Hardware 10-bit uses `p010` VAAPI upload. Software 10-bit uses `yuv420p10le`.

**Fedora install:**

```bash
sudo dnf install ffmpeg-free libva-utils
sudo dnf install ./LumaCut-1.12.0-x86_64.rpm
```

The RPM requires `/usr/bin/ffmpeg`, which `ffmpeg-free` satisfies.

<p align="center">
  <img src="docs/screenshots/hardware.png" alt="LumaCut about screen showing AMD VAAPI AV1 acceleration on Fedora" width="82%">
</p>

Full setup, encoder matrix, troubleshooting and local RPM build instructions live in **[docs/HARDWARE.md](docs/HARDWARE.md)**.

---

## Quick start

### Run LumaCut from source

Requirements:

- Linux with Wayland or X11
- **Node.js 20+**
- **FFmpeg** and **ffprobe** on `PATH` (tested with FFmpeg 9)

```bash
git clone https://github.com/martintondel02/lumacut.git
cd lumacut
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The first launch starts with a blank project; import media to begin.

### Production web build

```bash
npm run build
npm run start
```

Open **http://127.0.0.1:4317**.

### Native desktop window

```bash
npm run desktop        # build + open the Electron window
npm run desktop:start  # launch an existing build
```

The desktop app runs the media server inside Electron, so it does not need a separate Node process. Source runs keep media in the repository. Packaged runs store media, exports and cached metadata under `~/Videos/LumaCut/` (or Electron's user-data directory as a fallback).

### Build Linux packages

```bash
npm run dist:linux   # AppImage + .deb + .rpm, written to release/
npm run dist:dir     # unpacked app for inspection
```

Packaging is configured with `electron-builder` in `package.json`. Pushing a `v*` tag runs the release workflow and attaches the generated AppImage, `.deb`, `.rpm` and `SHA256SUMS` to the GitHub release.

Local RPM builds need `rpmbuild` and the `libcrypt` compatibility library used by the bundled `fpm` runtime:

```bash
sudo dnf install rpm-build libxcrypt-compat
npm run build
npx electron-builder --linux rpm --publish never
```

---

## Keyboard shortcuts

<details>
<summary><strong>Playback, editing, project and canvas shortcuts</strong></summary>

<br>

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Step one frame |
| `Shift` + `←` / `→` | Jump one second |
| `Home` / `End` | Go to start / end |
| `B` | Split selected clip at playhead |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` | Redo |
| `Ctrl/⌘ + D` | Duplicate selected |
| `Ctrl/⌘ + C` / `V` | Copy / paste clip |
| `Delete` | Delete selected clip or selected keyframe |
| `Ctrl/⌘ + S` | Save project to disk |
| `Ctrl/⌘ + O` | Open a `.lumacut` file |
| `Ctrl/⌘ + N` | New project |
| `Ctrl/⌘ + E` | Open export |
| `Ctrl/⌘ + ,` | Open settings |
| `T` | Add text at playhead |
| `1` – `9` | Switch asset panel |
| `?` | Shortcut sheet |
| `Esc` | Deselect clip / clear keyframe / close |

</details>

<details>
<summary><strong>Keyframe and timeline gestures</strong></summary>

<br>

| Gesture | Action |
| --- | --- |
| Select a clip | Expands its animated channels into keyframe lanes |
| Double-click a keyframe lane | Add a keyframe at that time |
| Drag a diamond | Retime the keyframe with snapping |
| Click a diamond | Select it and show the easing pill |
| `Delete` | Remove the selected keyframe |
| Keyframe menu | Add any animatable channel at the playhead |
| Easing picker | Choose linear, ease, spring or bounce |
| Drag a track grip | Reorder tracks with a drop indicator |
| Double-click a track name | Rename the track |

</details>

Double-click a media item to add it at the playhead. Drop media anywhere to import. Drag the handles on a selected frame to transform it.

---

---

## Architecture

```text
src/
  components/          React editor UI, panels, timeline, transport, export dialog
    AudioVisualizer.tsx Canvas analyser overlay (spectrum / waveform / radial)
    MasterEq.tsx       10-band master equalizer UI
    SettingsPage.tsx   Themes, scale, playback, timeline, export and storage settings
  engine/
    canvasRenderer.ts  Canvas compositor: media, text, shapes, effects, transitions
    mediaPool.ts       Media elements, track/master EQ bus, analyser, playback and capture
  lib/
    keyframes.ts       Channel registry, easing curves, interpolation and effect helpers
    migrate.ts         1.0 → 1.1 project migration
  store/               Zustand + Immer state, history, settings and autosave
server/
  index.mjs            Express media server, FFprobe metadata, waveforms, AMD detection and FFmpeg export
electron/main.cjs      Desktop shell + embedded local server
scripts/               Linux installer and maintenance scripts
tests/                 Playwright smoke tests
```

The renderer uses normalized transforms, so reframing a project is non-destructive. Export captures the same canvas compositor used by the preview, then FFmpeg applies constant frame rate, exact duration and the requested codec/container. If AMD acceleration is available, the captured frames are uploaded to the Radeon and encoded by VAAPI; otherwise the same pipeline uses software H.264/VP9.

The audio bus is:

```text
media element → clip gain → track 3-band tone → track gain/solo
              → master 10-band EQ → master volume → analyser → monitor
                                                     └──────→ capture (export)
```

The visualizer taps the analyser and never modifies the signal. Master and track EQ are part of the render graph, so preview and export hear the same mix.

### Tech stack

- **React 19 + TypeScript + Vite**
- **Zustand + Immer** for editor state and undo history
- **Canvas 2D + Web Audio API** for compositing and audio
- **Express 5 + Multer + FFmpeg**
- **Electron 45 + electron-builder** for AppImage, `.deb` and `.rpm` packages
- **AMD VAAPI** probing and hardware encoding through FFmpeg
- **Playwright** for browser and Electron smoke tests

---

## Where your work lives

| Path | Contents |
| --- | --- |
| `media/` | Imported source files and generated thumbnails (source runs) |
| `exports/` | Finished MP4 / WebM renders (source runs) |
| `data/assets.json` | Media library index and waveform peaks (source runs) |
| `~/Videos/LumaCut/` | Media, exports and data for packaged desktop builds |
| Browser local storage | Instant project autosave |
| `*.lumacut` | Portable project downloads |

All processing happens on your machine. Media never leaves the local server, which binds to `127.0.0.1`.

---

## Development

```bash
npm run dev          # media server + Vite
npm run build        # typecheck + production bundle
npm run start        # production server
npm run desktop      # native desktop shell
npm run dist:linux   # AppImage + .deb + .rpm
npm run test:e2e     # Playwright smoke tests
```

For the tests, install the Playwright browser once:

```bash
npx playwright install chromium
```

The test suite covers the blank first-run project, canvas painting, split/undo, dynamic title tracks, the media API, settings and scaling, timeline keyframes, auto-key, EQ controls, track management, project migration, marquee selection, extract-audio, keyboard shortcuts, AMD capabilities, the codec/HDR picker, the 120% scale alignment and the auto-caption capability surface.

---

## Roadmap

**1.6 “Visualizer & Gain” is shipped.**

- [x] Moved the audio visualizer out of the program monitor into its own Sound panel section
- [x] Spectrum / waveform / radial styles selectable in the panel
- [x] Clip, track and preview master gain from 0–1000%
- [x] Master limiter protects boosted output from clipping

**1.5 “Timeline UX” is shipped.**

- [x] Ctrl/⌘-drag marquee selection, Ctrl/⌘-click and select-all
- [x] Extract audio from video to the bottom audio track
- [x] Fixed UI-scale coordinate bugs for the playhead, track hit-testing and context menus
- [x] Larger, higher-contrast text across the editor
- [x] Space and Ctrl/⌘+A keyboard conflict fixes
- [x] Blank first-run project with no bundled sample media

**1.4 “Local Auto Captions” is shipped.**

- [x] Local whisper.cpp transcription on AMD Vulkan with CPU fallback
- [x] Full-timeline or selected-clip audio source
- [x] Silero VAD, language detection and word-level token timings
- [x] Review, edit, append/replace and undoable caption application
- [x] On-demand checksum-verified model download and model manager UI
- [x] Bundled runtime, model/license documentation and offline path

**1.3 “Codecs & 10-bit” is shipped.**

- [x] Explicit Auto / H.264 / H.265 / AV1 codec picker
- [x] 8-bit and 10-bit output, including 10-bit AV1 hardware encoding
- [x] HDR10 PQ / BT.2020 output for MP4 H.265 and AV1
- [x] Live codec availability and H.265/libx265 installation guidance
- [x] Codec and HDR metadata surfaced in the export result

**1.2 “AMD & Fedora” is shipped.**

- [x] Probe real AMD Radeon VAAPI encoders and prefer hardware automatically
- [x] AV1 / H.264 / HEVC hardware encode with CPU fallback and encoder labels
- [x] AMD GPU acceleration toggle in Export and Settings
- [x] Fedora RPM package, plus AppImage and `.deb`
- [x] Protected `main`, Dependabot, security policy and SHA-256 release checksums
- [x] AMD/Fedora documentation and hardware tests

**1.1 “Accessibility & Animation” is shipped.**

- [x] Settings page with dark / light / system themes, accents and 80–140% scaling
- [x] Keyframes for effects, filters, text and audio
- [x] Spring and bounce easing
- [x] Draggable keyframe blocks on the timeline with add / delete / retime
- [x] Audio visualizer, master 10-band EQ and per-track tone
- [x] Add / remove / reorder / rename / recolor tracks, with solo and gain
- [x] AppImage packaging plus a tagged release workflow
- [x] Light-theme screenshots, schema migration and expanded documentation

Next up:

- Custom bezier easing editor and curve presets
- Keyframe marquee and multi-select retiming
- “Move clips to a new track” when deleting a populated track
- Lane visibility filters and per-channel collapse
- Native HDR source handling and a WebGL/float rendering pipeline
- Intel and NVIDIA acceleration paths

See **[docs/AUTOCAPTIONS.md](docs/AUTOCAPTIONS.md)** for auto-caption setup and model details, **[docs/HARDWARE.md](docs/HARDWARE.md)** for AMD/Fedora setup, **[docs/REWORK_PLAN.md](docs/REWORK_PLAN.md)** for the 1.1 scope and **[CHANGELOG.md](CHANGELOG.md)** for release notes.

---

## Notes & limits

- **Export is real-time.** A 30-second cut takes roughly 30 seconds to capture; hardware encoding shortens the encode step, not the capture step. Keep the window in the foreground.
- **Hardware encoders vary by driver.** Fedora/Mesa may expose AV1, H.264, HEVC or only some of them. LumaCut picks what actually works and labels the result. It never silently pretends a software encode is hardware.
- **Auto captions are local and review-first.** Whisper can mishear music, overlapping speech or names; edit cues before applying them. Speaker labels are not yet included.
- Uploads are capped at 2 GB per file and 30 files per import.
- H.264 export uses whichever encoder FFmpeg exposes: `libx264`, `libopenh264`, `h264_vaapi`, or an `mpeg4` fallback.
- The audio visualizer is a **separate Sound panel section** in 1.6. It is not drawn over the program monitor and is not baked into exports.
- **HDR10 is converted from the SDR canvas.** It sets PQ/BT.2020 and 10-bit output but cannot restore highlights that were never in the SDR timeline.
- **H.265 software encoding needs libx265.** Fedora's stock `ffmpeg-free` may not include it; install RPM Fusion FFmpeg or use AV1 hardware encoding.
- Packaged builds expect **FFmpeg / ffprobe** on `PATH`; the `.deb` declares `ffmpeg` and the RPM requires `/usr/bin/ffmpeg`, satisfied by Fedora's `ffmpeg-free` or RPM Fusion `ffmpeg`. H.265 requires `libx265` in that FFmpeg build.
- LumaCut targets a wide desktop window (1180 px minimum).
- The app is built for local desktop use; there is no cloud sync or collaboration layer.

---

## Contributing

Issues, pull requests and thoughtful design feedback are welcome.

- **`main` is protected.** Direct pushes and force-pushes are disabled, all changes land through pull requests, and the **Build & smoke tests** check must pass before merge.
- Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for the dev setup, project structure and testing expectations.
- Use the issue templates for bugs and feature requests.
- Keep changes local-first: no accounts, no telemetry, no mandatory network calls.

If LumaCut helps you make something, star the repo — it makes the next rework easier to justify.

---

## License

MIT © LumaCut contributors. See [LICENSE](LICENSE).

Bundled fonts: Montserrat and Open Sans under the SIL Open Font License; Liberation Serif under the SIL Open Font License. User-imported media stays local and is not redistributed with the project.

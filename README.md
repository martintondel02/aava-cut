<p align="center">
  <img src="docs/banner.png" alt="LumaCut — Cut. Color. Caption. Create." width="100%">
</p>

<h1 align="center">LumaCut</h1>

<p align="center">
  <strong>A local-first, CapCut-style video editor for Linux.</strong><br>
  Multi-track editing, motion keyframes, captions, effects and real MP4 delivery — all on your machine.
</p>

<p align="center">
  <a href="https://github.com/martintondel02/lumacut/actions/workflows/ci.yml"><img src="https://github.com/martintondel02/lumacut/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-72f5d1?style=flat-square" alt="MIT"></a>
  <img src="https://img.shields.io/badge/platform-Linux-72f5d1?style=flat-square&logo=linux&logoColor=white" alt="Linux">
  <img src="https://img.shields.io/badge/Electron-38-2B2E3A?style=flat-square&logo=electron&logoColor=9FEAF9" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/FFmpeg-powered-003B1F?style=flat-square&logo=ffmpeg&logoColor=white" alt="FFmpeg">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Why LumaCut?

Most editors make you choose between a polished timeline and owning your footage. LumaCut is built for the other path:

- **Local-first by design.** Your media, waveforms, projects and exports live in folders on your Linux machine. No account, no upload, no telemetry.
- **A real timeline.** Multi-track clips, trim handles, snapping, direct manipulation, track controls and keyboard editing.
- **Finished-film tools.** Captions, typography, transitions, effects, color grades, keyframes, audio mixing and 4K exports.
- **Hackable.** React + TypeScript on the front end, a small Express/FFmpeg media server, and an Electron shell. Read it, run it, change it.

> LumaCut is an independent, original project inspired by modern mobile/desktop editors. It is not affiliated with CapCut or ByteDance.

## Quick start

### Requirements

- Linux with Wayland or X11
- **Node.js 20+**
- **FFmpeg** and **ffprobe** on `PATH` (tested with FFmpeg 9)
- A Chromium/Firefox browser or the bundled Electron desktop shell

### Run the web app

```bash
git clone https://github.com/martintondel02/lumacut.git
cd lumacut
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The first launch loads the demo film **“Chase the Light”**, so every control is ready to try.

### Production build

```bash
npm run build
npm run start
```

Open **http://127.0.0.1:4317**.

### Linux desktop app

```bash
npm run desktop        # build + open native window
npm run desktop:start  # launch an existing build
```

Install a desktop menu entry and the `lumacut` command:

```bash
bash scripts/install-linux.sh
```

The installer writes `~/.local/share/applications/lumacut.desktop`, installs an icon and places a launcher in `~/.local/bin/lumacut`.

> **Downloadable builds:** packaged AppImage and `.deb` releases are the next planned milestone. Until then, run from source with the commands above. See the [rework plan](docs/REWORK_PLAN.md).

---

## Features

### Timeline & editing

| | |
| --- | --- |
| **Multi-track timeline** | Video, overlay, titles, captions, soundtrack and SFX tracks |
| **Direct manipulation** | Drag clips in time or across compatible tracks, trim in/out, snap |
| **Clip operations** | Split, duplicate, copy/paste, multi-select, delete, lock-safe editing |
| **Track controls** | Hide, mute, lock, remove and add tracks |
| **Navigation** | Ruler scrubbing, 12–220 px/s zoom, fit-to-view, resizable timeline |
| **Visual feedback** | Repeated thumbnails, waveform peaks, FX/filter/transition badges |

### Program monitor

| | |
| --- | --- |
| **Canvas compositor** | Up to 4K-shaped projects, 16:9 / 9:16 / 1:1 / 4:5 / 21:9 |
| **Layer transforms** | Move, scale, rotate, flip, opacity and blend modes in the preview |
| **Monitoring** | Safe margins, rule-of-thirds grid, snapshot, fullscreen |
| **Audio preview** | Web Audio mix with volume, fades and track mute |

### Type, captions & design

| | |
| --- | --- |
| **Typography** | Six presets + bundled Montserrat, Open Sans and Luma Serif |
| **Text controls** | Font, size, weight, colour, stroke, shadow, box, alignment, spacing |
| **Animations** | Fade, slide, zoom, spin and typewriter entrances/exits |
| **Captions** | Single cues, script-to-timed-captions, SRT import/export, caption styling |
| **Stickers & shapes** | Emoji layers and vector shapes with transforms and keyframes |
| **Color** | Ten cinematic grades, intensity, manual brightness/contrast/saturation/temperature/hue |
| **Effects** | Film grain, light leak, sparkles, snow, bokeh, VHS, glitch and confetti |
| **Transitions** | Dissolve, fade to black/white, slides, zoom, blur, whip pan and spiral |

### Motion & audio

| | |
| --- | --- |
| **Keyframes** | Position, scale, rotation, opacity, color, effects, volume and fades |
| **Easing** | Linear, ease in/out/in-out, spring presets and bounce |
| **Speed** | 0.25×–4× with source-aware retiming |
| **Ken Burns** | Slow push-ins on still photographs |
| **Voiceover** | Record a microphone take and drop it onto the timeline |
| **Audio mixing** | Per-clip volume, fade in/out, track mute |

### Projects & delivery

| | |
| --- | --- |
| **Autosave** | Instant local project persistence with undo/redo history |
| **Portable projects** | Download and reopen `.lumacut` files |
| **Export** | H.264/AAC MP4 or VP9/Opus WebM · 720p / 1080p / 4K · 24/30/60 fps |
| **Export workflow** | Real-time canvas capture + server-side FFmpeg encoding and trimming |
| **History** | Recent exports with file paths, sizes and direct download |

---

## Screenshots

<p align="center">
  <img src="docs/screenshot.png" alt="LumaCut editor with the Chase the Light demo film" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/text.png" alt="Text presets and typography tools" width="49%">
  <img src="docs/screenshots/captions.png" alt="Caption Studio with styling presets" width="49%">
</p>

<p align="center">
  <img src="docs/screenshots/export.png" alt="LumaCut export dialog with resolution, frame rate and quality options" width="100%">
</p>

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
| `Delete` | Delete selected |
| `Ctrl/⌘ + S` | Save project to disk |
| `Ctrl/⌘ + O` | Open a `.lumacut` file |
| `Ctrl/⌘ + N` | New project |
| `Ctrl/⌘ + E` | Open export |
| `T` | Add text at playhead |
| `1` – `9` | Switch asset panel |
| `?` | Shortcut sheet |
| `Esc` | Deselect / close |

</details>

Double-click a media item to add it at the playhead. Drop media anywhere to import. Drag the handles on a selected frame to transform it.

---

## The demo film

LumaCut ships with **“Chase the Light”**, an original 28-second demo cut built from locally generated media. Every asset is synthesized by `scripts/generate-demo.mjs` with SVG and FFmpeg — no third-party footage, no licensing surprises.

It includes four cinematic clips, two stills, an original ambient score, sound effects, transitions, grades, titles, a picture-in-picture overlay and a caption-ready timeline.

```bash
npm run setup:demo   # regenerate the demo library
```

---

## Architecture

```text
src/
  components/          React editor UI, panels, timeline, transport, export dialog
  engine/
    canvasRenderer.ts  Canvas compositor: media, text, shapes, effects, transitions
    mediaPool.ts       Media elements, Web Audio graph, playback and capture sync
  lib/                 Project model helpers, seed film, SRT parser, utilities
  store/editorStore.ts Zustand + Immer state, history, import/export actions
server/
  index.mjs            Express media server, FFprobe metadata, waveforms, FFmpeg export
electron/main.cjs      Desktop shell + child server lifecycle
scripts/               Demo generation and Linux installer
tests/                 Playwright smoke tests
```

The renderer uses normalized transforms, so reframing a project is non-destructive. Export captures the same canvas compositor used by the preview, then FFmpeg applies constant frame rate, exact duration and the requested codec/container.

### Tech stack

- **React 19 + TypeScript + Vite**
- **Zustand + Immer** for editor state and undo history
- **Canvas 2D + Web Audio API**
- **Express 5 + Multer + FFmpeg**
- **Electron 38** for the native Linux shell
- **Playwright** for smoke tests

---

## Where your work lives

| Path | Contents |
| --- | --- |
| `media/` | Imported source files and generated thumbnails |
| `exports/` | Finished MP4 / WebM renders |
| `data/assets.json` | Media library index and waveform peaks |
| `public/demo/` | Generated demo film, stills and audio |
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
npm run test:e2e     # Playwright smoke tests
```

For the tests, install the Playwright browser once:

```bash
npx playwright install chromium
```

---

## Roadmap

LumaCut 1.0 is a complete editor. The 1.1 rework focuses on accessibility, animation depth, audio tools and distributable builds:

- [ ] Settings page with dark / light / system themes and 80–140% UI scaling
- [ ] Keyframes for effects, filters, text and audio
- [ ] Spring / bounce easing curves
- [ ] Draggable keyframe blocks on the timeline
- [ ] Audio visualizer, master 10-band EQ and per-track tone
- [ ] Full add / remove / reorder / rename track management
- [ ] AppImage and `.deb` release artifacts
- [ ] Light-theme screenshots and expanded docs

See **[docs/REWORK_PLAN.md](docs/REWORK_PLAN.md)** for the detailed scope and acceptance criteria.

---

## Notes & limits

- **Export is real-time.** A 30-second cut takes roughly 30 seconds to capture, then a few seconds to encode. Keep the window in the foreground.
- **Captions are manual or SRT-driven.** Speech-to-text is intentionally not faked.
- Uploads are capped at 2 GB per file and 30 files per import.
- H.264 export uses whichever encoder FFmpeg exposes: `libx264`, `libopenh264`, `h264_vaapi`, or an `mpeg4` fallback.
- LumaCut targets a wide desktop window (1180 px minimum).
- The app is built for local desktop use; there is no cloud sync or collaboration layer.

---

## Contributing

Issues, pull requests and thoughtful design feedback are welcome.

- Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for the dev setup, project structure and testing expectations.
- Use the issue templates for bugs and feature requests.
- Keep changes local-first: no accounts, no telemetry, no mandatory network calls.

If LumaCut helps you make something, star the repo — it makes the next rework easier to justify.

---

## License

MIT © LumaCut contributors. See [LICENSE](LICENSE).

Bundled fonts: Montserrat and Open Sans under the SIL Open Font License; Liberation Serif under the SIL Open Font License. Demo media is generated locally and included under the same MIT terms as the project.

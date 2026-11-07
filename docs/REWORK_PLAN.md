# LumaCut 1.1 — Rework Plan

> **Status: approved and delivered in LumaCut 1.1.0.** The headline scope below is implemented and covered by the Playwright suite, including the 1.0 → 1.1 project migration. A short deferred list follows the delivery checkpoints at the end of this document. The 1.2 follow-up adds AMD VAAPI acceleration and Fedora RPM packaging — see [HARDWARE.md](HARDWARE.md).

## Goal

Turn LumaCut from an impressive demo-grade editor into a **downloadable, approachable, accessible desktop video editor** — with a proper settings surface, a real animation system, pro audio tools, and complete track management.

The headline outcomes:

1. **Settings page** with dark / light / system themes and UI scaling.
2. **Keyframes 2.0** for transforms, opacity, effects, filters, text and audio — with spring and easing curves.
3. **Timeline keyframe blocks** that can be selected, dragged, added and removed directly.
4. **Audio visualizer + master and per-track EQ**, wired through preview and export.
5. **Full track add/remove/reorder** for video, overlay, text and audio tracks.
6. **GitHub-ready packaging, docs and CI** so users can download and install LumaCut.

---

## 1. Settings & UI scale

### Surface

A full-screen **Settings** view opened from a gear in the rail, the top bar, or `Ctrl/⌘ + ,`. It uses the same left navigation pattern as the editor and is fully keyboard navigable.

```
┌──────────────────────────────────────────────────────────────┐
│  SETTINGS                                                    │
│  Appearance   Playback   Timeline   Export   Storage   About │
│                                                              │
│  Theme                                                       │
│  [ System ]  [ Dark ]  [ Light ]                             │
│                                                              │
│  Interface scale                      100%                   │
│  [────────●────────]   80% — 140%                            │
│  Compact density      [ toggle ]                             │
│  Reduce motion        [ toggle ]                             │
│                                                              │
│  Accent        ● mint   ● blue   ● amber   ● rose            │
└──────────────────────────────────────────────────────────────┘
```

### Decisions

- **Theme modes:** `system`, `dark`, `light`. System follows `prefers-color-scheme` live.
- **Dark theme:** refined version of the current look with slightly higher text contrast and clearer hierarchy.
- **Light theme:** a real editorial light palette (soft off-white panels, ink text, mint accents, subtle warm borders). No inverted dark-theme shortcuts.
- **UI scale:** continuous 80–140%, applied through a root-scale strategy with a CSS fallback. Persisted immediately.
- **Density:** comfortable / compact changes control heights, section padding, and timeline track heights.
- **Reduce motion:** disables non-essential UI animations and respects `prefers-reduced-motion`.
- **Accent:** mint, blue, amber, rose. Applies to selection, playhead-adjacent controls and active states.
- **Playback defaults:** preview quality, visualizer on/off, looping, monitor volume.
- **Timeline defaults:** default zoom, snapping, waveform visibility, keyframe lane visibility.
- **Export defaults:** resolution, frame rate, format, quality.
- **Storage:** clear autosave, clear cached thumbnails/waveforms, reset all settings. Confirmation required for destructive actions.
- **About:** version, FFmpeg status, build info, GitHub link.

### Implementation notes

- Introduce `src/styles/themes.css` with semantic CSS variables. Replace remaining hard-coded colours in components with theme tokens.
- Settings live in `src/store/settingsStore.ts`, persisted via `lumacut.settings.v1`.
- Apply theme and scale before first paint where possible to avoid flashes.
- Add a quick **theme toggle** in the top bar for discoverability.
- Verify layouts at 1280 px and 1536 px widths at all scale levels; update responsive breakpoints to stay useful at 125–140%.

---

## 2. Animation & keyframes 2.0

### Property registry

Every animatable property becomes a registered channel with:

- stable id, label, value getter/setter
- default value, min/max
- whether it affects visual or audio output
- color for its timeline lane

Initial animatable channels:

| Scope | Channels |
| --- | --- |
| Transform | Position X, Position Y, Scale, Rotation, Opacity |
| Color | Filter intensity, Brightness, Contrast, Saturation, Temperature, Hue |
| Effects | Effect intensity, plus per-effect strength channels where meaningful |
| Audio | Volume, Fade in, Fade out |
| Text | Font size, Letter spacing, Background opacity |

Effect entries become objects instead of strings:

```ts
interface EffectLayer {
  id: string;
  type: EffectId;
  enabled: boolean;
  intensity: number;       // 0–100
  keyframes: Keyframe[];   // intensity channel
}
```

The old `effects: string[]` shape is migrated on load. No user project is left behind.

### Easing

`Keyframe.easing` supports:

- **Linear**
- **Ease In** (cubic)
- **Ease Out** (cubic)
- **Ease In/Out**
- **Spring (soft)** — damped spring with gentle overshoot
- **Spring (snappy)** — faster, higher overshoot
- **Bounce** — clamped rebound for pop-in effects

The interpolation engine resolves these curves consistently in the canvas renderer and audio graph. A small easing preview graph is shown next to the picker.

### Keyframe blocks on the timeline

When a clip is selected, its row can expand into a **keyframe rail**:

```
▾ Aurora Drift                                    ◇ +   [fx] [grade]
   Opacity    ──◆──────────◆────────────◆────────
   Scale      ──◆──────────◆────────────◆────────
   Effect · Light Leak  ──◆──────────────◆────────
```

- Diamonds are **real timeline blocks** colored by channel.
- **Add:** diamond button on any property row, inspector button, clip context menu, or right-click in a lane.
- **Remove:** select + `Delete`, right-click → Remove, or inspector trash.
- **Retime:** drag horizontally with snapping, same snapping rules as clips.
- **Value edit:** double-click opens a small value popover; the inspector also edits time, value and easing.
- **Multi-select:** Shift-click supports moving/deleting multiple keyframes.
- **Lane controls:** eye toggle per channel, collapse all, clear channel.
- **Auto-key:** optional toggle. When on, moving a property at a nonzero local time inserts/updates a keyframe.
- **Fade helpers:** “Fade in / Fade out” buttons create paired opacity or volume keys with sensible handles.

### Inspector

- Channel list with current value, add/remove diamond, and a mini curve preview.
- Selected keyframe editor: time, value, easing, easing preview, delete.
- Global “Add keyframe at playhead” action for the active channel.
- Keyframe lanes can be filtered to only animated channels.

### Acceptance criteria

- Keyframed opacity, scale, position, rotation, filter/effect intensity and audio volume render identically in preview and export.
- Spring easing visibly overshoots and settles at the final value.
- Keyframes are draggable, snap, and deleteable from the timeline.
- Opening a 1.0 project migrates animations without losing clips or effects.

---

## 3. Audio visualizer & EQ

### Visualizer

- Real-time **AnalyserNode** tap after the master EQ bus.
- Overlay styles in the program monitor:
  - **Spectrum bars** (default)
  - **Waveform ribbon**
  - **Radial pulse**
- Toggle in preview chrome and Settings → Playback.
- Audio panel shows a larger analyser with peak readout and stereo width.
- Visualizer is **monitor-only by default**. Whether to bake it into exports is a plan decision below.

### EQ

Audio graph is upgraded from a single gain to a proper bus:

```
media element → clip gain → track tone (low/mid/high) → track gain → master 10-band EQ → master gain
                                                                   → analyser → monitor
                                                                   → capture destination (export)
```

- **Master 10-band graphic EQ** in the Audio panel, with live curve, ±12 dB and presets:
  - Flat, Podcast, Cinematic, Bass Boost, Vocal Focus, Airy.
- **Per-track 3-band tone** (low shelf 120 Hz, peaking 1.2 kHz, high shelf 9 kHz), ±12 dB, plus track gain and solo.
- Master EQ affects preview and export identically; visualizer does not alter audio.
- Persist master EQ in the project so it travels with the edit.
- Add a test that exports a short clip with EQ enabled and verifies non-silent audio.

### Acceptance criteria

- No audio glitches when seeking, scrubbing, switching tracks, or exporting.
- Master EQ and track EQ render in preview and in the exported file.
- Visualizer does not raise capture cost enough to break 1080p real-time export on a modern machine.

---

## 4. Track management

- **Add** video, overlay, text or audio track from:
  - the timeline sidebar `+`,
  - the toolbar track menu,
  - a track context menu.
- **Remove** tracks from the header `…` menu with confirmation when non-empty.
- **Reorder** tracks by dragging their headers; incompatible clip moves are prevented.
- **Rename** by double-click; press Enter to commit, Escape to revert.
- **Track colors** chosen from a small palette.
- **Solo** for audio tracks, in addition to mute.
- **Per-track gain** in the header or inspector.
- **Safe removal:** if clips are present, offer “Move clips to a new track” or “Delete clips”.
- Main video track always exists; the last audio/text/overlay track can be removed only after confirming a replacement when necessary.
- Track headers get a visible grab handle and drop indicator when reordering.
- Keyboard: `Alt + ↑/↓` moves the selected track.

---

## 5. Repository, CI and delivery

The current repo is being published as **`martintondel02/lumacut`** (public, MIT).

The rework adds:

- A polished README with banner, screenshot gallery, feature tables, quick start, keyboard shortcuts, architecture, privacy and roadmap.
- `CONTRIBUTING.md`, issue templates and a release checklist.
- GitHub Actions CI: install, typecheck, production build, Playwright smoke tests.
- **Downloadable Linux builds:** AppImage and `.deb` via `electron-builder`, attached to GitHub Releases.
- Version bumps to **1.1.0** and a changelog.
- A `docs/REWORK_PLAN.md` link from the README roadmap.
- Final screenshots in both dark and light themes.

Potential packaging approach:

- `electron-builder` with `appId`, icons, category and desktop file.
- GitHub Release workflow triggered by tags (`v*`).
- Artifacts: `LumaCut-1.1.0-linux-x86_64.AppImage`, `.deb`, source archive.
- Signing is out of scope for 1.1; checksums included.

---

## 6. Delivery order & checkpoints

| Phase | Deliverable | Checkpoint |
| --- | --- | --- |
| **A. Foundation** | theme tokens, settings store, Settings page, scaling | dark/light/system + scale work at 100/125/140% |
| **B. Animation engine** | property registry, effect objects, easing incl. spring, migration | one clip animates transform + effect + audio, preview and export match |
| **C. Timeline keyframes** | expandable keyframe rails, blocks, drag/add/remove, inspector | all keyframe interactions tested |
| **D. Audio** | analyser visualizer, master EQ, per-track tone, routing in export | EQ export test passes; analyser smooth |
| **E. Tracks** | add/remove/reorder/rename/solo/gain, safe deletion | no orphan clips, no layout breakage |
| **F. Polish & release** | README, screenshots, CI, AppImage/.deb, changelog | clean build, green CI, release artifacts |

Each phase ends with typecheck, build, updated Playwright coverage and a visual pass in dark and light modes. If a phase exposes a larger-than-expected complexity, I will pause and report before expanding scope.

---

## 7. Proposed decisions (defaults I will use unless you say otherwise)

1. **Repo:** public `martintondel02/lumacut`, MIT, current workspace as initial commit.
2. **UI scale:** 80–140% continuous slider; default 100%.
3. **Theme:** system + dark + light; accent choices are an extra.
4. **Visualizer:** monitor-only in 1.1. An “export visualizer” option can be a 1.2 feature.
5. **EQ:** master 10-band + per-track 3-band tone; presets included.
6. **Keyframes:** channels listed above; spring presets are fixed soft/snappy, with no custom physics editor in 1.1.
7. **Packaging:** AppImage and `.deb` in the 1.1 release; Flatpak/AUR deferred.

---

## 8. Out of scope for 1.1

- Automatic speech-to-text captions.
- Cloud sync/accounts/collaboration.
- AI background removal or object tracking.
- Mobile layouts below 1180 px.
- Windows/macOS packaging.
- Custom easing bezier editor with draggable handles (can come later).

---

## 9. Risks

- **Theme conversion:** the current UI has many hard-coded colours; a full semantic token pass is needed to avoid a half-light theme.
- **Scale:** very small windows at 140% will need responsive fallbacks rather than squeezing every panel.
- **Keyframe data migration:** must be backward-compatible and covered by fixtures.
- **Audio graph:** routing EQ/analyser through capture must not break the real-time export path.
- **Track reordering:** clip movement and z-order must remain deterministic and tested.

---

**Approval requested:** If this scope and the default decisions look right, approve and I’ll start with Phase A (Settings + themes + scale), then proceed through the keyframe, audio, track, and release phases.

---

## 7. Delivery notes

**Delivered in 1.1.0**

- Theme tokens and a real light palette; System / Dark / Light, four accents, 80–140% scale, compact density and reduced motion.
- Settings surface with Appearance, Playback, Timeline, Export, Storage and About sections; `Ctrl/⌘ + ,` and top-bar entry points.
- Effect-layer objects, the channel registry, spring/bounce easing, auto-key, and in-place migration from 1.0 string effects.
- Expandable timeline keyframe lanes with color-coded, draggable diamonds; add by double-click or menu; remove with `Delete` or the pill; per-keyframe easing.
- Web Audio bus with track 3-band tone, track gain/solo, master 10-band EQ, analyser and capture destination; presets and live visualizer.
- Track add, remove with confirmation, drag-reorder, rename, recolor, solo, mute and gain.
- Electron embedded server (no separate Node process for packaged builds), external data root under `~/Videos/LumaCut`, AppImage and `.deb` build config, and a tag-driven release workflow.
- Dark and light screenshots, refreshed README, CI and release documentation.

**Deferred to a later pass**

- Keyframe marquee/multi-select, a value-popover editor, per-lane eye toggles and collapse-all controls.
- “Move clips to a new track” when removing a populated track (1.1 offers confirmed deletion instead).
- `Alt + ↑/↓` track reordering (1.1 uses drag handles).
- Baking the visualizer into exports; it remains a monitor-only overlay in 1.1.
- Stereo width/peak readouts in the Audio panel beyond the master analyser.

These deferrals do not block the headline 1.1 request: themes and scaling, keyframed effects with spring easing, timeline keyframe blocks, a visualizer and EQ, track management, and downloadable Linux packages.

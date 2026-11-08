# Render & Session Roadmap

> **Status:** planning document for the work after Aava Cut 2.0.
>
> **Goal:** an agent can create a complete edit, verify it visually, render a real
> composited file, and recover the session after a restart — without the editor
> becoming a second implementation of the renderer.

---

## Where we are

Aava Cut 2.0 already gives the agent:

- a live, token-bound session;
- validated commands, diffs, dry runs and proposals;
- crop, trim, split, ripple delete, add, track and property tools;
- source frames, timeline frames for the top visual layer, contact sheets;
- asset analysis, command JSON Schemas and a low-res proxy render;
- visible **Agent connected / Agent working** activity in the editor.

The remaining gap is not “one more endpoint”. It is the **render contract** and the
durability model around it.

### Current limitations

| Area | Current state | Consequence |
| --- | --- | --- |
| Visual export | Client real-time `MediaRecorder` capture | Cannot be triggered by an agent, not deterministic |
| Proxy | FFmpeg renders the top visible video/image layer with crop | No text, stickers, overlays, transitions, effects, keyframes or audio |
| Audio | Live Web Audio graph captured during client export | No headless/offline mix for agent exports |
| Sessions | In-memory `Map`, 2-hour TTL | Restart loses project/revision/proposals |
| History | Editor undo stack only | Agent cannot restore a session revision |
| Intent | No project-level brief | Agent has to ask what the edit is for |
| Markers | No timeline markers | Human intent stays in chat instead of the project |
| Modes | No explicit autonomy model | Agents bypass proposals by calling `apply_commands` |

---

## Architectural decision

### Reuse the canvas renderer; do not rewrite it in FFmpeg

The editor’s visual language already lives in `CanvasRenderer`: text layout, crop,
cover fit, transforms, filters, effects, transitions and keyframes. Reimplementing
that in an FFmpeg filter graph would create two renderers that drift apart.

**Decision:** introduce a shared **RenderPlan** and render frames with the same
`CanvasRenderer` in a dedicated render host. FFmpeg remains responsible for encoding
and muxing, not for recreating editor semantics.

```text
                 ┌──────────────────────────────┐
  Agent / MCP ──►│  Local server                 │
                 │  render queue · sessions      │
                 └──────────────┬───────────────┘
                                │ SSE / WebSocket job
                                ▼
                 ┌──────────────────────────────┐
                 │  Editor render host           │
                 │  RenderPlan + CanvasRenderer  │
                 │  hidden canvas · frame seeks  │
                 └──────────────┬───────────────┘
                                │ frames + audio WAV
                                ▼
                 ┌──────────────────────────────┐
                 │  FFmpeg encode + mux          │
                 │  existing codec/VAAPI plan    │
                 └──────────────────────────────┘
```

The editor must be open when the bridge is active. That is already true for the live
session; the render host is just a hidden canvas inside that running app.

---

## Phase 0 — Render contract and parity harness

**Target:** 3–4 days · no user-visible change

### Deliverables

- `src/render/renderPlan.ts`
  - `buildRenderPlan(project, assets, options)` → `RenderPlan`
  - frame size/fps/duration, sorted visual layers, transitions, text blocks, audio plan
  - explicit units and a plan schema version
- `src/render/parity.ts`
  - render a frame through the existing `CanvasRenderer`
  - deterministic frame hashes and golden PNG fixtures
- Golden projects covering:
  - crop and cover fit
  - transform and scale keyframes
  - text, stroke, background and animation
  - transition overlap
  - filter, adjust and effect layers
  - overlay ordering and opacity
- A `/render/parity` development route that renders a plan frame and prints its hash

### Acceptance

- Same plan + same time + same assets = same frame hash across runs.
- Crop and text frames match the current preview within an agreed SSIM tolerance.
- No visual behavior changes in the editor.

### Why first

Every later phase consumes this contract. It also gives us a fast way to catch a
regression in text, crop or keyframes while the renderer is being moved.

---

## Phase 1 — Headless visual render host

**Target:** 1.5–2 weeks

### Deliverables

- A hidden render surface using the existing `CanvasRenderer` and `mediaPool`.
- A server-side **render job queue**:
  - `POST /api/render/jobs` (internal)
  - `GET /api/render/jobs/:id`
  - `DELETE /api/render/jobs/:id`
- An SSE/WebSocket job channel from server → editor render host.
- Deterministic frame stepping:
  - set the media pool to the exact frame time
  - wait for `seeked` / `requestVideoFrameCallback`
  - draw, capture, advance
  - timeout and retry policy for codec/cache stalls
- Frame output: JPEG/WebP initially; WebCodecs/H.264 can replace it later.
- Proxy endpoint upgraded to use the render host, not the FFmpeg top-layer shortcut.
- Progress, cancellation and failure codes (`media-missing`, `seek-timeout`,
  `render-error`, `cancelled`).

### Acceptance

- Agent `render_proxy` returns a video containing:
  - crop
  - transform/scale keyframes
  - text and stickers
  - transitions and effects
  - overlay layers
- Frame-by-frame comparison against golden frames passes.
- A 30-second 480p proxy completes in a predictable time and can be cancelled.
- The existing GUI export remains unchanged until parity is proven.

### Risks

| Risk | Mitigation |
| --- | --- |
| Video elements do not settle after seeking | Wait for `seeked` + `requestVideoFrameCallback`, with a timeout/retry |
| Browser memory grows over long exports | Reuse canvas, stream frames to disk, batch and release blobs |
| Fonts differ between preview and render host | Load the same bundled fonts; wait for `document.fonts.ready` |
| Editor closed mid-render | Mark job failed; persist job metadata; restart is explicit |
| Hidden canvas throttling | Render host runs in the app window with `requestAnimationFrame` disabled only for stepping; measure first |

---

## Phase 2 — Offline audio mix

**Target:** 5–7 days

### Deliverables

- Audio source cache: extract/decode each media asset to WAV/Opus once per asset.
- `buildAudioPlan(project, assets)`:
  - clip gain, fades, volume keyframes
  - playback rate / retiming
  - track gain, mute, solo, 3-band tone
  - master 10-band EQ and limiter
  - master volume only for preview? **No** — final export uses clip/track gain, not preview master volume
- Render the mix with `OfflineAudioContext` in the render host:
  - schedule buffers at exact sample positions
  - apply gain automation curves
  - apply biquad EQ and limiter
  - render a single WAV
- Mux the WAV with the visual frames in the final encode.

### Acceptance

- Audio duration equals video duration within one frame.
- A sine-wave test project has the expected RMS and peak after fades/EQ.
- Mute/solo and track gain match the preview.
- No real-time capture is required for an agent export.

### Why not FFmpeg audio filters

Volume keyframes, fades, EQ and solo semantics already exist in the Web Audio
graph. Extracting the plan and rendering it offline keeps one source of truth for
the mix.

---

## Phase 3 — Agent export API and MCP tool

**Target:** 3–5 days

### API

- `POST /api/agent/sessions/:id/export`
  ```json
  {
    "format": "mp4",
    "codec": "auto",
    "resolution": "1080p",
    "fps": 30,
    "range": { "from": 0, "to": 30 },
    "includeAudio": true
  }
  ```
- Returns `{ jobId }` immediately.
- `GET /api/agent/sessions/:id/export/:jobId` returns progress, phase and result.
- Result:
  ```json
  {
    "status": "done",
    "url": "/exports/agent-....mp4",
    "path": "...",
    "duration": 30.0,
    "fps": 30,
    "size": 12345678,
    "codec": "h264",
    "hardware": true
  }
  ```
- Reuse `resolveExportPlan` for codec/VAAPI/software fallback.
- Proxy and final export share the same render host but different targets.

### MCP tools

- `export_video`
- `get_export_status`
- `cancel_export`

### Acceptance

- An MCP client can export a project with text, crop, keyframes, a transition,
  an overlay and audio, then verify it with `get_frame` / `ffprobe`.
- Hardware and fallback paths both produce a playable file.
- The agent receives progress and a final URL, not a promise.

---

## Phase 4 — Session durability, restore and intent

**Target:** 4–6 days

### Session persistence

- Persist sessions under `data/agent/sessions/{id}.json`:
  - token **hash** (never plaintext)
  - project snapshot
  - revision
  - last N revisions
  - proposals
  - mode
  - activity
  - created/expires timestamps
- Atomic writes (`tmp` + rename).
- Rehydrate on server start; remove expired sessions.
- Keep tokens out of logs.

### Revision restore

- Ring buffer of revisions (default 50).
- `POST /api/agent/sessions/:id/restore` `{ revision }`
- MCP `restore_revision`.
- The editor receives a normal remote revision and applies it as an undoable project.

### Human/agent concurrency

- Session exposes `lastSeenRevision` and `lastAppliedRevision`.
- Agent writes are queued or rejected while the human is mid-edit.
- Sync 409 returns the current revision and a clear conflict reason.
- UI shows **Agent working** and **Agent changes applied** states.

### Project brief and markers (Project v3)

- `project.brief?: string`
- `project.markers: Array<{ id, time, label, color }>`
- Migration from v2, preserving all clips.
- UI:
  - project brief field in Inspector → Project
  - markers on the ruler, add marker shortcut and context menu
  - marker list with jump/delete
- Agent tools:
  - `set_project_brief`
  - `add_marker`, `update_marker`, `delete_marker`
- `get_project` returns both, so the agent can read intent in-band.

### Autonomy mode

- `session.mode: "supervised" | "autonomous"`.
- Default supervised: mutations go through proposals.
- Autonomous requires an explicit UI switch and token; all actions are written to an
  audit log.
- `apply_commands` is rejected in supervised mode unless the caller is applying an
  approved proposal.

### Acceptance

- Kill and restart the server: session, project, revision, proposals and token survive.
- Restore revision 3 and get the exact project snapshot.
- Human edits during an agent operation are not silently overwritten.
- Brief and markers survive save/load/export and are visible to MCP.
- Supervised mode cannot bypass proposals.

---

## Phase 5 — Hardening and polish

**Target:** 5–7 days

- Render performance:
  - 480p proxy target and 1080p final target
  - frame streaming, canvas reuse, no giant in-memory arrays
  - progress ETA and cancellation
- Disk lifecycle:
  - temp frame cleanup
  - session/export retention policy
  - stale job cleanup
- Observability:
  - structured render/session logs
  - agent-visible error codes
  - `lastError` and retry
- CI:
  - golden frame parity
  - audio RMS/peak checks
  - restart/restore test
  - MCP export smoke test
- Docs:
  - render protocol
  - session protocol
  - agent mode semantics
  - update README and roadmap

---

## Milestone table

| Milestone | Outcome | Estimate | Depends on |
| --- | --- | --- | --- |
| **R0** | RenderPlan + golden frame parity harness | 3–4 days | — |
| **R1** | Headless visual render host + proxy parity | 1.5–2 weeks | R0 |
| **R2** | Offline audio mix + mux | 5–7 days | R0, R1 |
| **R3** | Agent export API + MCP export tools | 3–5 days | R1, R2 |
| **R4** | Durable sessions, restore, brief, markers, modes | 4–6 days | R3 for full E2E |
| **R5** | Hardening, CI, docs | 5–7 days | R1–R4 |

**Total:** roughly **5–7 focused weeks**.

---

## Non-goals (until after this roadmap)

- Reimplementing the canvas renderer as an FFmpeg filter graph.
- Cloud rendering or uploading media.
- A full NLE-grade colour/finishing pipeline.
- Multi-user collaboration.
- Letting an MCP client run shell commands or arbitrary filesystem operations.

---

## Definition of done

An agent can:

1. connect to a live session and read the brief, markers and project;
2. inspect source analysis, timeline frames and a contact sheet;
3. edit with crop, text, keyframes, overlays, transitions and audio;
4. render a real composited proxy and final MP4;
5. verify the result with frames and `ffprobe`;
6. restart the server and restore the session or a previous revision;
7. do all of this without touching the human’s undo history or silently
   overwriting an in-progress edit.

The human can:

- see agent activity in the editor;
- leave intent as a brief and markers;
- choose supervised or autonomous mode;
- reject or restore agent work at any point.

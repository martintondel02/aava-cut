# LumaCut Auto Captions — Implementation Plan

> **Status: proposed — awaiting approval.**
>
> **Decision requested:** approve a local-first auto-caption pipeline built on **whisper.cpp with the Vulkan backend**, defaulting to **Whisper large-v3-turbo q5_0** on AMD Radeon GPUs, with CPU fallback, on-demand checked model downloads, and a mandatory transcript review before captions are applied.

## 1. Recommendation in one paragraph

Add an **Auto captions** flow to Caption Studio. The local media server renders the project's audio mix with FFmpeg, runs **whisper.cpp** locally with **Vulkan GPU acceleration** on AMD Radeon (or CPU fallback), uses **Silero VAD** and word-level timestamps, then returns editable caption cues. The default model is **Whisper large-v3-turbo q5_0** (547 MiB on disk), which fits comfortably within an **8 GB consumer GPU** budget and is multilingual. The model downloads once on demand with checksum verification; nothing leaves the machine. The user reviews confidence-highlighted transcript segments and applies them to a caption track as an undoable edit.

## 2. Why this approach

### Chosen: whisper.cpp + Vulkan

- **AMD-friendly:** whisper.cpp has a cross-vendor **Vulkan** backend. It also has ROCm/HIP support (`gfx1201` for RX 9070 XT), but Vulkan avoids a ROCm runtime/toolchain dependency on Fedora.
- **Local-first:** one native binary and a GGML model file; no Python, cloud API, account, or telemetry.
- **Reliable core:** the same Whisper large-v3-turbo weights as the reference implementation, with **VAD**, **beam search**, **word timestamps**, and confidence/suppression thresholds.
- **Fits the app:** the server already owns FFmpeg and local files; the UI already has Caption Studio and caption tracks.
- **Packagable:** MIT-licensed C++ binary; models and VAD are downloaded separately and are not committed to git.

### Considered and rejected for v1

| Option | Why not now |
| --- | --- |
| Cloud STT (OpenAI, Deepgram, AssemblyAI) | Violates local-first/privacy, costs money, requires API keys and network |
| Browser WebGPU Whisper (Transformers.js) | Large model memory, uneven WebGPU/Electron support on AMD Linux, long-audio chunking and word timestamps are harder to make dependable |
| faster-whisper / CTranslate2 on ROCm | Python runtime plus ROCm packaging is fragile on Fedora; CTranslate2's GPU path is primarily CUDA |
| NVIDIA Parakeet / NeMo | Excellent English ASR, but NVIDIA-centric and not multilingual; wrong target for this AMD-focused app |
| System-installed Whisper | Version drift and missing models make support impossible |

Sources: [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [model files](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md), [CLI flags](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/cli.cpp), [Silero VAD](https://github.com/snakers4/silero-vad).

## 3. Hardware and model plan

### Target hardware

| Tier | Detection | Default caption model |
| --- | --- | --- |
| 16 GB AMD Radeon (RX 9070 XT class) | Vulkan available | large-v3-turbo q5_0, high accuracy |
| 8 GB AMD Radeon | Vulkan available | large-v3-turbo q5_0 (default target) |
| 6 GB or less | Vulkan available | small or medium q5, chosen by free VRAM |
| No Vulkan / non-AMD / CPU only | Vulkan probe fails | small (or user-selected tiny/base/medium), CPU |

Model facts from whisper.cpp:

- `large-v3-turbo-q5_0`: **547 MiB disk**, multilingual, default.
- `large-v3-turbo`: 1.5 GiB disk.
- `medium`: 1.5 GiB disk, ~2.1 GB memory.
- `small`: 466 MiB disk, ~852 MB memory.
- `base`: 142 MiB; `tiny`: 75 MiB.

The default target is an **8 GB GPU**; 16 GB leaves headroom for 4K playback and the editor. The implementation starts with a Phase 0 benchmark on the RX 9070 XT and only then locks the default model. If the benchmark cannot sustain a usable speed, the fallback default becomes `small`/CPU, not a promise.

### Model management

- Models live under the user data root (`~/Videos/LumaCut/models` packaged, `data/models` from source), never in git or the app package.
- A curated `models.json` manifest lists URL, size, SHA-256, language coverage and license.
- Download on first use with progress, resume support and checksum verification. Cancel is safe.
- Manual import of a GGML model file for offline machines.
- Model manager in **Settings → Captions** with download/remove/status.
- The only network access in the feature is the explicit model/VAD download.

## 4. Audio path

Auto captions should hear the **whole cut**, not one clip. The server already has FFmpeg, so it will build a 16 kHz mono WAV mix from the project:

- Include audio/video clips that have audio.
- Respect track mute/solo, clip volume, audio fades, trim, speed and timeline offsets.
- Skip hidden/empty content; fail clearly if there is no usable audio.
- Add a gentle **80 Hz high-pass** before ASR; master EQ is not required for speech recognition.
- Cache the mix for the duration of the job and delete it afterward.

The UI offers **Full timeline mix** (default) and **Selected clip** for difficult projects.

## 5. Transcription pipeline

```
Project
  → FFmpeg 16 kHz mono mix
  → Silero VAD
  → whisper.cpp (Vulkan or CPU)
  → JSON with segment + token timestamps
  → cue builder (punctuation, length, gaps)
  → editable review
  → caption cues on the timeline
```

Whisper settings:

- `large-v3-turbo-q5_0`, language `auto` or user-selected.
- `--vad --vad-model silero-v6.2.0`.
- `--output-json-full`, token timestamps enabled.
- Beam search when accuracy is preferred; greedy/best-of for speed.
- Conservative `--no-speech-thold`, `--logprob-thold`, `--entropy-thold`, and non-speech token suppression to reduce hallucinations.
- Progress parsed from `--print-progress`.
- Job cancellation kills the child process and cleans temporary audio.

The cue builder:

- Groups words/tokens using punctuation, max ~42 characters per line, max ~6 seconds per cue.
- Keeps word timings for karaoke-style caption animations later.
- Preserves gaps; drops empty/no-speech segments.
- Returns confidence per cue for review.

## 6. User experience

### Caption Studio → Auto captions

- Language: **Auto-detect**, English, Norwegian, Spanish, etc.
- Quality: **Fast** (small), **Balanced** (medium), **Accurate** (large-v3-turbo q5_0).
- Source: **Full timeline** / **Selected clip**.
- Optional initial prompt (names, jargon).
- Button: **Generate captions**.

### Progress

Visible stages with percentage and cancel:

1. Preparing audio mix
2. Loading model (download only on first use)
3. Detecting speech
4. Transcribing
5. Building caption cues

### Review before applying

A review panel shows:

- Cue text, start/end time, confidence.
- Click a cue to seek; edit text/timing; merge/split.
- Low-confidence cues highlighted.
- “No speech detected” state instead of invented captions.
- **Apply captions** creates/updates cues on a caption track.
- Replace vs append choice; undoable.
- Existing caption styling is reused.

### Settings → Captions

- Model status/size/device (AMD Vulkan or CPU).
- Download/remove models, import a local GGML model.
- Default language and quality.
- Explain that first use downloads ~550 MB and requires network.

## 7. Implementation structure

### Server

- `server/captions.mjs`
  - audio-mix builder
  - job manager (id, status, progress, cancel)
  - whisper.cpp runner
  - JSON parser and hallucination filters
  - model manifest/downloader with SHA-256
- Routes:
  - `GET /api/captions/capabilities` — GPU/Vulkan, models, VAD, binary versions
  - `POST /api/captions` — start job
  - `GET /api/captions/:id` — status/progress/result
  - `DELETE /api/captions/:id` — cancel
  - `GET /api/captions/models` — installed/available models
  - `POST /api/captions/models/:id/download` — download with progress
- No new persistent service; the existing Express server owns jobs.

### Frontend

- `src/components/captions/AutoCaptionsPanel.tsx`
- `src/components/captions/TranscriptReview.tsx`
- `src/store/captionStore.ts` or caption job slice in the editor store
- Settings → Captions section
- Reuse the existing caption cue model and track logic.

### Packaging

- CI builds two pinned whisper.cpp binaries:
  - `whisper-cli-vulkan` (`GGML_VULKAN=1`)
  - `whisper-cli-cpu` (`GGML_VULKAN=0`)
- Include them in `resources/captions/` in AppImage, `.deb` and `.rpm`.
- RPM/DEB dependencies: Vulkan loader (runtime); CPU binary remains a fallback if Vulkan is unavailable.
- The model is **not** bundled; first-run download is explicit and checksum-verified.
- Pin the whisper.cpp commit and record its MIT license in the app notices.

## 8. Reliability plan

- **VAD first:** removes long silence/music spans that cause Whisper hallucinations.
- **Language control:** auto-detect by default, explicit language available.
- **Hallucination filters:** no-speech/logprob/entropy thresholds, repeated-text suppression, empty-cue rejection.
- **Review gate:** nothing is applied without user confirmation.
- **Confidence display:** low-confidence segments are visually marked.
- **Model fallback:** if GPU init fails, rerun on CPU with the user told which device was used.
- **No speech:** show a clear “No speech detected” message; never manufacture cues.
- **Speaker labels:** not in v1. Multilingual diarization is a later phase; tinydiarize is English-only and requires special models.

## 9. Testing and acceptance

### Phase 0 spike (before UI work)

On the local RX 9070 XT:

- Build/pin whisper.cpp with Vulkan and run a 30 s and 2 min speech fixture.
- Verify GPU initialization, word timestamps, VAD and JSON parsing.
- Measure wall-clock speed; confirm model memory fits under an 8 GB budget (target: default model under ~4 GB peak).
- Verify CPU fallback and the 8 GB tier behavior using a constrained/alternate card if available.
- Gate: if Vulkan is unusable, revise the plan before shipping UI.

### Tests

- Unit: cue grouping, timestamp math, no-speech filtering, manifest checksum, JSON parser.
- Integration: tiny model on a short public-domain WAV in CI (no GPU), model download mock, cancellation.
- E2E: open Caption Studio → generate → review → apply → undo; captions land on a track with correct timing.
- Hardware test on RX 9070 XT: large-v3-turbo, Vulkan, 30 s and 2 min clips.
- Accuracy check: manual review of 3 clips (clean speech, background music, accented speech); compare against a reference transcript; no invented captions in silent sections; timings within ~200 ms of words.

### Acceptance criteria

- Auto captions run fully locally.
- GPU use is automatic on AMD when Vulkan works, with visible device/model status.
- CPU fallback works.
- Large-v3-turbo q5_0 fits and runs on an 8 GB AMD GPU target.
- Captions are editable before applying and undoable after applying.
- No cloud call except the explicit model download.
- AppImage, `.deb` and `.rpm` include the binaries and still launch.

## 10. Phases

| Phase | Deliverable | Estimate |
| --- | --- | --- |
| 0. Spike | Vulkan build, benchmark, VRAM result, model decision | 0.5–1 day |
| 1. Backend | audio mix, model manager, job runner, JSON parser, filters | 2–3 days |
| 2. Frontend | auto-caption panel, progress, review/apply, settings | 1–2 days |
| 3. Packaging | CI binaries, RPM/DEB/AppImage resources, license notices | 1 day |
| 4. Test/docs | fixtures, e2e, hardware benchmark, docs | 1 day |

Total: roughly **5–8 focused development days** after approval. This is an estimate, not a commitment; the Phase 0 gate may change the model default.

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Vulkan driver variance on AMD/Fedora | Probe at runtime; CPU fallback; package both binaries |
| 8 GB VRAM not enough for long audio | Stream VAD chunks; default q5 turbo; fall back to small |
| Model download is large/slow | Resumable download, progress, checksum, manual import |
| Hallucinated captions on music/silence | VAD, no-speech/entropy filters, review before apply |
| Whisper word timings are approximate | Display confidence; allow timing edits; use token timestamps |
| Package size grows | Model not bundled; binaries only (~tens of MB) |
| Licensing | whisper.cpp MIT; record model/VAD licenses; no redistribution of models unless license permits |

## 12. Approval

**Recommended:** approve the plan and start with the **Phase 0 Vulkan benchmark** before any UI work. The default is large-v3-turbo q5_0, on-demand checksum-verified model download, server-side audio mix, and review-before-apply.

Alternative choices to settle at approval:

1. **Model delivery:** on-demand download (recommended) vs bundle a model (much larger packages, fully offline).
2. **Default quality:** accurate large-v3-turbo q5_0 (recommended) vs faster small/medium.
3. **Scope:** full timeline mix + selected clip (recommended) vs selected clip only for v1.
4. **Speaker labels:** defer (recommended) vs add a separate English-only tinydiarize mode.

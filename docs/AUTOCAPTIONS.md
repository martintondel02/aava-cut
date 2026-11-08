# Local auto captions

LumaCut 1.4 adds local speech-to-text powered by [whisper.cpp](https://github.com/ggml-org/whisper.cpp). Audio never leaves the machine.

## What it does

- Transcribes the **full timeline mix** or a **selected clip**.
- Supports **99 languages**, auto-detection and a manual language override.
- Uses **Silero VAD** to avoid hallucinated captions in silence and music.
- Produces **word-level timestamps** from Whisper tokens, grouped into readable cues.
- Shows a **review screen** before anything is added to the timeline.
- Applies captions to the existing caption track, with replace or append.

The default model is **Whisper large-v3-turbo q5_0**: multilingual, 547 MiB, and sized for an **8 GB consumer GPU**. A smaller `small` model is available for low-power machines. CPU fallback is built in.

## Requirements

| Component | Notes |
| --- | --- |
| FFmpeg / ffprobe | Already required by LumaCut. Used to build the 16 kHz speech mix. |
| Vulkan loader | Included on normal Fedora/Ubuntu desktops. Used for AMD GPU inference. |
| whisper.cpp runtime | Bundled in LumaCut 1.4 packages under `resources/whisper`. |
| Model | Downloaded on first use, or imported manually. |
| RAM / VRAM | The measured model delta is ~0.9 GB. 8 GB VRAM is comfortable; smaller cards can use the `small` model. |

The packaged runtime uses the official whisper.cpp 1.9.5 Vulkan build. It runs on AMD Radeon through RADV/Mesa; no ROCm installation is required.

## First run

1. Open **Captions**.
2. Choose a language, accuracy, audio source and device.
3. Click **Generate captions**.
4. The first run downloads the selected model from Hugging Face (547 MiB for large-v3-turbo, 466 MiB for small) and verifies its checksum.
5. Review the transcript, edit any cue, then choose **Apply**.

Models are stored in the LumaCut data directory:

- Packaged: `~/Videos/LumaCut/data/models`
- Source checkout: `data/models`

The download is the only network request in this feature. Audio is processed locally and temporary mixes are deleted after the job.

## Model options

| Model | Disk | Quality | Best for |
| --- | ---: | --- | --- |
| `large-v3-turbo-q5_0` | 547 MiB | Accurate | Default; multilingual; 8 GB GPU |
| `small` | 466 MiB | Fast | Lower-end GPUs and slower CPUs |

Both are multilingual. The server checks the downloaded file's SHA-256 against a built-in manifest before using it.

## GPU and CPU behaviour

- **AMD GPU (auto)** uses the Vulkan runtime. If GPU initialization fails, the job retries on CPU and reports that in the result.
- **CPU fallback** uses the same binary with `-ng` and 8 threads.
- The 1.4 benchmark on an RX 9070 XT transcribed 9 minutes of speech in about 6.5 seconds with a peak delta of ~925 MiB VRAM.
- CPU transcription on a Ryzen 7 9800X3D ran at roughly 6× realtime for short speech.

## Review and apply

The review dialog lists each cue with start/end time and model confidence. Low-confidence cues are highlighted. You can edit text or remove cues.

- **Replace existing captions** removes current caption clips and adds the new set as one undoable edit.
- **Append** keeps the existing cues.
- **Review later** keeps the result available in the Caption Studio card until you start another job or apply it.

## Privacy

- No cloud speech API, account or telemetry.
- Only the model download uses the network.
- Temporary audio mixes live inside the LumaCut data directory and are deleted when the job finishes.
- Caption text stays in the local project/autosave.

## Limitations

- Speaker labels/diarization are not part of 1.4. Whisper transcribes words, not identities.
- Word timestamps are derived from Whisper token timings; they are accurate enough for caption display but not for frame-exact audio sync.
- Very music-heavy or overlapping-speech material may need manual correction. The review screen exists for that.
- The runtime is x86_64 Linux. Other architectures need a matching whisper.cpp build.
- The bundled binary links the system Vulkan loader. Without Vulkan, CPU fallback still requires the loader to be present; packaged dependencies include it.

## Troubleshooting

**“The whisper.cpp runtime is not installed”** — run the packaged build, or place a matching runtime at `vendor/whisper/vulkan/whisper-cli` with its libraries in `vendor/whisper/vulkan/lib` when running from source.

**“No speech was detected”** — LumaCut deliberately refuses to invent captions for silence or music. Check that the selected source contains a voice track and is not muted.

**Model download fails** — check network access to `huggingface.co`; the partial file is removed and the job can be retried. A manually downloaded GGML model can be placed in the models folder.

**GPU job falls back to CPU** — check `vulkaninfo` / Mesa RADV. The job result and progress message report the device actually used.

## Credits

- Whisper models and whisper.cpp: OpenAI / ggml authors, MIT.
- Silero VAD: MIT.
- LumaCut integration: MIT.

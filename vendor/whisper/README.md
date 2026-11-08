# whisper.cpp runtime

This directory contains the prebuilt whisper.cpp CLI runtime used by LumaCut's local auto-caption feature.

- Upstream: https://github.com/ggml-org/whisper.cpp
- Version: 1.9.5 (runtime reports `1.9.5-dev`)
- License: MIT — see `LICENSE`
- Build: official `ghcr.io/ggml-org/whisper.cpp:main-vulkan` image, Vulkan backend + ggml CPU fallback
- GPU: AMD Radeon via Vulkan (RADV); CPU fallback via `-ng`
- The shared libraries in `vulkan/lib` are loaded with `LD_LIBRARY_PATH` by the media server.

The models are **not** bundled. They are downloaded on first use into the LumaCut data root and checksum-verified.

To run on a system without Vulkan, the server starts the same binary with `-ng`. CPU-only builds can be placed at `cpu/whisper-cli` and will be preferred for CPU jobs when present.

Do not commit model files. They live under `data/models` in source runs and under the user's LumaCut data directory in packaged builds.

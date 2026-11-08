# AMD Radeon acceleration, codecs & Fedora packaging

LumaCut 1.6 is tuned for AMD Radeon desktops and Fedora Linux. Auto captions use the same Vulkan device through a bundled whisper.cpp runtime; see [AUTOCAPTIONS.md](AUTOCAPTIONS.md). It does not just look for an encoder name in `ffmpeg -encoders` — it actually probes the GPU with a tiny encode before offering hardware acceleration.

## How detection works

1. The media server checks `/sys/class/drm/card*/device/vendor` for AMD (`0x1002`) and reads the adapter names from `lspci`.
2. It enumerates the available `/dev/dri/renderD*` nodes.
3. For every render node it tries the VAAPI encoders that exist in the local FFmpeg build:
   - H.264 (`h264_vaapi`)
   - HEVC (`hevc_vaapi`)
   - AV1 (`av1_vaapi`)
   - VP9 (`vp9_vaapi`)
4. Each probe encodes a short 640×360 test frame. Only encoders that actually open and encode are reported as available.
5. The server exposes the result plus a codec catalog at `/api/capabilities`; the Export dialog and Settings → About show the chosen encoder.

Hardware exports run through this path:

```text
canvas capture (WebM)
  → FFmpeg decode
  → format=nv12,hwupload
  → VAAPI encoder on the AMD render node
  → AAC (MP4) or Opus (WebM)
```

## Codec picker

The export dialog has an explicit **Auto / H.264 / H.265 / AV1** picker plus an **8-bit / 10-bit** selector and an **HDR10** toggle. Auto keeps the old “best available” behaviour; the explicit choices are for delivery requirements.

| Codec | Containers | Bit depth | Hardware path | Software path |
| --- | --- | --- | --- | --- |
| H.264 | MP4 | 8-bit only | `h264_vaapi` | `libx264` / `libopenh264` / `mpeg4` |
| H.265 / HEVC | MP4 | 8-bit or 10-bit | `hevc_vaapi` | `libx265` |
| AV1 | MP4 or WebM | 8-bit or 10-bit | `av1_vaapi` | `libsvtav1` / `libaom-av1` |
| VP9 | WebM | 8-bit | `vp9_vaapi` | `libvpx-vp9` |

The picker only enables a codec when the local server reports a working hardware or software encoder. H.264 is intentionally limited to 8-bit.

## H.265 / HEVC installation

Fedora's official `ffmpeg-free` build often does **not** include `libx265`. If the H.265 card is disabled, install an FFmpeg build that has it and restart LumaCut:

```bash
# 1. Enable RPM Fusion free (once)
sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm

# 2. Replace Fedora's limited build with RPM Fusion's FFmpeg
sudo dnf swap ffmpeg-free ffmpeg --allowerasing
# If ffmpeg-free was not installed: sudo dnf install ffmpeg

# 3. Verify
ffmpeg -hide_banner -encoders | grep libx265
```

On Ubuntu, the distribution FFmpeg normally includes `libx265`:

```bash
sudo apt install ffmpeg
```

Hardware HEVC is also supported when the driver exposes `hevc_vaapi`; LumaCut probes it with a real encode. Some AMD/Mesa combinations expose AV1 but not H.264/HEVC; in that case use AV1 for hardware or install libx265 for software H.265.

H.265 is covered by patent pools in some jurisdictions. Check that your use and distribution comply with the applicable licensing.

## 10-bit and HDR10

- **10-bit** is available for H.265 and AV1. H.264 remains 8-bit.
- **HDR10** is available for MP4, 10-bit, H.265 or AV1.
- HDR output uses a color-managed conversion from the 8-bit SDR canvas to **PQ / BT.2020** at a 100-nit reference. It tags the file correctly for HDR displays, but it **does not recover HDR highlights from an SDR timeline**. A future native HDR rendering pipeline would be needed for source-HDR grading.
- The server passes color metadata into the FFmpeg encode and reports the actual `bitDepth`, `hdr`, `codec` and encoder in the export response.
- Hardware 10-bit encoding uses `p010` upload into VAAPI. Software 10-bit uses `yuv420p10le`.

Hardware 10-bit was validated with AV1 VAAPI on Radeon; H.265 10-bit requires either `hevc_vaapi` or `libx265`.

## Preferred hardware order

| Container | Preference order | Notes |
| --- | --- | --- |
| Auto + MP4 | H.264 → HEVC → AV1 | H.264 is offered only when the driver exposes a working VAAPI H.264 encoder. |
| Auto + WebM | AV1 → VP9 | Falls back to software VP9 if no hardware WebM codec is available. |

On a system like Fedora 45 with an RDNA4 Radeon RX 9070 XT, Mesa may expose **AV1 VAAPI** while H.264/HEVC VAAPI is not available. In that case LumaCut automatically uses AMD AV1 for MP4 and WebM. That is real hardware acceleration; it is not a software fallback.

AV1 is efficient but older phones, browsers and TVs may not decode it. If you need maximum compatibility, turn **AMD GPU acceleration** off in the Export dialog (or Settings → Export) and LumaCut will use software H.264.

If a hardware attempt fails mid-export, auto mode retries the same file with the software encoder. The result includes `hardware: true/false` and the actual `encoder`/`codec`, which the UI uses to label the finished export.

## Prerequisites on Fedora

Fedora's official tree ships FFmpeg as **`ffmpeg-free`**; RPM Fusion ships it as **`ffmpeg`**. Both provide `/usr/bin/ffmpeg`, which is what the LumaCut RPM requires.

```bash
# Fedora official
sudo dnf install ffmpeg-free libva-utils

# or, with RPM Fusion enabled
sudo dnf install ffmpeg libva-utils
```

`libva-utils` is optional; it provides `vainfo`, useful for checking VAAPI profiles. Fedora's VAAPI userspace drivers live inside `mesa-dri-drivers`, which is usually installed on a desktop. If a render node is missing, make sure the Mesa desktop drivers are present:

```bash
sudo dnf install mesa-dri-drivers
```

## Install the RPM

```bash
sudo dnf install ./LumaCut-1.8.0-x86_64.rpm
```

The RPM installs:

- `/opt/LumaCut/lumacut`
- `/usr/share/applications/lumacut.desktop`
- `/usr/share/icons/hicolor/512x512/apps/lumacut.png`

The package requires `/usr/bin/ffmpeg`, so either `ffmpeg-free` or RPM Fusion's `ffmpeg` satisfies it. No Node.js runtime is required.

## Building RPMs locally

The release RPMs are built in CI on Ubuntu with `electron-builder` and `fpm`. To build locally on Fedora you need `rpmbuild` and the compatibility `libcrypt` library used by the bundled `fpm` Ruby runtime:

```bash
sudo dnf install rpm-build libxcrypt-compat
npm run build
npx electron-builder --linux rpm --publish never
```

The resulting package is written to `release/LumaCut-1.8.0-x86_64.rpm`.

## Disabling acceleration

- **Per export:** toggle **AMD GPU acceleration** in the Export dialog.
- **Default:** Settings → Export → AMD GPU acceleration.
- **Command line / server:** the export endpoint accepts `acceleration=off` alongside the normal form fields.

If no AMD GPU or no working VAAPI encoder is detected, LumaCut stays fully functional with software encoding.

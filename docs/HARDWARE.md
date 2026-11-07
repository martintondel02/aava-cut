# AMD Radeon acceleration & Fedora packaging

LumaCut 1.2 is tuned for AMD Radeon desktops and Fedora Linux. It does not just look for an encoder name in `ffmpeg -encoders` — it actually probes the GPU with a tiny encode before offering hardware acceleration.

## How detection works

1. The media server checks `/sys/class/drm/card*/device/vendor` for AMD (`0x1002`) and reads the adapter names from `lspci`.
2. It enumerates the available `/dev/dri/renderD*` nodes.
3. For every render node it tries the VAAPI encoders that exist in the local FFmpeg build:
   - H.264 (`h264_vaapi`)
   - HEVC (`hevc_vaapi`)
   - AV1 (`av1_vaapi`)
   - VP9 (`vp9_vaapi`)
4. Each probe encodes a short 640×360 test frame. Only encoders that actually open and encode are reported as available.
5. The server exposes the result at `/api/capabilities`; the Export dialog and Settings → About show the chosen encoder.

Hardware exports run through this path:

```text
canvas capture (WebM)
  → FFmpeg decode
  → format=nv12,hwupload
  → VAAPI encoder on the AMD render node
  → AAC (MP4) or Opus (WebM)
```

## Encoder choice

| Container | Preference order | Notes |
| --- | --- | --- |
| MP4 | H.264 → HEVC → AV1 | H.264 is offered only when the driver exposes a working VAAPI H.264 encoder. |
| WebM | AV1 → VP9 | Falls back to software VP9 if no hardware WebM codec is available. |

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
sudo dnf install ./LumaCut-1.2.0-x86_64.rpm
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

The resulting package is written to `release/LumaCut-1.2.0-x86_64.rpm`.

## Disabling acceleration

- **Per export:** toggle **AMD GPU acceleration** in the Export dialog.
- **Default:** Settings → Export → AMD GPU acceleration.
- **Command line / server:** the export endpoint accepts `acceleration=off` alongside the normal form fields.

If no AMD GPU or no working VAAPI encoder is detected, LumaCut stays fully functional with software encoding.

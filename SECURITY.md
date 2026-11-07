# Security policy

LumaCut runs a local media server on `127.0.0.1` and uses FFmpeg to inspect and encode local files. There is no cloud backend and no telemetry.

## Reporting

If you find a security issue, please use GitHub's **private vulnerability reporting** for this repository rather than opening a public issue. Include a minimal reproduction and affected version.

## Scope

Relevant issues include:

- Path traversal or arbitrary file read/write through the local API
- Command injection through uploaded filenames or project fields
- Cross-site scripting through text/media metadata
- Unexpected remote network access
- Privilege escalation through the Electron shell

Do not test against machines you do not own. LumaCut binds to loopback by default.

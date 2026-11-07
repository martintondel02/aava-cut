# Contributing to LumaCut

Thanks for caring about local-first video editing. This guide covers the development loop, the parts of the codebase worth knowing, and the expectations for a PR.

## Development setup

```bash
git clone https://github.com/martintondel02/lumacut.git
cd lumacut
npm install
npm run dev
```

The media server runs at `http://127.0.0.1:4317`; Vite runs at `http://127.0.0.1:5173`. FFmpeg and ffprobe must be on `PATH` for imports and exports.

Useful commands:

```bash
npm run build        # TypeScript check + production bundle
npm run test:e2e     # Playwright smoke tests
npm run desktop      # build and launch the Electron shell
bash scripts/install-linux.sh
```

Install the Playwright browser once:

```bash
npx playwright install chromium
```

## Where things live

| Area | Files |
| --- | --- |
| Editor UI | `src/components/` |
| Timeline & preview | `src/components/Timeline.tsx`, `src/components/PreviewPanel.tsx`, `src/components/TransformOverlay.tsx` |
| Compositor | `src/engine/canvasRenderer.ts` |
| Media & Web Audio | `src/engine/mediaPool.ts` |
| State & undo | `src/store/editorStore.ts` |
| Project helpers | `src/lib/` |
| Media server / export | `server/index.mjs` |
| Desktop shell | `electron/main.cjs` |
| End-to-end tests | `tests/` |

The renderer is deliberately framework-free: it receives a project and a time and paints a frame. Anything that affects the frame must also affect export, because export captures the same renderer in real time.

## Code style

- TypeScript strict mode. No `any` unless there is a comment explaining why.
- Keep editor state mutations inside `mutateProject` so undo/redo and autosave stay correct.
- Add new colours to the theme tokens rather than hard-coding them; the 1.1 rework adds a light theme.
- Prefer small, composable components over large files, but keep related timeline logic together.
- Do not add network calls that make the app depend on a remote service. LumaCut is local-first.
- Keep user media and generated files inside `media/`, `exports/` and `data/`; do not commit them.

## Testing

- Add or update a Playwright test for user-visible behaviour.
- Run `npm run test:e2e`, `npx tsc --noEmit` and `npm run build` before opening a PR.
- For export/audio changes, test a short real export and confirm non-silent audio with `ffprobe`/`volumedetect` when relevant.
- Test both the Electron shell and the browser when changing media, audio or export paths.

## Project migration policy

Projects are stored in browser local storage and as `.lumacut` files. Any data-model change must:

1. Bump the project schema version.
2. Include a deterministic migration for old projects.
3. Avoid dropping unknown clip fields where practical.
4. Keep the last two schema versions readable.

## Pull requests

- Branch from `main` with a descriptive name, e.g. `feat/keyframe-lanes`.
- Keep PRs focused; split theme, audio and keyframe work when possible.
- Describe user-visible changes and include screenshots or a short screen recording.
- Note anything not tested and why.

## Reporting bugs

Use the bug report issue template. Include:

- LumaCut version / commit
- Linux distribution and session (Wayland/X11)
- Browser or Electron version
- FFmpeg version
- Steps to reproduce and expected behaviour
- Console or server logs when relevant

## Security

Do not open a public issue for a vulnerability that could compromise local files or the local server. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the MIT license in [LICENSE](LICENSE).

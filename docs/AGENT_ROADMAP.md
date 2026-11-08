# Agent Roadmap

LumaCut's long-term differentiator is not a bundled chatbot. It is an **agent-operable
editor**: a local, structured video document that Claude Code, Codex, DeepSeek Harness,
OpenCode, or a future in-app prompt can inspect and edit through safe tools.

## The shape we are building

```text
  GUI (React) ─┐
               ├── Project JSON ── Command core ── Renderer
  Agent (MCP) ─┘        │                │
                       │                └── preview frames / final export
                       └── assets, transcript, scene thumbnails, waveforms
```

The GUI and the agent should be two clients of the same editing engine. An agent edit
is expressed as a **validated command batch**, not as direct mutation of the project file.

## Principles

1. **Command-first.** Every edit is a typed operation with validation and a diff.
2. **Proposal-first.** Agents should propose a transaction, preview it, and let the user
   apply or reject it as one undoable change.
3. **Local by default.** The editor server binds to `127.0.0.1`; no media leaves the machine
   unless the user configures a remote model.
4. **Agents need senses.** JSON alone is not enough. Expose contact sheets, transcript
   segments, waveforms, media metadata, and optionally rendered frames.
5. **MCP for interoperability.** Do not require harness-specific integrations. Expose the
   same tools through MCP and a local HTTP bridge.

## Milestones

### Milestone 1 — Agent-ready command core (shipped in 1.9)

- [x] Pure, headless project command module at `shared/project-commands.mjs`
- [x] All-or-nothing validation; locked-track and overlap checks
- [x] Commands: move, trim, split, delete/ripple, set, add media, track set
- [x] Structured project diffs (`clips.added`, `clips.removed`, `clips.changed`)
- [x] Local agent sessions with in-memory project state
- [x] Proposal endpoint plus apply/reject
- [x] Dry-run command batches
- [x] Sync the live editor project into an agent session
- [ ] Move the interactive store onto the same command module
- [ ] Frame-accurate/rational time units
- [x] Local session token and editor opt-in
- [ ] Approval policy for direct destructive commands

The command core uses the same JSON shape as the editor (`Project v2`). LumaCut 1.9
wires the open editor to the session with revision-safe sync, so an MCP agent can edit
the live timeline. The interactive store still has its own mutation code; moving it onto
the shared command module is a cleanup milestone.

### Milestone 2 — Headless renderer

- Server-side FFmpeg timeline renderer for deterministic previews and exports
- Low-resolution proxy renders for fast agent iteration
- Frame/contact-sheet extraction endpoint
- Scene-boundary and silence detection
- Keep the canvas monitor as an interactive preview, not the final renderer
- Replace the current real-time export capture path over time

### Milestone 3 — MCP bridge (stdio shipped in 1.9)

- [x] `lumacut-mcp` stdio server
- [x] Tools wrap the live session API
- [x] Asset thumbnail image content for visual inspection
- [x] Config snippets for Claude Code, Codex, DeepSeek Harness and OpenCode
- [x] Local token, project-scoped access, no arbitrary shell tools
- [ ] Optional Streamable HTTP endpoint
- [ ] Transcript, waveform and contact-sheet resources
- [ ] Progress notifications for long renders

Planned tools:

| Tool | Purpose |
| --- | --- |
| `get_project` | Read the current project, tracks and clips |
| `list_assets` / `get_asset` | Query the media library and metadata |
| `get_transcript` | Read timed words and caption cues |
| `get_contact_sheet` | Return thumbnails for visual inspection |
| `render_frame` / `render_preview` | See a frame or a clip preview |
| `apply_commands` | Apply a validated command batch |
| `create_proposal` | Prepare a previewable edit transaction |
| `apply_proposal` / `reject_proposal` | Accept or discard an edit |
| `export` | Start a final render |

### Milestone 4 — In-app agent UX

- Prompt panel with provider configuration (OpenAI-compatible or local model)
- Streaming tool-call log
- Timeline diff and before/after frame comparison
- Apply/revert, permission scopes, and agent activity history
- Built-in agent uses the same tools as external harnesses

## M1 API

The server binds only to localhost. These endpoints are available now:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/agent/capabilities` | Command list, API version and MCP helper path |
| `POST` | `/api/agent/sessions` | Create a token-bound session with a project snapshot |
| `GET` | `/api/agent/current` | Resolve the newest session for a token |
| `POST` | `/api/agent/sessions/:id/sync` | Revision-safe sync from the open editor |
| `GET` | `/api/agent/sessions/:id` | Read the current project and proposals |
| `POST` | `/api/agent/sessions/:id/commands` | Validate/apply a command batch; `dryRun: true` previews |
| `POST` | `/api/agent/sessions/:id/proposals` | Store a previewable proposal |
| `POST` | `/api/agent/sessions/:id/proposals/:pid/apply` | Apply a proposal |
| `POST` | `/api/agent/sessions/:id/proposals/:pid/reject` | Discard a proposal |
| `DELETE` | `/api/agent/sessions/:id` | Drop a session |

All session, command and proposal endpoints require the header
`x-lumacut-agent-token`. The token is generated in **Settings → Agent bridge** and is
shown only in the MCP config card.

Commands:

```json
[
  { "type": "clip.move", "clipId": "clip_123", "start": 4.5, "trackId": "track-main" },
  { "type": "clip.trim", "clipId": "clip_123", "start": 4.5, "duration": 3 },
  { "type": "clip.split", "clipId": "clip_123", "at": 6 },
  { "type": "clip.delete", "clipIds": ["clip_123"], "ripple": true },
  { "type": "clip.set", "clipId": "clip_123", "patch": { "volume": 0.8, "opacity": 1 } },
  { "type": "clip.add", "assetId": "asset_123", "start": 12, "trackId": "track-main" },
  { "type": "track.set", "trackId": "track-audio", "patch": { "gain": 1.2 } }
]
```

The command module is all-or-nothing. Invalid commands return `400` with an `errors`
array and the project is left untouched. Successful responses include a diff:

```json
{
  "ok": true,
  "project": { "...": "updated Project JSON" },
  "diff": {
    "clips": { "added": [], "removed": [], "changed": [{ "id": "clip_123", "fields": ["start"] }] },
    "tracks": { "changed": [] },
    "summary": "1 changed"
  }
}
```

### Example session

```bash
curl -s http://127.0.0.1:4317/api/agent/sessions \
  -H 'content-type: application/json' \
  -d "{\"project\": $(cat project.json)}"

curl -s http://127.0.0.1:4317/api/agent/sessions/agent_abc/commands \
  -H 'content-type: application/json' \
  -d '{"commands":[{"type":"clip.delete","clipIds":["clip_123"],"ripple":true}]}'
```

## Security boundary

- The server binds to localhost only. Do not expose it to a LAN.
- Sessions are bound to a generated token; the editor must explicitly enable Agent Bridge.
- Agents get **editor commands**, not shell access or arbitrary filesystem paths.
- Destructive operations can be proposed first; the human applies or rejects them.
- Session state is in-memory and expires after two hours.
- A token is revoked by disabling the bridge or restarting the app.

## MCP setup

1. Open **Settings → Agent bridge** and enable it.
2. Copy the generated MCP config.
3. Paste it into the MCP client configuration.
4. Prompt the agent normally.

```json
{
  "mcpServers": {
    "lumacut": {
      "command": "node",
      "args": ["/opt/LumaCut/resources/app/server/mcp.mjs"],
      "env": {
        "LUMACUT_AGENT_URL": "http://127.0.0.1:4320",
        "LUMACUT_AGENT_TOKEN": "lc_…"
      }
    }
  }
}
```

The helper requires Node.js 20+. The editor itself does not.

## What comes next

Do M2 before the in-app agent panel. Agent iteration is only useful when previews and
exports are fast and deterministic. The current real-time canvas capture is acceptable for
the GUI, but it is the wrong foundation for an agent that may render dozens of previews.

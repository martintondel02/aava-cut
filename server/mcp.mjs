#!/usr/bin/env node
/**
 * LumaCut MCP stdio bridge.
 *
 * Configure an MCP client with:
 *   command: node
 *   args: [this file]
 *   env: LUMACUT_AGENT_URL, LUMACUT_AGENT_TOKEN
 *
 * The app owns the live project; this process only talks to its localhost API.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const baseUrl = (process.env.LUMACUT_AGENT_URL || 'http://127.0.0.1:4317').replace(/\/+$/, '');
const token = process.env.LUMACUT_AGENT_TOKEN || '';

if (!token) {
  console.error('[lumacut-mcp] LUMACUT_AGENT_TOKEN is required. Enable Agent Bridge in LumaCut settings and copy the config.');
  process.exit(1);
}

const headers = {
  'content-type': 'application/json',
  'x-lumacut-agent-token': token
};

async function call(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.error || (Array.isArray(data?.errors) ? data.errors.map((error) => error.message).join('; ') : text) || response.statusText;
    throw new Error(`LumaCut API ${response.status}: ${message}`);
  }
  return data;
}

async function current() {
  return call('/api/agent/current');
}

async function setActivity(active, label) {
  const session = await current();
  return call(`/api/agent/sessions/${session.id}/activity`, {
    method: 'POST',
    body: JSON.stringify({ active, label })
  });
}

async function withActivity(label, run) {
  await setActivity(true, label).catch(() => {});
  try {
    return await run();
  } finally {
    await setActivity(false, '').catch(() => {});
  }
}

async function imageContent(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const data = Buffer.from(await response.arrayBuffer()).toString('base64');
  return { content: [{ type: 'image', data, mimeType }] };
}

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failure = (error) => ({ isError: true, content: [{ type: 'text', text: String(error?.message || error) }] });

const server = new McpServer({ name: 'lumacut', version: '1.0.0' });

server.registerTool('get_project', {
  title: 'Get LumaCut project',
  description: 'Read the live project: tracks, clips, timeline positions, keyframes and settings. Use this before every edit.',
  inputSchema: {}
}, async () => {
  try { return text(await current()); } catch (error) { return failure(error); }
});

server.registerTool('list_assets', {
  title: 'List media assets',
  description: 'List imported media assets with IDs, kinds, durations, dimensions and URLs.',
  inputSchema: {}
}, async () => {
  try { return text(await call('/api/assets')); } catch (error) { return failure(error); }
});

server.registerTool('get_thumbnail', {
  title: 'Get asset thumbnail',
  description: 'Return an image thumbnail for a media asset so the agent can visually inspect source footage.',
  inputSchema: { assetId: z.string().min(1).describe('Asset ID from list_assets') }
}, async ({ assetId }) => {
  try {
    const assets = await call('/api/assets?lean=1');
    const asset = Array.isArray(assets) ? assets.find((item) => item.id === assetId) : null;
    if (!asset?.thumbnail) throw new Error(`No thumbnail for asset ${assetId}`);
    return imageContent(asset.thumbnail);
  } catch (error) { return failure(error); }
});

server.registerTool('get_asset_analysis', {
  title: 'Get asset analysis',
  description: 'Return cached scene cuts, silences, loudness, black/static spans and detected screen-recording content box for an asset.',
  inputSchema: {
    assetId: z.string().min(1).describe('Asset ID from list_assets'),
    refresh: z.boolean().optional().describe('Recompute the analysis')
  }
}, async ({ assetId, refresh }) => {
  try { return text(await call(`/api/assets/${assetId}/analysis${refresh ? '?refresh=1' : ''}`)); } catch (error) { return failure(error); }
});

server.registerTool('get_frame', {
  title: 'Get timeline frame',
  description: 'Render the top visible video/image layer at a timeline second and return it as an image. Crop is applied; text, stickers, transitions and multi-layer compositing are not yet rendered.',
  inputSchema: {
    at: z.number().min(0).describe('Timeline position in seconds'),
    width: z.number().min(160).max(1920).optional().describe('Output width in pixels; default 960')
  }
}, async ({ at, width }) => {
  try {
    return await withActivity('Rendering a timeline frame', async () => {
      const session = await current();
      return imageContent(`/api/agent/sessions/${session.id}/frame?at=${encodeURIComponent(at)}&w=${encodeURIComponent(width || 960)}`);
    });
  } catch (error) { return failure(error); }
});

server.registerTool('get_contact_sheet', {
  title: 'Get timeline contact sheet',
  description: 'Render a tiled JPEG of timeline frames. Use this once to understand pacing and content instead of many frame calls.',
  inputSchema: {
    from: z.number().min(0).optional().describe('Start timeline seconds; default 0'),
    to: z.number().min(0).optional().describe('End timeline seconds; default project duration'),
    step: z.number().min(0.2).optional().describe('Seconds between frames; default divides the range into about 12 frames'),
    width: z.number().min(160).max(1280).optional().describe('Per-frame width; default 480')
  }
}, async ({ from, to, step, width }) => {
  try {
    return await withActivity('Building a contact sheet', async () => {
      const session = await current();
      const params = new URLSearchParams();
      if (from !== undefined) params.set('from', String(from));
      if (to !== undefined) params.set('to', String(to));
      if (step !== undefined) params.set('step', String(step));
      if (width !== undefined) params.set('w', String(width));
      return imageContent(`/api/agent/sessions/${session.id}/sheet?${params.toString()}`);
    });
  } catch (error) { return failure(error); }
});

server.registerTool('get_capabilities', {
  title: 'Get command capabilities',
  description: 'List the validated editing commands available to this agent.',
  inputSchema: {}
}, async () => {
  try { return text(await call('/api/agent/capabilities')); } catch (error) { return failure(error); }
});

server.registerTool('apply_commands', {
  title: 'Apply timeline commands',
  description: 'Apply one or more validated commands to the live timeline. Prefer create_proposal for destructive or multi-step edits. Set dryRun=true to preview without committing.',
  inputSchema: {
    commands: z.array(z.record(z.string(), z.unknown())).min(1).describe('Command objects, e.g. {"type":"clip.move","clipId":"...","start":4}'),
    dryRun: z.boolean().optional().describe('Preview the resulting diff without committing')
  }
}, async ({ commands, dryRun }) => {
  try {
    return await withActivity(dryRun ? 'Previewing timeline changes' : 'Editing the timeline', async () => {
      const session = await current();
      const data = await call(`/api/agent/sessions/${session.id}/commands`, {
        method: 'POST',
        body: JSON.stringify({ commands, dryRun: dryRun === true })
      });
      return text(data);
    });
  } catch (error) { return failure(error); }
});

server.registerTool('render_proxy', {
  title: 'Render a timeline proxy',
  description: 'Render a low-resolution MP4 preview of the top visible video/image layer. Good for verification; text, stickers, transitions, effects and audio are not composited.',
  inputSchema: {
    from: z.number().min(0).optional().describe('Start timeline seconds; default 0'),
    to: z.number().min(0).optional().describe('End timeline seconds; default project duration'),
    width: z.number().min(160).max(1280).optional().describe('Output width; default 480'),
    fps: z.number().min(1).max(6).optional().describe('Proxy frame rate; default 2')
  }
}, async ({ from, to, width, fps }) => {
  try {
    return await withActivity('Rendering a preview proxy', async () => {
      const session = await current();
      const data = await call(`/api/agent/sessions/${session.id}/proxy`, {
        method: 'POST',
        body: JSON.stringify({ from, to, width, fps })
      });
      return text({ ...data, absoluteUrl: `${baseUrl}${data.url}` });
    });
  } catch (error) { return failure(error); }
});

server.registerTool('create_proposal', {
  title: 'Create edit proposal',
  description: 'Prepare a previewable edit transaction with a rationale. Use apply_proposal or reject_proposal after reviewing the diff with the user.',
  inputSchema: {
    commands: z.array(z.record(z.string(), z.unknown())).min(1).describe('Validated command objects to include in the proposal'),
    rationale: z.string().min(1).max(2000).describe('Why this edit helps the user')
  }
}, async ({ commands, rationale }) => {
  try {
    return await withActivity('Preparing an edit proposal', async () => {
      const session = await current();
      const data = await call(`/api/agent/sessions/${session.id}/proposals`, {
        method: 'POST',
        body: JSON.stringify({ commands, rationale })
      });
      return text(data);
    });
  } catch (error) { return failure(error); }
});

server.registerTool('apply_proposal', {
  title: 'Apply edit proposal',
  description: 'Apply a previously created proposal to the live project.',
  inputSchema: { proposalId: z.string().min(1).describe('Proposal ID returned by create_proposal') }
}, async ({ proposalId }) => {
  try {
    return await withActivity('Applying the edit proposal', async () => {
      const session = await current();
      return text(await call(`/api/agent/sessions/${session.id}/proposals/${proposalId}/apply`, { method: 'POST' }));
    });
  } catch (error) { return failure(error); }
});

server.registerTool('reject_proposal', {
  title: 'Reject edit proposal',
  description: 'Discard a proposal without changing the live project.',
  inputSchema: { proposalId: z.string().min(1).describe('Proposal ID returned by create_proposal') }
}, async ({ proposalId }) => {
  try {
    const session = await current();
    return text(await call(`/api/agent/sessions/${session.id}/proposals/${proposalId}/reject`, { method: 'POST' }));
  } catch (error) { return failure(error); }
});

server.registerTool('get_live_session', {
  title: 'Get live session',
  description: 'Read the current session ID, revision and expiry. Use this to confirm the editor is connected.',
  inputSchema: {}
}, async () => {
  try {
    const session = await current();
    return text({ id: session.id, revision: session.revision, expiresAt: session.expiresAt });
  } catch (error) { return failure(error); }
});

console.error(`[lumacut-mcp] connected to ${baseUrl}`);

await server.connect(new StdioServerTransport());

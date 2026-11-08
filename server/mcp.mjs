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
    const assets = await call('/api/assets');
    const asset = Array.isArray(assets) ? assets.find((item) => item.id === assetId) : null;
    if (!asset?.thumbnail) throw new Error(`No thumbnail for asset ${assetId}`);
    const response = await fetch(`${baseUrl}${asset.thumbnail}`);
    if (!response.ok) throw new Error(`Thumbnail request failed: ${response.status}`);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const data = Buffer.from(await response.arrayBuffer()).toString('base64');
    return { content: [{ type: 'image', data, mimeType }] };
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
    const session = await current();
    const data = await call(`/api/agent/sessions/${session.id}/commands`, {
      method: 'POST',
      body: JSON.stringify({ commands, dryRun: dryRun === true })
    });
    return text(data);
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
    const session = await current();
    const data = await call(`/api/agent/sessions/${session.id}/proposals`, {
      method: 'POST',
      body: JSON.stringify({ commands, rationale })
    });
    return text(data);
  } catch (error) { return failure(error); }
});

server.registerTool('apply_proposal', {
  title: 'Apply edit proposal',
  description: 'Apply a previously created proposal to the live project.',
  inputSchema: { proposalId: z.string().min(1).describe('Proposal ID returned by create_proposal') }
}, async ({ proposalId }) => {
  try {
    const session = await current();
    return text(await call(`/api/agent/sessions/${session.id}/proposals/${proposalId}/apply`, { method: 'POST' }));
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

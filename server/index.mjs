import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCaptionService } from './captions.mjs';
import { applyCommands, AGENT_COMMANDS } from '../shared/project-commands.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataRoot = process.env.LUMACUT_DATA_DIR ? path.resolve(process.env.LUMACUT_DATA_DIR) : root;
const mediaDir = path.join(dataRoot, 'media');
const thumbDir = path.join(mediaDir, 'thumbs');
const exportDir = path.join(dataRoot, 'exports');
const dataDir = path.join(dataRoot, 'data');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const assetsFile = path.join(dataDir, 'assets.json');

for (const dir of [mediaDir, thumbDir, exportDir, dataDir]) fs.mkdirSync(dir, { recursive: true });

const app = express();
const PORT = Number(process.env.PORT || 4317);
const isProd = process.argv.includes('--prod') || process.env.LUMACUT_PROD === '1';
app.use(express.json({ limit: '25mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const randomId = (prefix = 'asset') => `${prefix}_${crypto.randomBytes(7).toString('hex')}`;
const slug = (name) => path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'media';

function execFileP(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 32, ...opts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

async function probe(filePath) {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath
  ]);
  const info = JSON.parse(stdout);
  const video = info.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  return {
    duration: Number(info.format?.duration || video?.duration || audio?.duration || 0),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    mime: info.format?.format_name || ''
  };
}

async function makeThumbnail(filePath, kind, id) {
  const dest = path.join(thumbDir, `${id}.jpg`);
  if (kind === 'audio') {
    await execFileP('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', filePath,
      '-filter_complex', "showwavespic=s=640x240:colors=#62e6c1|#9b8cff:scale=sqrt", '-frames:v', '1', dest
    ]);
  } else {
    const seek = kind === 'video' ? ['-ss', '1'] : [];
    await execFileP('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', ...seek, '-i', filePath,
      '-frames:v', '1', '-vf', 'scale=640:-2', dest
    ]);
  }
  return `/media/thumbs/${id}.jpg`;
}

async function extractPeaks(filePath, duration) {
  if (!duration || duration < 0.05) return [];
  const rate = 40;
  const samples = await new Promise((resolve) => {
    const chunks = [];
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', filePath, '-ac', '1', '-ar', String(rate), '-f', 's16le', '-']);
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
  if (!samples.length) return [];
  const values = [];
  for (let i = 0; i + 1 < samples.length; i += 2) values.push(Math.abs(samples.readInt16LE(i)) / 32768);
  const max = Math.max(...values, 0.0001);
  const target = Math.min(4000, Math.max(120, Math.round(duration * 24)));
  const bucket = Math.max(1, Math.floor(values.length / target));
  const peaks = [];
  for (let i = 0; i < values.length; i += bucket) {
    let peak = 0;
    for (let j = i; j < Math.min(i + bucket, values.length); j++) peak = Math.max(peak, values[j]);
    peaks.push(Math.round(Math.min(1, (peak / max) ** 0.72) * 100));
  }
  return peaks;
}

async function ensureWaveform(asset) {
  if (asset.peaks?.length) return asset;
  const filePath = asset.source === 'demo' ? path.join(publicDir, asset.url.replace(/^\//, '')) : path.join(mediaDir, asset.url.replace(/^\/media\//, ''));
  if (!fs.existsSync(filePath)) return asset;
  try {
    asset.peaks = await extractPeaks(filePath, asset.duration);
  } catch { asset.peaks = []; }
  return asset;
}

async function loadAssets() {
  let stored = [];
  if (fs.existsSync(assetsFile)) {
    try { stored = JSON.parse(fs.readFileSync(assetsFile, 'utf8')); } catch { stored = []; }
  }
  const all = stored.filter((asset) => asset.source !== 'demo' && !String(asset.id).startsWith('demo-'));
  const removedDemo = all.length !== stored.length;

  // Make the library instantly usable: pre-compute waveform data once, persist it.
  let changed = false;
  for (const asset of all) {
    if (asset.kind === 'audio' && !asset.peaks?.length) {
      await ensureWaveform(asset);
      changed = true;
    }
  }
  if (changed || removedDemo) await saveAssets(all);
  return all;
}

async function saveAssets(assets) {
  await fsp.writeFile(assetsFile, JSON.stringify(assets, null, 2));
}

let assets = await loadAssets();

let h264Encoder = 'libopenh264';
let hevcEncoder = null;
let av1Encoder = null;
let vp9Encoder = 'libvpx-vp9';
let encoderList = '';
try {
  const { stdout } = await execFileP('ffmpeg', ['-hide_banner', '-encoders']);
  encoderList = stdout;
  if (/\blibx264\b/.test(stdout)) h264Encoder = 'libx264';
  else if (/\blibopenh264\b/.test(stdout)) h264Encoder = 'libopenh264';
  else if (/\bmpeg4\b/.test(stdout)) h264Encoder = 'mpeg4';
  if (/\blibx265\b/.test(stdout)) hevcEncoder = 'libx265';
  if (/\blibsvtav1\b/.test(stdout)) av1Encoder = 'libsvtav1';
  else if (/\blibaom-av1\b/.test(stdout)) av1Encoder = 'libaom-av1';
  if (!/\blibvpx-vp9\b/.test(stdout)) vp9Encoder = /\blibvpx\b/.test(stdout) ? 'libvpx' : 'libvpx-vp9';
} catch {
  // Keep the defaults; the export call will surface an actionable FFmpeg error.
}

const HW_CODECS = {
  h264: { codec: 'h264', encoder: 'h264_vaapi', label: 'H.264', profile: ['-profile:v', 'main'] },
  hevc: { codec: 'hevc', encoder: 'hevc_vaapi', label: 'HEVC', profile: ['-profile:v', 'main'] },
  av1: { codec: 'av1', encoder: 'av1_vaapi', label: 'AV1', profile: [] },
  vp9: { codec: 'vp9', encoder: 'vp9_vaapi', label: 'VP9', profile: [] }
};

function findAmdRenderNodes() {
  try {
    const vendorFiles = fs.readdirSync('/sys/class/drm').filter((name) => /^card\d+$/.test(name));
    const hasAmd = vendorFiles.some((name) => {
      try { return fs.readFileSync(`/sys/class/drm/${name}/device/vendor`, 'utf8').trim() === '0x1002'; } catch { return false; }
    });
    if (!hasAmd) return [];
    return fs.readdirSync('/dev/dri')
      .filter((name) => /^renderD\d+$/.test(name))
      .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
      .map((name) => `/dev/dri/${name}`);
  } catch {
    return [];
  }
}

async function readGpuNames() {
  const names = new Set();
  try {
    const { stdout } = await execFileP('lspci', ['-nn'], { timeout: 3500 });
    for (const line of stdout.split('\n')) {
      if (!/(VGA compatible controller|Display controller|3D controller)/i.test(line)) continue;
      if (!/AMD|ATI/i.test(line)) continue;
      const cleaned = line
        .replace(/^.*\[AMD\/ATI\]\s*/, '')
        .replace(/\s*\[1002:[0-9a-f]+\]\s*$/i, '')
        .replace(/\s*\(rev [^)]+\)$/, '')
        .trim();
      const radeon = cleaned.match(/Radeon[^\]]*/i)?.[0]?.trim();
      names.add(`AMD ${radeon || cleaned}`);
    }
  } catch {}
  return [...names];
}

async function probeVaapi(node, candidate, tenBit = false) {
  const profile = tenBit && candidate.codec === 'hevc' ? ['-profile:v', 'main10'] : candidate.profile;
  await execFileP('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-init_hw_device', `vaapi=amd:${node}`,
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=0.2',
    '-vf', tenBit ? 'format=p010,hwupload' : 'format=nv12,hwupload',
    '-c:v', candidate.encoder,
    '-rc_mode', 'CQP', '-qp', '28',
    ...profile,
    '-f', 'null', '-'
  ], { timeout: 6000 });
}

async function detectHardware() {
  const gpuNames = await readGpuNames();
  const nodes = findAmdRenderNodes();
  const amd = gpuNames.length > 0 || nodes.length > 0;
  const hardware = {
    detected: amd,
    vendor: amd ? 'AMD' : null,
    gpuNames: gpuNames.length ? gpuNames : amd ? ['AMD Radeon GPU'] : [],
    backend: 'VAAPI',
    renderNodes: nodes,
    encoders: [],
    preferredFor: { mp4: null, webm: null },
    preferred: null,
    probedAt: new Date().toISOString()
  };
  if (!amd) return hardware;
  const found = new Map();
  for (const node of nodes) {
    for (const candidate of Object.values(HW_CODECS)) {
      if (!new RegExp(`\\b${candidate.encoder}\\b`).test(encoderList)) continue;
      if (found.has(candidate.codec)) continue;
      try {
        await probeVaapi(node, candidate);
        let tenBit = false;
        if (candidate.codec === 'hevc' || candidate.codec === 'av1') {
          try { await probeVaapi(node, candidate, true); tenBit = true; } catch {}
        }
        found.set(candidate.codec, {
          codec: candidate.codec,
          encoder: candidate.encoder,
          label: `AMD VAAPI · ${candidate.label}`,
          backend: 'vaapi',
          renderNode: node,
          profile: candidate.profile,
          tenBit
        });
      } catch {}
    }
    if (found.size > 0) break;
  }
  hardware.encoders = [...found.values()];
  hardware.preferredFor.mp4 = found.get('h264') || found.get('hevc') || found.get('av1') || null;
  hardware.preferredFor.webm = found.get('av1') || found.get('vp9') || null;
  hardware.preferred = hardware.preferredFor.mp4 || hardware.preferredFor.webm;
  return hardware;
}

const hardware = await detectHardware();
const findHardware = (codec) => hardware.encoders.find((entry) => entry.codec === codec) || null;
const codecs = {
  h264: {
    codec: 'h264', label: 'H.264', formats: ['mp4'], maxBitDepth: 8, hdr: false,
    software: h264Encoder, hardware: findHardware('h264')
  },
  hevc: {
    codec: 'hevc', label: 'H.265 (HEVC)', formats: ['mp4'], maxBitDepth: 10, hdr: true,
    software: hevcEncoder, hardware: findHardware('hevc')
  },
  av1: {
    codec: 'av1', label: 'AV1', formats: ['mp4', 'webm'], maxBitDepth: 10, hdr: true,
    software: av1Encoder, hardware: findHardware('av1')
  },
  vp9: {
    codec: 'vp9', label: 'VP9', formats: ['webm'], maxBitDepth: 8, hdr: false,
    software: vp9Encoder, hardware: findHardware('vp9')
  }
};

if (hardware.detected) {
  const names = hardware.encoders.map((entry) => `${entry.codec}${entry.tenBit ? ' 10-bit' : ''}`).join(', ') || 'no working VAAPI encoder';
  console.log(`GPU: ${hardware.gpuNames.join(' / ')} · ${hardware.renderNodes.join(', ')} · ${names}`);
} else {
  console.log('GPU: no AMD Radeon detected · software encoding');
}
console.log(`Software codecs: ${[h264Encoder, hevcEncoder, av1Encoder, vp9Encoder].filter(Boolean).join(', ')}`);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ffmpeg: true,
    version: '1.9.0',
    platform: process.platform,
    prod: isProd,
    dataDir,
    hardware: {
      detected: hardware.detected,
      label: hardware.preferred?.label || null,
      codec: hardware.preferred?.codec || null,
      tenBit: Boolean(hardware.preferred?.tenBit)
    }
  });
});

app.get('/api/capabilities', (req, res) => {
  res.json({
    version: '1.9.0',
    hardware,
    software: { h264: h264Encoder, hevc: hevcEncoder, av1: av1Encoder, vp9: vp9Encoder },
    codecs
  });
});

const AGENT_SESSION_TTL = 2 * 60 * 60 * 1000;
const agentSessions = new Map();

function cleanupAgentSessions() {
  const now = Date.now();
  for (const [id, session] of agentSessions) {
    if (session.expiresAt <= now) agentSessions.delete(id);
  }
}

const agentTokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function requireAgentToken(req, res, session) {
  const token = String(req.get('x-lumacut-agent-token') || '');
  if (!token || agentTokenHash(token) !== session.tokenHash) {
    res.status(401).json({ error: 'Invalid or missing x-lumacut-agent-token' });
    return false;
  }
  return true;
}

function agentSession(req, res) {
  cleanupAgentSessions();
  const session = agentSessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Agent session not found or expired' });
    return null;
  }
  if (!requireAgentToken(req, res, session)) return null;
  session.expiresAt = Date.now() + AGENT_SESSION_TTL;
  return session;
}

app.get('/api/agent/capabilities', (req, res) => {
  res.json({
    apiVersion: '1.0.0',
    sessions: true,
    proposals: true,
    commands: AGENT_COMMANDS,
    transport: 'local HTTP + MCP stdio server',
    auth: 'x-lumacut-agent-token required for sessions',
    mcpPath: path.join(root, 'server', 'mcp.mjs')
  });
});

app.post('/api/agent/sessions', (req, res) => {
  const project = req.body?.project;
  const token = String(req.body?.token || '');
  if (!project || typeof project !== 'object' || !Array.isArray(project.clips) || !Array.isArray(project.tracks)) {
    return res.status(400).json({ error: 'A project with clips and tracks is required.' });
  }
  if (token.length < 16) {
    return res.status(400).json({ error: 'An agent token of at least 16 characters is required.' });
  }
  cleanupAgentSessions();
  const id = randomId('agent');
  const session = {
    id,
    tokenHash: agentTokenHash(token),
    project: JSON.parse(JSON.stringify(project)),
    revision: 1,
    proposals: new Map(),
    createdAt: Date.now(),
    expiresAt: Date.now() + AGENT_SESSION_TTL
  };
  agentSessions.set(id, session);
  res.status(201).json({ id, revision: session.revision, createdAt: session.createdAt, expiresAt: session.expiresAt, project: session.project, commands: AGENT_COMMANDS });
});

app.get('/api/agent/current', (req, res) => {
  cleanupAgentSessions();
  const token = String(req.get('x-lumacut-agent-token') || '');
  if (!token) return res.status(401).json({ error: 'Invalid or missing x-lumacut-agent-token' });
  const hash = agentTokenHash(token);
  const sessions = [...agentSessions.values()].filter((session) => session.tokenHash === hash).sort((a, b) => b.createdAt - a.createdAt);
  const session = sessions[0];
  if (!session) return res.status(404).json({ error: 'No live agent session. Enable Agent Bridge in LumaCut.' });
  session.expiresAt = Date.now() + AGENT_SESSION_TTL;
  res.json({ id: session.id, revision: session.revision, project: session.project, expiresAt: session.expiresAt });
});

app.post('/api/agent/sessions/:id/sync', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  const project = req.body?.project;
  if (!project || typeof project !== 'object' || !Array.isArray(project.clips) || !Array.isArray(project.tracks)) {
    return res.status(400).json({ error: 'A project with clips and tracks is required.' });
  }
  if (Number(req.body?.baseRevision) !== session.revision) {
    return res.status(409).json({ error: 'Revision conflict', revision: session.revision, project: session.project });
  }
  session.project = JSON.parse(JSON.stringify(project));
  session.revision += 1;
  session.expiresAt = Date.now() + AGENT_SESSION_TTL;
  res.json({ ok: true, revision: session.revision, project: session.project });
});

app.get('/api/agent/sessions/:id', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  res.json({
    id: session.id,
    revision: session.revision,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    project: session.project,
    proposals: [...session.proposals.values()].map(({ id, rationale, diff, createdAt }) => ({ id, rationale, diff, createdAt }))
  });
});

app.delete('/api/agent/sessions/:id', (req, res) => {
  const session = agentSessions.get(req.params.id);
  if (!session || !requireAgentToken(req, res, session)) return;
  agentSessions.delete(req.params.id);
  res.json({ ok: true });
});

app.post('/api/agent/sessions/:id/commands', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  const result = applyCommands(session.project, req.body?.commands, { assets });
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
  if (req.body?.dryRun !== true) {
    session.project = result.project;
    session.revision += 1;
  }
  res.json({ ok: true, dryRun: req.body?.dryRun === true, revision: session.revision, project: result.project, diff: result.diff });
});

app.post('/api/agent/sessions/:id/proposals', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  const result = applyCommands(session.project, req.body?.commands, { assets });
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
  const proposal = {
    id: randomId('proposal'),
    rationale: typeof req.body?.rationale === 'string' ? req.body.rationale.slice(0, 2000) : '',
    commands: req.body.commands,
    project: result.project,
    diff: result.diff,
    createdAt: Date.now()
  };
  session.proposals.set(proposal.id, proposal);
  res.status(201).json({ id: proposal.id, rationale: proposal.rationale, diff: proposal.diff, project: proposal.project });
});

app.post('/api/agent/sessions/:id/proposals/:proposalId/apply', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  const proposal = session.proposals.get(req.params.proposalId);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  session.project = JSON.parse(JSON.stringify(proposal.project));
  session.revision += 1;
  session.proposals.delete(proposal.id);
  res.json({ ok: true, revision: session.revision, project: session.project, diff: proposal.diff, proposalId: proposal.id });
});

app.post('/api/agent/sessions/:id/proposals/:proposalId/reject', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  const removed = session.proposals.delete(req.params.proposalId);
  if (!removed) return res.status(404).json({ error: 'Proposal not found' });
  res.json({ ok: true, proposalId: req.params.proposalId });
});

const captionService = createCaptionService({
  root, dataRoot: dataDir, mediaDir, publicDir,
  getAssets: () => assets,
  hardware
});

app.get('/api/captions/capabilities', (req, res) => {
  res.json(captionService.capabilities());
});

app.post('/api/captions/jobs', (req, res) => {
  try {
    res.status(202).json(captionService.startJob(req.body));
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: String(error?.message || error) });
  }
});

app.get('/api/captions/jobs/:id', (req, res) => {
  const job = captionService.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Caption job not found' });
  res.json(job);
});

app.delete('/api/captions/jobs/:id', (req, res) => {
  const cancelled = captionService.cancelJob(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'Caption job not found' });
  res.json({ ok: true });
});

app.get('/api/assets', (req, res) => {
  res.json(assets.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, mediaDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `${Date.now()}-${slug(file.originalname)}-${crypto.randomBytes(3).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.post('/api/assets', upload.array('files', 30), async (req, res) => {
  const created = [];
  const errors = [];
  for (const file of req.files || []) {
    try {
      const info = await probe(file.path);
      const kind = info.hasVideo && info.duration > 0.15 ? 'video' : info.hasVideo ? 'image' : 'audio';
      const id = randomId();
      const asset = {
        id,
        name: path.basename(file.originalname, path.extname(file.originalname)),
        kind,
        source: 'upload',
        url: `/media/${file.filename}`,
        thumbnail: null,
        duration: kind === 'image' ? 0 : info.duration,
        width: info.width,
        height: info.height,
        hasAudio: info.hasAudio,
        mime: info.mime,
        size: file.size,
        createdAt: new Date().toISOString(),
        peaks: []
      };
      try { asset.thumbnail = await makeThumbnail(file.path, kind, id); } catch {}
      if (kind === 'audio' || (kind === 'video' && info.hasAudio)) {
        try { asset.peaks = await extractPeaks(file.path, info.duration); } catch {}
      }
      assets.push(asset);
      created.push(asset);
    } catch (error) {
      errors.push({ file: file.originalname, error: String(error?.message || error) });
    }
  }
  await saveAssets(assets);
  res.json({ assets: created, errors });
});

app.delete('/api/assets/:id', async (req, res) => {
  const index = assets.findIndex((a) => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Asset not found' });
  const [asset] = assets.splice(index, 1);
  if (asset.source === 'upload') {
    try { await fsp.unlink(path.join(mediaDir, asset.url.replace(/^\/media\//, ''))); } catch {}
    if (asset.thumbnail) {
      try { await fsp.unlink(path.join(mediaDir, asset.thumbnail.replace(/^\/media\//, ''))); } catch {}
    }
  }
  await saveAssets(assets);
  res.json({ ok: true });
});

app.patch('/api/assets/:id', async (req, res) => {
  const asset = assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  if (typeof req.body?.name === 'string' && req.body.name.trim()) asset.name = req.body.name.trim().slice(0, 100);
  await saveAssets(assets);
  res.json(asset);
});

// Project save/load is available in addition to the browser's instant autosave.
app.put('/api/projects/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid project id' });
  await fsp.writeFile(path.join(dataDir, `project-${id}.json`), JSON.stringify(req.body, null, 2));
  res.json({ ok: true, id });
});

app.get('/api/projects/:id', (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '');
  const file = path.join(dataDir, `project-${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Project not found' });
  res.sendFile(file);
});

function finishArgs(args, fps, duration, outPath) {
  args.push('-r', String(fps), '-fps_mode', 'cfr');
  if (duration > 0) args.push('-t', String(duration));
  args.push(outPath);
  return args;
}

const HDR_FILTER = 'zscale=pin=bt709:tin=bt709:min=bt709:rin=limited:p=bt709:t=linear:m=bt709:r=limited,format=gbrpf32le,zscale=pin=bt709:tin=linear:min=bt709:rin=limited:p=bt2020:t=smpte2084:m=bt2020nc:r=limited,format=yuv420p10le';

function filterFor(kind, bitDepth, hdr) {
  if (hdr) return kind === 'hardware' ? `${HDR_FILTER},format=p010,hwupload` : HDR_FILTER;
  if (bitDepth === 10) return kind === 'hardware' ? 'format=p010,hwupload' : 'format=yuv420p10le';
  return kind === 'hardware' ? 'format=nv12,hwupload' : null;
}

function colorArgs(bitDepth, hdr) {
  if (hdr) return ['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'];
  if (bitDepth === 10) return ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  return [];
}

function hevcInstallHelp() {
  return 'H.265/HEVC needs an FFmpeg build with libx265 or a working hevc_vaapi driver. On Fedora, enable RPM Fusion and install ffmpeg (or swap ffmpeg-free for ffmpeg), then restart LumaCut. See docs/HARDWARE.md.';
}

function resolveExportPlan({ format, codec, bitDepth, hdr, acceleration }) {
  if (codec === 'auto') {
    if (bitDepth !== 8 || hdr) {
      const error = new Error('Choose H.265 or AV1 for 10-bit and HDR output.');
      error.statusCode = 400;
      throw error;
    }
    const hardwareChoice = acceleration === 'auto' ? hardware.preferredFor[format] : null;
    if (hardwareChoice) {
      return {
        primary: { kind: 'hardware', hardware: hardwareChoice, encoder: hardwareChoice.encoder, codec: hardwareChoice.codec, bitDepth: 8, hdr: false },
        fallback: { kind: 'software', encoder: format === 'mp4' ? h264Encoder : vp9Encoder, codec: format === 'mp4' ? 'h264' : 'vp9', bitDepth: 8, hdr: false }
      };
    }
    return {
      primary: { kind: 'software', encoder: format === 'mp4' ? h264Encoder : vp9Encoder, codec: format === 'mp4' ? 'h264' : 'vp9', bitDepth: 8, hdr: false },
      fallback: null
    };
  }

  const meta = codecs[codec];
  if (!meta) {
    const error = new Error('Unknown codec.');
    error.statusCode = 400;
    throw error;
  }
  if (!meta.formats.includes(format)) {
    const error = new Error(`${meta.label} is not supported in ${format.toUpperCase()}. Choose MP4 or AV1.`);
    error.statusCode = 400;
    throw error;
  }
  if (bitDepth > meta.maxBitDepth) {
    const error = new Error(`${meta.label} supports a maximum of ${meta.maxBitDepth}-bit output. Choose ${meta.maxBitDepth === 10 ? '8-bit or 10-bit' : '8-bit'}.`);
    error.statusCode = 400;
    throw error;
  }
  if (hdr) {
    if (format !== 'mp4' || bitDepth !== 10 || !meta.hdr) {
      const error = new Error('HDR10 output requires MP4, 10-bit, and H.265 or AV1.');
      error.statusCode = 400;
      throw error;
    }
  }

  const hardwareChoice = meta.hardware && (bitDepth === 8 || meta.hardware.tenBit) ? meta.hardware : null;
  const softwareChoice = meta.software || null;
  if (acceleration === 'auto' && hardwareChoice) {
    return {
      primary: { kind: 'hardware', hardware: hardwareChoice, encoder: hardwareChoice.encoder, codec, bitDepth, hdr },
      fallback: softwareChoice ? { kind: 'software', encoder: softwareChoice, codec, bitDepth, hdr } : null
    };
  }
  if (softwareChoice) {
    return {
      primary: { kind: 'software', encoder: softwareChoice, codec, bitDepth, hdr },
      fallback: null
    };
  }
  if (hardwareChoice) {
    const error = new Error(`AMD GPU acceleration is off and no software ${meta.label} encoder is installed. ${codec === 'hevc' ? hevcInstallHelp() : ''}`.trim());
    error.statusCode = 400;
    throw error;
  }
  const error = new Error(`${meta.label} encoding is unavailable. ${codec === 'hevc' ? hevcInstallHelp() : 'Install an FFmpeg build with an AV1 encoder and restart LumaCut.'}`);
  error.statusCode = 400;
  throw error;
}

function softwareArgs(inputPath, outPath, { format, quality, fps, duration, codec, bitDepth, hdr, encoder }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath];
  const filter = filterFor('software', bitDepth, hdr);
  if (filter) args.push('-vf', filter);

  if (codec === 'h264') {
    if (encoder === 'mpeg4') {
      args.push('-c:v', 'mpeg4', '-q:v', quality === 'high' ? '2' : '4');
    } else {
      args.push('-c:v', encoder, '-pix_fmt', 'yuv420p');
      if (encoder === 'libx264') args.push('-preset', quality === 'high' ? 'slow' : 'veryfast', '-crf', quality === 'high' ? '18' : '22');
      else if (encoder === 'libopenh264') args.push('-preset', quality === 'high' ? 'quality' : 'balanced', '-b:v', quality === 'high' ? '18M' : '9M');
      else args.push('-b:v', quality === 'high' ? '18M' : '9M');
    }
  } else if (codec === 'hevc') {
    args.push('-c:v', encoder || 'libx265', '-preset', quality === 'high' ? 'slow' : 'medium', '-crf', quality === 'high' ? '20' : '24', '-tag:v', 'hvc1');
    args.push('-pix_fmt', bitDepth === 10 ? 'yuv420p10le' : 'yuv420p');
    if (hdr) args.push('-x265-params', 'hdr10=1:repeat-headers=1');
  } else if (codec === 'av1') {
    if (encoder === 'libsvtav1') {
      args.push('-c:v', 'libsvtav1', '-preset', quality === 'high' ? '6' : '9', '-crf', quality === 'high' ? '28' : '34');
    } else {
      args.push('-c:v', 'libaom-av1', '-b:v', '0', '-crf', quality === 'high' ? '28' : '34', '-cpu-used', '6', '-row-mt', '1');
    }
    args.push('-pix_fmt', bitDepth === 10 ? 'yuv420p10le' : 'yuv420p');
  } else {
    args.push('-c:v', encoder || vp9Encoder, '-b:v', '0', '-crf', quality === 'high' ? '26' : '34');
  }

  args.push(...colorArgs(bitDepth, hdr));
  if (format === 'mp4') {
    args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  } else {
    args.push('-c:a', 'libopus', '-b:a', '160k');
  }
  return finishArgs(args, fps, duration, outPath);
}

function hardwareArgs(inputPath, outPath, hw, { format, quality, fps, duration, codec, bitDepth, hdr }) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-vaapi_device', hw.renderNode,
    '-i', inputPath,
    '-vf', filterFor('hardware', bitDepth, hdr),
    '-c:v', hw.encoder,
    '-rc_mode', 'CQP', '-qp', quality === 'high' ? '18' : '24'
  ];
  if (codec === 'h264') args.push('-profile:v', 'main');
  else if (codec === 'hevc') args.push('-profile:v', bitDepth === 10 ? 'main10' : 'main');
  else if (codec === 'av1') args.push('-profile:v', 'main');
  args.push(...colorArgs(bitDepth, hdr));
  if (format === 'mp4') {
    args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  } else {
    args.push('-c:a', 'libopus', '-b:a', '160k');
  }
  return finishArgs(args, fps, duration, outPath);
}

const exportUpload = multer({ dest: path.join(exportDir, '.tmp'), limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

app.post('/api/export', exportUpload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No recording uploaded' });
  const format = req.body.format === 'webm' ? 'webm' : 'mp4';
  const quality = req.body.quality === 'high' ? 'high' : 'standard';
  const acceleration = req.body.acceleration === 'off' ? 'off' : 'auto';
  const codec = ['auto', 'h264', 'hevc', 'av1'].includes(req.body.codec) ? req.body.codec : 'auto';
  const bitDepth = req.body.bitDepth === '10' ? 10 : 8;
  const hdr = req.body.hdr === '1' || req.body.hdr === 'true';
  const fps = Math.max(12, Math.min(60, Math.round(Number(req.body.fps) || 30)));
  const duration = Math.max(0, Math.min(3600, Number(req.body.duration) || 0));
  const base = slug(req.body.name || 'lumacut-export');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const outName = `${base}-${stamp}.${format}`;
  const outPath = path.join(exportDir, outName);
  let lastError = null;
  try {
    const plan = resolveExportPlan({ format, codec, bitDepth, hdr, acceleration });
    const attempts = [plan.primary, plan.fallback].filter(Boolean);
    let used = null;
    for (const attempt of attempts) {
      try {
        const args = attempt.kind === 'hardware'
          ? hardwareArgs(req.file.path, outPath, attempt.hardware, { format, quality, fps, duration, codec: attempt.codec, bitDepth: attempt.bitDepth, hdr: attempt.hdr })
          : softwareArgs(req.file.path, outPath, { format, quality, fps, duration, codec: attempt.codec, bitDepth: attempt.bitDepth, hdr: attempt.hdr, encoder: attempt.encoder });
        await execFileP('ffmpeg', args, { timeout: 20 * 60 * 1000 });
        used = attempt;
        break;
      } catch (error) {
        lastError = error;
        if (attempt.kind === 'hardware') console.warn(`Hardware encode failed (${attempt.encoder}); falling back if possible.`);
      }
    }
    if (!used) throw lastError || new Error('No encoder was able to produce the file.');
    if (!fs.existsSync(outPath)) throw new Error('The encoder did not produce a file.');
    try { await fsp.unlink(req.file.path); } catch {}
    const stat = await fsp.stat(outPath);
    res.json({
      ok: true,
      url: `/exports/${outName}`,
      filename: outName,
      path: outPath,
      size: stat.size,
      format,
      hardware: used.kind === 'hardware',
      encoder: used.encoder,
      codec: used.codec,
      bitDepth: used.bitDepth,
      hdr: used.hdr,
      acceleration: used.kind === 'hardware' ? 'amd-vaapi' : 'software'
    });
  } catch (error) {
    try { await fsp.unlink(req.file.path); } catch {}
    res.status(error.statusCode || 500).json({ error: 'Export failed', detail: String(error?.stderr || error?.message || error).slice(-4000) });
  }
});

app.get('/api/exports', async (req, res) => {
  const entries = await fsp.readdir(exportDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(exportDir, entry.name);
    const stat = await fsp.stat(full);
    files.push({
      filename: entry.name,
      url: `/exports/${encodeURIComponent(entry.name)}`,
      size: stat.size,
      createdAt: stat.mtime.toISOString()
    });
  }
  res.json(files.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30));
});

app.delete('/api/exports/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  try {
    await fsp.unlink(path.join(exportDir, name));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

app.use('/media', express.static(mediaDir, { maxAge: '1h' }));
app.use('/demo', express.static(path.join(publicDir, 'demo'), { maxAge: '1h' }));
app.use('/exports', express.static(exportDir, { maxAge: '1h' }));

if (isProd) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/demo/') || req.path.startsWith('/exports/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: String(err?.message || err) });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`LumaCut media server → http://127.0.0.1:${PORT}`);
  console.log(`Library: ${assets.length} assets · ${mediaDir}`);
  console.log(`Data root: ${dataRoot}`);
  console.log(`Encoders: ${h264Encoder} (H.264) · ${vp9Encoder} (VP9)`);
});

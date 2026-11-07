import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

function demoAssets() {
  const manifestPath = path.join(publicDir, 'demo', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.assets.map((a) => ({
    ...a,
    id: a.id,
    source: 'demo',
    url: `/demo/${a.file}`,
    thumbnail: a.thumbnail ? `/demo/${a.thumbnail}` : null,
    createdAt: manifest.generatedAt,
    size: fs.existsSync(path.join(publicDir, 'demo', a.file)) ? fs.statSync(path.join(publicDir, 'demo', a.file)).size : 0,
    peaks: []
  }));
}

async function loadAssets() {
  let stored = [];
  if (fs.existsSync(assetsFile)) {
    try { stored = JSON.parse(fs.readFileSync(assetsFile, 'utf8')); } catch { stored = []; }
  }
  const demo = demoAssets();
  const byId = new Map();
  for (const asset of stored) byId.set(asset.id, asset);
  for (const asset of demo) byId.set(asset.id, { ...asset, ...(byId.get(asset.id) || {}), ...asset, peaks: byId.get(asset.id)?.peaks || [] });
  const all = [...byId.values()].filter((a) => a.kind !== 'audio' || true);

  // Make the library instantly usable: pre-compute waveform data once, persist it.
  let changed = false;
  for (const asset of all) {
    if (asset.kind === 'audio' && !asset.peaks?.length) {
      await ensureWaveform(asset);
      changed = true;
    }
  }
  if (changed) await saveAssets(all);
  return all;
}

async function saveAssets(assets) {
  await fsp.writeFile(assetsFile, JSON.stringify(assets, null, 2));
}

let assets = await loadAssets();

let h264Encoder = 'libopenh264';
let vp9Encoder = 'libvpx-vp9';
let encoderList = '';
try {
  const { stdout } = await execFileP('ffmpeg', ['-hide_banner', '-encoders']);
  encoderList = stdout;
  if (/\blibx264\b/.test(stdout)) h264Encoder = 'libx264';
  else if (/\blibopenh264\b/.test(stdout)) h264Encoder = 'libopenh264';
  else if (/\bmpeg4\b/.test(stdout)) h264Encoder = 'mpeg4';
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

async function probeVaapi(node, candidate) {
  await execFileP('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-init_hw_device', `vaapi=amd:${node}`,
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=0.2',
    '-vf', 'format=nv12,hwupload',
    '-c:v', candidate.encoder,
    '-rc_mode', 'CQP', '-qp', '28',
    ...candidate.profile,
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
        found.set(candidate.codec, {
          codec: candidate.codec,
          encoder: candidate.encoder,
          label: `AMD VAAPI · ${candidate.label}`,
          backend: 'vaapi',
          renderNode: node,
          profile: candidate.profile
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
if (hardware.detected) {
  const codecs = hardware.encoders.map((entry) => entry.codec).join(', ') || 'no working VAAPI encoder';
  console.log(`GPU: ${hardware.gpuNames.join(' / ')} · ${hardware.renderNodes.join(', ')} · ${codecs}`);
} else {
  console.log('GPU: no AMD Radeon detected · software encoding');
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ffmpeg: true,
    version: '1.2.0',
    platform: process.platform,
    prod: isProd,
    dataDir,
    hardware: {
      detected: hardware.detected,
      label: hardware.preferred?.label || null,
      codec: hardware.preferred?.codec || null
    }
  });
});

app.get('/api/capabilities', (req, res) => {
  res.json({
    version: '1.2.0',
    hardware,
    software: { h264: h264Encoder, vp9: vp9Encoder }
  });
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

function softwareArgs(inputPath, outPath, { format, quality, fps, duration }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath];
  if (format === 'mp4') {
    if (h264Encoder === 'mpeg4') {
      args.push('-c:v', 'mpeg4', '-q:v', quality === 'high' ? '2' : '4');
    } else {
      args.push('-c:v', h264Encoder, '-pix_fmt', 'yuv420p');
      if (h264Encoder === 'libx264') args.push('-preset', quality === 'high' ? 'slow' : 'veryfast', '-crf', quality === 'high' ? '18' : '22');
      else if (h264Encoder === 'libopenh264') args.push('-preset', quality === 'high' ? 'quality' : 'balanced', '-b:v', quality === 'high' ? '18M' : '9M');
      else args.push('-b:v', quality === 'high' ? '18M' : '9M');
    }
    args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  } else {
    args.push('-c:v', vp9Encoder, '-b:v', '0', '-crf', quality === 'high' ? '26' : '34', '-c:a', 'libopus', '-b:a', '160k');
  }
  return finishArgs(args, fps, duration, outPath);
}

function hardwareArgs(inputPath, outPath, hw, { format, quality, fps, duration }) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-vaapi_device', hw.renderNode,
    '-i', inputPath,
    '-vf', 'format=nv12,hwupload',
    '-c:v', hw.encoder,
    '-rc_mode', 'CQP', '-qp', quality === 'high' ? '20' : '26',
    ...(hw.profile || [])
  ];
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
  const fps = Math.max(12, Math.min(60, Math.round(Number(req.body.fps) || 30)));
  const duration = Math.max(0, Math.min(3600, Number(req.body.duration) || 0));
  const base = slug(req.body.name || 'lumacut-export');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const outName = `${base}-${stamp}.${format}`;
  const outPath = path.join(exportDir, outName);
  const requestedHw = acceleration === 'auto' ? hardware.preferredFor[format] : null;
  const attempts = requestedHw ? [requestedHw, null] : [null];
  let usedHw = null;
  let lastError = null;
  try {
    for (const hw of attempts) {
      try {
        const args = hw
          ? hardwareArgs(req.file.path, outPath, hw, { format, quality, fps, duration })
          : softwareArgs(req.file.path, outPath, { format, quality, fps, duration });
        await execFileP('ffmpeg', args, { timeout: 20 * 60 * 1000 });
        usedHw = hw;
        break;
      } catch (error) {
        lastError = error;
        if (hw) console.warn(`Hardware encode failed (${hw.encoder}); falling back to software.`);
      }
    }
    if (!usedHw && lastError && attempts.length === 1) throw lastError;
    if (!fs.existsSync(outPath)) throw lastError || new Error('The encoder did not produce a file');
    try { await fsp.unlink(req.file.path); } catch {}
    const stat = await fsp.stat(outPath);
    res.json({
      ok: true,
      url: `/exports/${outName}`,
      filename: outName,
      path: outPath,
      size: stat.size,
      format,
      hardware: Boolean(usedHw),
      encoder: usedHw?.encoder || (format === 'mp4' ? h264Encoder : vp9Encoder),
      codec: usedHw?.codec || (format === 'mp4' ? (h264Encoder === 'mpeg4' ? 'mpeg4' : 'h264') : 'vp9'),
      acceleration: usedHw ? 'amd-vaapi' : 'software'
    });
  } catch (error) {
    try { await fsp.unlink(req.file.path); } catch {}
    res.status(500).json({ error: 'Export failed', detail: String(error?.stderr || error?.message || error).slice(-4000) });
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

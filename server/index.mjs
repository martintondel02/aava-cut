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
const frameDir = path.join(mediaDir, 'frames');
const exportDir = path.join(dataRoot, 'exports');
const dataDir = path.join(dataRoot, 'data');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const assetsFile = path.join(dataDir, 'assets.json');

for (const dir of [mediaDir, thumbDir, frameDir, exportDir, dataDir]) fs.mkdirSync(dir, { recursive: true });

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

let tiktokBusy = false;

function findYtDlp() {
  const candidates = [
    process.env.LUMACUT_YTDLP,
    path.join(root, '..', 'bin', 'yt-dlp'),
    path.join(root, 'vendor', 'yt-dlp', 'yt-dlp'),
    '/usr/bin/yt-dlp',
    '/usr/local/bin/yt-dlp'
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate) && fs.statSync(candidate).isFile(); } catch { return false; }
  }) || null;
}

function isTikTokUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' && [
      'www.tiktok.com', 'tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'
    ].includes(parsed.hostname.toLowerCase());
  } catch { return false; }
}

const analysisJobs = new Map();
const pixabayCache = new Map();
const PIXABAY_CACHE_TTL = 24 * 60 * 60 * 1000;
const soundsCache = new Map();
const SOUNDS_CACHE_TTL = 60 * 60 * 1000;

function pixabayKey(req) {
  return String(req.get('x-pixabay-key') || process.env.PIXABAY_API_KEY || '').trim();
}

function pixabayCacheKey(key, pathname, params) {
  const query = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join('&');
  return crypto.createHash('sha256').update(`${key}|${pathname}|${query}`).digest('hex');
}

function pixabayAllowed(url, type = 'media') {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'cdn.pixabay.com') return true;
    if (parsed.hostname === 'pixabay.com' && parsed.pathname.startsWith('/get/')) return true;
    if (type === 'page') return parsed.hostname === 'pixabay.com';
    return false;
  } catch { return false; }
}

function normalizePixabayHit(hit, type) {
  if (type === 'video') {
    const videos = hit.videos || {};
    const rendition = videos.large?.url ? videos.large : videos.medium?.url ? videos.medium : videos.small?.url ? videos.small : videos.tiny;
    if (!rendition?.url) return null;
    return {
      provider: 'Pixabay',
      id: String(hit.id),
      type: 'video',
      kind: 'video',
      title: (hit.tags || 'Pixabay video').split(',')[0].trim(),
      tags: hit.tags || '',
      thumbnail: rendition.thumbnail || videos.small?.thumbnail || videos.tiny?.thumbnail || '',
      downloadUrl: rendition.url,
      pageURL: hit.pageURL,
      width: rendition.width || 0,
      height: rendition.height || 0,
      duration: Number(hit.duration) || 0,
      size: Number(rendition.size) || 0,
      creator: hit.user || 'Pixabay contributor',
      creatorUrl: hit.user_id ? `https://pixabay.com/users/${encodeURIComponent(hit.user || 'user')}-${hit.user_id}/` : 'https://pixabay.com/',
      license: 'Pixabay Content License',
      licenseUrl: 'https://pixabay.com/service/license-summary/'
    };
  }
  const downloadUrl = hit.largeImageURL || hit.webformatURL || hit.imageURL;
  if (!downloadUrl) return null;
  return {
    provider: 'Pixabay',
    id: String(hit.id),
    type: 'image',
    kind: 'image',
    title: (hit.tags || 'Pixabay photo').split(',')[0].trim(),
    tags: hit.tags || '',
    thumbnail: hit.previewURL || hit.webformatURL || downloadUrl,
    downloadUrl,
    pageURL: hit.pageURL,
    width: hit.imageWidth || hit.webformatWidth || hit.previewWidth || 0,
    height: hit.imageHeight || hit.webformatHeight || hit.previewHeight || 0,
    duration: 0,
    size: hit.imageSize || 0,
    creator: hit.user || 'Pixabay contributor',
    creatorUrl: hit.user_id ? `https://pixabay.com/users/${encodeURIComponent(hit.user || 'user')}-${hit.user_id}/` : 'https://pixabay.com/',
    license: 'Pixabay Content License',
    licenseUrl: 'https://pixabay.com/service/license-summary/'
  };
}


function assetFilePath(asset) {
  if (!asset?.url) return null;
  const filePath = asset.source === 'demo'
    ? path.join(publicDir, asset.url.replace(/^\//, ''))
    : path.join(mediaDir, asset.url.replace(/^\/media\//, ''));
  return fs.existsSync(filePath) ? filePath : null;
}

function parsePairs(stderr, startKey, endKey) {
  const spans = [];
  let start = null;
  for (const line of String(stderr).split('\n')) {
    const startMatch = line.match(new RegExp(`${startKey}:\\s*([0-9.]+)`));
    if (startMatch) start = Number(startMatch[1]);
    const endMatch = line.match(new RegExp(`${endKey}:\\s*([0-9.]+)`));
    if (endMatch && start !== null) {
      const end = Number(endMatch[1]);
      if (end > start) spans.push([Number(start.toFixed(3)), Number(end.toFixed(3))]);
      start = null;
    }
  }
  if (start !== null) spans.push([Number(start.toFixed(3)), null]);
  return spans;
}

async function computeAssetAnalysis(asset) {
  const filePath = assetFilePath(asset);
  if (!filePath) return null;
  const isVideo = asset.kind === 'video' || (asset.kind === 'image' && asset.width > 0);
  const sceneCuts = [];
  const silences = [];
  const blankSpans = [];
  const staticSpans = [];
  let contentBox = null;
  let loudness;

  if (isVideo && asset.kind === 'video') {
    try {
      const { stderr } = await execFileP('ffmpeg', [
        '-hide_banner', '-loglevel', 'info', '-i', filePath,
        '-vf', "select='gt(scene,0.30)',showinfo", '-an', '-f', 'null', '-'
      ], { timeout: 90000 });
      for (const match of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
        const time = Number(match[1]);
        if (Number.isFinite(time) && (!sceneCuts.length || time - sceneCuts[sceneCuts.length - 1] > 0.08)) sceneCuts.push(Number(time.toFixed(3)));
      }
    } catch {}
    try {
      const { stderr } = await execFileP('ffmpeg', [
        '-hide_banner', '-loglevel', 'info', '-i', filePath,
        '-vf', 'blackdetect=d=0.3:pix_th=0.10', '-an', '-f', 'null', '-'
      ], { timeout: 90000 });
      for (const [start, end] of parsePairs(stderr, 'black_start', 'black_end')) if (end !== null) blankSpans.push([start, end]);
    } catch {}
    try {
      const { stderr } = await execFileP('ffmpeg', [
        '-hide_banner', '-loglevel', 'info', '-i', filePath,
        '-vf', 'freezedetect=n=0.003:d=0.6', '-an', '-f', 'null', '-'
      ], { timeout: 90000 });
      for (const [start, end] of parsePairs(stderr, 'freeze_start', 'freeze_end')) if (end !== null) staticSpans.push([start, end]);
    } catch {}
    try {
      const { stderr } = await execFileP('ffmpeg', [
        '-hide_banner', '-loglevel', 'info', '-i', filePath,
        '-vf', 'cropdetect=24:2:0', '-an', '-f', 'null', '-'
      ], { timeout: 90000 });
      const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
      const last = matches[matches.length - 1];
      if (last) {
        const width = Number(last[1]);
        const height = Number(last[2]);
        const x = Number(last[3]);
        const y = Number(last[4]);
        if (width > 0 && height > 0 && (width < asset.width - 2 || height < asset.height - 2 || x > 0 || y > 0)) {
          contentBox = { x, y, width, height };
        }
      }
    } catch {}
  }

  if (asset.kind !== 'image') {
    try {
      const { stderr } = await execFileP('ffmpeg', [
        '-hide_banner', '-loglevel', 'info', '-i', filePath,
        '-af', 'silencedetect=noise=-35dB:d=0.6', '-f', 'null', '-'
      ], { timeout: 90000 });
      for (const [start, end] of parsePairs(stderr, 'silence_start', 'silence_end')) if (end !== null) silences.push([start, end]);
    } catch {}
    try {
      const { stderr } = await execFileP('ffmpeg', [
        '-hide_banner', '-loglevel', 'info', '-i', filePath,
        '-af', 'volumedetect', '-f', 'null', '-'
      ], { timeout: 90000 });
      const mean = stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/);
      const peak = stderr.match(/max_volume:\s*(-?[0-9.]+) dB/);
      if (mean && peak) loudness = { meanDb: Number(mean[1]), peakDb: Number(peak[1]) };
    } catch {}
  }

  return {
    sceneCuts,
    silences,
    loudness,
    blankSpans,
    staticSpans,
    screenRecording: Boolean(contentBox || blankSpans.length || staticSpans.length),
    contentBox,
    computedAt: new Date().toISOString()
  };
}

async function ensureAssetAnalysis(asset, force = false) {
  if (!asset) return null;
  if (asset.analysis && !force) return asset.analysis;
  if (analysisJobs.has(asset.id)) return analysisJobs.get(asset.id);
  const job = computeAssetAnalysis(asset).then(async (analysis) => {
    if (analysis) {
      asset.analysis = analysis;
      await saveAssets(assets);
    }
    return analysis;
  }).finally(() => analysisJobs.delete(asset.id));
  analysisJobs.set(asset.id, job);
  return job;
}

function projectVisualClipAt(project, time) {
  const hidden = new Set((project.tracks || []).filter((track) => track.hidden).map((track) => track.id));
  const rank = { video: 0, overlay: 1 };
  return (project.clips || [])
    .filter((clip) => (clip.kind === 'video' || clip.kind === 'image')
      && !hidden.has(clip.trackId)
      && time >= clip.start
      && time < clip.start + clip.duration)
    .sort((a, b) => {
      const trackA = project.tracks?.find((track) => track.id === a.trackId);
      const trackB = project.tracks?.find((track) => track.id === b.trackId);
      return (rank[trackA?.kind] ?? 0) - (rank[trackB?.kind] ?? 0);
    })
    .pop();
}

function frameHash(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 20);
}

async function renderAssetFrame(asset, at = 1, width = 960) {
  const filePath = assetFilePath(asset);
  if (!filePath) throw new Error('Asset file not found on disk');
  const outWidth = Math.max(160, Math.min(1920, Math.round(width)));
  const sourceRatio = asset.width && asset.height ? asset.height / asset.width : 9 / 16;
  const outHeight = Math.max(90, Math.round((outWidth * sourceRatio) / 2) * 2);
  const crop = asset.analysis?.contentBox;
  const filter = crop
    ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`
    : `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`;
  const hash = frameHash(asset.id, at, outWidth, outHeight, JSON.stringify(crop || null));
  const dest = path.join(frameDir, `${hash}.jpg`);
  if (!fs.existsSync(dest)) {
    const seek = asset.kind === 'image' ? [] : ['-ss', String(Math.max(0, Math.min(asset.duration || 0, at)))];
    await execFileP('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', ...seek, '-i', filePath,
      '-frames:v', '1', '-vf', filter, '-q:v', '3', dest
    ], { timeout: 45000 });
  }
  return dest;
}

async function renderTimelineFrame(project, at, width = 960) {
  const outWidth = Math.max(160, Math.min(1920, Math.round(width)));
  const outHeight = Math.max(90, Math.round((outWidth * project.height / Math.max(1, project.width)) / 2) * 2);
  const clip = projectVisualClipAt(project, at);
  const asset = clip?.assetId ? assets.find((item) => item.id === clip.assetId) : null;
  const hash = frameHash(project.id, at, outWidth, outHeight, clip?.id || 'blank', JSON.stringify(clip?.crop || null));
  const dest = path.join(frameDir, `${hash}.jpg`);
  if (fs.existsSync(dest)) return dest;
  if (!asset) {
    await execFileP('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=c=black:s=${outWidth}x${outHeight}`,
      '-frames:v', '1', '-q:v', '3', dest
    ], { timeout: 45000 });
    return dest;
  }
  const filePath = assetFilePath(asset);
  if (!filePath) throw new Error('Clip asset file not found on disk');
  const local = Math.max(0, Math.min(clip.duration, at - clip.start));
  const sourceTime = Math.max(0, Math.min(asset.duration || 0, clip.trimIn + local * (clip.speed || 1)));
  const crop = clip.crop && asset.width && asset.height
    ? {
        x: Math.max(0, Math.min(asset.width - 1, clip.crop.x)),
        y: Math.max(0, Math.min(asset.height - 1, clip.crop.y)),
        width: Math.max(1, Math.min(asset.width - clip.crop.x, clip.crop.width)),
        height: Math.max(1, Math.min(asset.height - clip.crop.y, clip.crop.height))
      }
    : null;
  const filter = crop
    ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`
    : `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`;
  const seek = asset.kind === 'image' ? [] : ['-ss', String(sourceTime)];
  await execFileP('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', ...seek, '-i', filePath,
    '-frames:v', '1', '-vf', filter, '-q:v', '3', dest
  ], { timeout: 45000 });
  return dest;
}

async function renderContactSheet(project, from, to, step, width = 480) {
  const start = Math.max(0, Number(from) || 0);
  const end = Math.min(projectDuration(project), Math.max(start + 0.1, Number(to) || projectDuration(project)));
  const safeStep = Math.max(0.2, Number(step) || (end - start) / 12);
  const times = [];
  for (let time = start; time <= end + 0.001 && times.length < 24; time += safeStep) times.push(Number(time.toFixed(3)));
  if (!times.length) times.push(start);
  const dir = await fsp.mkdtemp(path.join(frameDir, 'sheet-'));
  try {
    for (let index = 0; index < times.length; index += 1) {
      const frame = await renderTimelineFrame(project, times[index], width);
      await fsp.copyFile(frame, path.join(dir, `frame-${String(index).padStart(3, '0')}.jpg`));
    }
    const columns = Math.min(4, times.length);
    const rows = Math.ceil(times.length / columns);
    const dest = path.join(frameDir, `${frameHash(project.id, start, end, safeStep, width, project.updatedAt)}.jpg`);
    await execFileP('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-pattern_type', 'glob', '-i', path.join(dir, 'frame-*.jpg'),
      '-vf', `tile=${columns}x${rows}:padding=4:margin=4:color=black`,
      '-frames:v', '1', '-q:v', '3', dest
    ], { timeout: 90000 });
    return dest;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderTimelineProxy(project, { from = 0, to = projectDuration(project), width = 480, fps = 2 } = {}) {
  const start = Math.max(0, Number(from) || 0);
  const end = Math.min(projectDuration(project), Math.max(start + 0.1, Number(to) || projectDuration(project)));
  const safeFps = Math.max(1, Math.min(6, Number(fps) || 2));
  const safeWidth = Math.max(160, Math.min(1280, Number(width) || 480));
  const frameCount = Math.min(180, Math.max(1, Math.round((end - start) * safeFps)));
  const dir = await fsp.mkdtemp(path.join(frameDir, 'proxy-'));
  const name = `agent-proxy-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.mp4`;
  const output = path.join(exportDir, name);
  try {
    for (let index = 0; index < frameCount; index += 1) {
      const time = start + index / safeFps;
      const frame = await renderTimelineFrame(project, time, safeWidth);
      await fsp.copyFile(frame, path.join(dir, `frame-${String(index).padStart(4, '0')}.jpg`));
    }
    await execFileP('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(safeFps), '-i', path.join(dir, 'frame-%04d.jpg'),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', output
    ], { timeout: 5 * 60 * 1000 });
    const stat = await fsp.stat(output);
    return {
      ok: true,
      url: `/exports/${name}`,
      filename: name,
      size: stat.size,
      width: safeWidth,
      height: Math.max(90, Math.round((safeWidth * project.height / Math.max(1, project.width)) / 2) * 2),
      fps: safeFps,
      from: start,
      to: end,
      frames: frameCount,
      caveat: 'Preview proxy renders the top visible video/image layer with crop. Text, stickers, transitions, effects and audio are not composited. Use the editor export for delivery.'
    };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function projectDuration(project) {

  return Math.max(0.1, ...(project.clips || []).map((clip) => clip.start + clip.duration));
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
    version: '1.14.0',
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
    version: '1.14.0',
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
    frames: true,
    contactSheets: true,
    assetAnalysis: true,
    proxyRender: true,
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
    activity: { active: false, label: '', updatedAt: Date.now() },
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
  res.json({ id: session.id, revision: session.revision, project: session.project, expiresAt: session.expiresAt, activity: session.activity });
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
    activity: session.activity,
    proposals: [...session.proposals.values()].map(({ id, rationale, diff, createdAt }) => ({ id, rationale, diff, createdAt }))
  });
});

app.delete('/api/agent/sessions/:id', (req, res) => {
  const session = agentSessions.get(req.params.id);
  if (!session || !requireAgentToken(req, res, session)) return;
  agentSessions.delete(req.params.id);
  res.json({ ok: true });
});

app.post('/api/agent/sessions/:id/activity', (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  session.activity = {
    active: req.body?.active === true,
    label: typeof req.body?.label === 'string' ? req.body.label.slice(0, 120) : '',
    updatedAt: Date.now()
  };
  session.expiresAt = Date.now() + AGENT_SESSION_TTL;
  res.json({ ok: true, activity: session.activity });
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

app.get('/api/tiktok/capabilities', (req, res) => {
  const binary = findYtDlp();
  res.json({ available: Boolean(binary), provider: 'TikTok', extractor: binary ? 'bundled yt-dlp' : null });
});

app.post('/api/tiktok/import', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!isTikTokUrl(url)) return res.status(400).json({ error: 'Paste a TikTok video URL', code: 'invalid-url' });
  if (req.body?.confirmed !== true) return res.status(428).json({ error: 'Confirm that you have the rights to use this audio', code: 'consent-required' });
  const binary = findYtDlp();
  if (!binary) return res.status(503).json({ error: 'The bundled TikTok extractor is missing. Reinstall LumaCut or set LUMACUT_YTDLP.', code: 'yt-dlp-missing' });
  if (tiktokBusy) return res.status(429).json({ error: 'Another TikTok extraction is running', code: 'busy' });
  tiktokBusy = true;
  const tempDir = await fsp.mkdtemp(path.join(mediaDir, 'tiktok-'));
  try {
    const outputTemplate = path.join(tempDir, 'source.%(ext)s');
    const args = [
      '--no-playlist', '--no-warnings', '--no-progress', '--no-mtime',
      '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0',
      '--restrict-filenames', '--max-filesize', '80M', '--force-overwrites',
      '--print-json', '-o', outputTemplate, url
    ];
    const { stdout } = await execFileP(binary, args, { timeout: 180000, maxBuffer: 1024 * 1024 * 8 });
    let metadata = null;
    for (const line of String(stdout).split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      try { metadata = JSON.parse(line); } catch {}
    }
    if (metadata?._type === 'playlist') throw new Error('Playlists are not supported; paste a single TikTok video URL');
    const files = await fsp.readdir(tempDir);
    const audioFile = files.find((name) => /\.(mp3|m4a|aac|wav|opus)$/i.test(name));
    if (!audioFile) throw new Error('The TikTok extractor did not produce an audio file');
    const sourcePath = path.join(tempDir, audioFile);
    const info = await probe(sourcePath);
    if (!info.hasAudio) throw new Error('That TikTok video has no audio track');
    const title = String(metadata?.track || metadata?.title || 'TikTok audio').trim().slice(0, 100) || 'TikTok audio';
    const finalName = `tiktok-${Date.now()}-${slug(title)}-${crypto.randomBytes(3).toString('hex')}${path.extname(audioFile).toLowerCase()}`;
    const finalPath = path.join(mediaDir, finalName);
    await fsp.rename(sourcePath, finalPath);
    const uploader = String(metadata?.uploader || metadata?.creator || 'TikTok creator').slice(0, 100);
    const asset = {
      id: randomId('tiktok'),
      name: title,
      kind: 'audio',
      source: 'tiktok',
      provider: 'TikTok',
      url: `/media/${finalName}`,
      thumbnail: null,
      duration: info.duration,
      width: 0,
      height: 0,
      hasAudio: true,
      mime: info.mime || 'audio/mpeg',
      size: (await fsp.stat(finalPath)).size,
      createdAt: new Date().toISOString(),
      peaks: [],
      creator: uploader,
      creatorUrl: `https://www.tiktok.com/@${encodeURIComponent(uploader.replace(/^@/, ''))}`,
      sourceUrl: isTikTokUrl(metadata?.webpage_url) ? metadata.webpage_url : url,
      license: 'User-supplied TikTok audio',
      licenseUrl: 'https://www.tiktok.com/legal/page/us/terms-of-service/en',
      tags: String(metadata?.description || metadata?.title || '').slice(0, 500)
    };
    try { asset.thumbnail = await makeThumbnail(finalPath, 'audio', asset.id); } catch {}
    try { asset.peaks = await extractPeaks(finalPath, info.duration); } catch {}
    assets.push(asset);
    await saveAssets(assets);
    void ensureAssetAnalysis(asset).catch(() => {});
    res.status(201).json({
      asset,
      attribution: {
        text: 'Audio imported from TikTok',
        creator: uploader,
        url: asset.sourceUrl,
        license: asset.license,
        note: 'Only import audio you own or have permission to use.'
      }
    });
  } catch (error) {
    res.status(502).json({ error: 'TikTok audio extraction failed', detail: String(error?.stderr || error?.message || error).slice(-1500) });
  } finally {
    tiktokBusy = false;
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.get('/api/sounds/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const tags = String(req.query.tags || '').trim().slice(0, 200);
  const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
  const cacheKey = crypto.createHash('sha256').update(`los|${q}|${tags}|${limit}`).digest('hex');
  const cached = soundsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json({ ...cached.data, cached: true });
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (q) params.set('q', q);
    if (tags) params.set('tags', tags);
    const response = await fetch(`https://api.lotsofsounds.com/api/v1/sounds/sample?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    const bodyText = await response.text();
    if (!response.ok) return res.status(502).json({ error: 'Lots of Sounds search failed', detail: bodyText.slice(0, 500) });
    const data = JSON.parse(bodyText);
    const hits = (data.data || []).map((sound) => ({
      provider: 'Lots of Sounds',
      id: String(sound.id),
      name: String(sound.name || 'Sound effect'),
      description: String(sound.description || ''),
      tags: Array.isArray(sound.tags) ? sound.tags : [],
      duration: Number(sound.duration) || 0,
      previewUrl: `/api/sounds/stream/${encodeURIComponent(sound.id)}`,
      pageURL: 'https://www.lotsofsounds.com/',
      license: 'CC0 sample · Lots of Sounds',
      licenseUrl: 'https://www.lotsofsounds.com/license'
    }));
    const payload = {
      provider: 'Lots of Sounds',
      hits,
      pagination: data.pagination || null,
      attribution: {
        text: 'Sound effects from Lots of Sounds',
        url: 'https://www.lotsofsounds.com/',
        license: 'CC0 sample collection',
        licenseUrl: 'https://www.lotsofsounds.com/license'
      },
      note: data.meta?.message || ''
    };
    soundsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + SOUNDS_CACHE_TTL });
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: 'Lots of Sounds search failed', detail: String(error?.message || error) });
  }
});

app.get('/api/sounds/stream/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.lotsofsounds.com/api/v1/sounds/sample/${encodeURIComponent(req.params.id)}/stream`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) return res.status(502).json({ error: 'Could not resolve the sound preview' });
    const data = await response.json();
    const stream = String(data?.data?.stream_url || '');
    let parsed;
    try { parsed = new URL(stream); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'files.lotsofsounds.com') {
      return res.status(502).json({ error: 'Lots of Sounds returned an unsupported stream URL' });
    }
    res.redirect(302, stream);
  } catch (error) {
    res.status(502).json({ error: 'Could not resolve the sound preview', detail: String(error?.message || error) });
  }
});

app.post('/api/sounds/import', async (req, res) => {
  const id = String(req.body?.id || '').trim();
  if (!/^[a-z0-9-]{2,64}$/i.test(id)) return res.status(400).json({ error: 'Invalid sound ID' });
  try {
    const streamResponse = await fetch(`https://api.lotsofsounds.com/api/v1/sounds/sample/${encodeURIComponent(id)}/stream`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000)
    });
    if (!streamResponse.ok) return res.status(502).json({ error: 'Could not resolve the sound download' });
    const streamData = await streamResponse.json();
    const stream = String(streamData?.data?.stream_url || '');
    let parsed;
    try { parsed = new URL(stream); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'files.lotsofsounds.com') {
      return res.status(502).json({ error: 'Lots of Sounds returned an unsupported media URL' });
    }
    const response = await fetch(stream, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    if (Number(response.headers.get('content-length') || 0) > 80 * 1024 * 1024) throw new Error('Sound file is larger than 80 MB');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 80 * 1024 * 1024) throw new Error('Sound file is larger than 80 MB');
    const title = String(req.body?.name || streamData?.data?.name || 'Lots of Sounds effect').trim().slice(0, 100) || 'Lots of Sounds effect';
    const finalFile = path.join(mediaDir, `lotsofsounds-${Date.now()}-${slug(title)}-${crypto.randomBytes(3).toString('hex')}.mp3`);
    await fsp.writeFile(finalFile, buffer);
    const info = await probe(finalFile);
    const asset = {
      id: randomId('sound'),
      name: title,
      kind: 'audio',
      source: 'lots-of-sounds',
      provider: 'Lots of Sounds',
      url: `/media/${path.basename(finalFile)}`,
      thumbnail: null,
      duration: info.duration,
      width: 0,
      height: 0,
      hasAudio: true,
      mime: info.mime || 'audio/mpeg',
      size: buffer.length,
      createdAt: new Date().toISOString(),
      peaks: [],
      creator: 'Lots of Sounds',
      creatorUrl: 'https://www.lotsofsounds.com/',
      sourceUrl: 'https://www.lotsofsounds.com/',
      license: 'CC0 sample · Lots of Sounds',
      licenseUrl: 'https://www.lotsofsounds.com/license',
      tags: String(req.body?.description || '').slice(0, 500)
    };
    try { asset.thumbnail = await makeThumbnail(finalFile, 'audio', asset.id); } catch {}
    try { asset.peaks = await extractPeaks(finalFile, info.duration); } catch {}
    assets.push(asset);
    await saveAssets(assets);
    void ensureAssetAnalysis(asset).catch(() => {});
    res.status(201).json({ asset, attribution: { text: 'Sound effect from Lots of Sounds', url: asset.sourceUrl, license: asset.license } });
  } catch (error) {
    res.status(502).json({ error: 'Lots of Sounds import failed', detail: String(error?.message || error) });
  }
});

app.get('/api/pixabay/search', async (req, res) => {
  const key = pixabayKey(req);
  if (!key) return res.status(400).json({ error: 'Pixabay API key required', code: 'missing-key', docs: 'https://pixabay.com/api/docs/' });
  const type = req.query.type === 'video' ? 'video' : 'image';
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
  const perPage = Math.max(3, Math.min(24, Number(req.query.per_page) || 12));
  const endpoint = type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
  const params = new URLSearchParams({
    key,
    q,
    lang: 'en',
    safesearch: 'true',
    order: req.query.order === 'latest' ? 'latest' : 'popular',
    page: String(page),
    per_page: String(perPage)
  });
  if (req.query.orientation === 'horizontal' || req.query.orientation === 'vertical') params.set('orientation', req.query.orientation);
  if (type === 'image' && req.query.category) params.set('category', String(req.query.category));
  const cacheKey = pixabayCacheKey(key, endpoint, params);
  const cached = pixabayCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json({ ...cached.data, cached: true });
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const bodyText = await response.text();
    if (!response.ok) {
      let message = bodyText || response.statusText;
      try { message = JSON.parse(bodyText)?.error || message; } catch {}
      return res.status(response.status === 429 ? 429 : response.status === 401 ? 401 : 502).json({ error: message, code: 'pixabay-error' });
    }
    const data = JSON.parse(bodyText);
    const hits = (data.hits || []).map((hit) => normalizePixabayHit(hit, type)).filter(Boolean);
    const payload = {
      provider: 'Pixabay',
      total: Number(data.total) || 0,
      totalHits: Number(data.totalHits) || 0,
      page,
      perPage,
      hits,
      attribution: {
        text: 'Photos and videos from Pixabay',
        url: 'https://pixabay.com/',
        license: 'Pixabay Content License',
        licenseUrl: 'https://pixabay.com/service/license-summary/'
      },
      rateLimit: {
        limit: response.headers.get('x-ratelimit-limit'),
        remaining: response.headers.get('x-ratelimit-remaining'),
        reset: response.headers.get('x-ratelimit-reset')
      }
    };
    pixabayCache.set(cacheKey, { data: payload, expiresAt: Date.now() + PIXABAY_CACHE_TTL });
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: 'Pixabay search failed', detail: String(error?.message || error) });
  }
});

app.post('/api/pixabay/import', async (req, res) => {
  const key = pixabayKey(req);
  if (!key) return res.status(400).json({ error: 'Pixabay API key required', code: 'missing-key' });
  const downloadUrl = String(req.body?.downloadUrl || '');
  const pageURL = String(req.body?.pageURL || '');
  if (!pixabayAllowed(downloadUrl)) return res.status(400).json({ error: 'Unsupported Pixabay media URL' });
  if (pageURL && !pixabayAllowed(pageURL, 'page')) return res.status(400).json({ error: 'Unsupported Pixabay page URL' });
  const type = req.body?.type === 'video' ? 'video' : 'image';
  const title = String(req.body?.title || 'Pixabay media').trim().slice(0, 100) || 'Pixabay media';
  const tempFile = path.join(mediaDir, `pixabay-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.part`);
  try {
    const response = await fetch(downloadUrl, { headers: { Accept: type === 'video' ? 'video/*' : 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    if (!pixabayAllowed(response.url || downloadUrl)) throw new Error('Pixabay media redirected to an unsupported host');
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 600 * 1024 * 1024) throw new Error('Pixabay file is larger than 600 MB');
    const contentType = response.headers.get('content-type') || '';
    const ext = type === 'video' ? '.mp4' : '.jpg';
    const finalFile = path.join(mediaDir, `pixabay-${Date.now()}-${slug(title)}-${crypto.randomBytes(3).toString('hex')}${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 600 * 1024 * 1024) throw new Error('Pixabay file is larger than 600 MB');
    await fsp.writeFile(tempFile, buffer);
    await fsp.rename(tempFile, finalFile);
    const info = await probe(finalFile);
    const kind = type === 'video' ? 'video' : 'image';
    const id = randomId('pixabay');
    const asset = {
      id,
      name: title,
      kind,
      source: 'pixabay',
      provider: 'Pixabay',
      url: `/media/${path.basename(finalFile)}`,
      thumbnail: null,
      duration: kind === 'image' ? 0 : info.duration,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
      mime: info.mime || contentType,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      peaks: [],
      creator: String(req.body?.creator || 'Pixabay contributor').slice(0, 100),
      creatorUrl: String(req.body?.creatorUrl || 'https://pixabay.com/').slice(0, 300),
      sourceUrl: pageURL || 'https://pixabay.com/',
      license: 'Pixabay Content License',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
      tags: String(req.body?.tags || '').slice(0, 500)
    };
    try { asset.thumbnail = await makeThumbnail(finalFile, kind, id); } catch {}
    if (kind === 'audio' || (kind === 'video' && info.hasAudio)) {
      try { asset.peaks = await extractPeaks(finalFile, info.duration); } catch {}
    }
    assets.push(asset);
    await saveAssets(assets);
    void ensureAssetAnalysis(asset).catch(() => {});
    res.status(201).json({ asset, attribution: { text: 'Photo or video from Pixabay', url: asset.sourceUrl, license: asset.license } });
  } catch (error) {
    try { await fsp.unlink(tempFile); } catch {}
    res.status(502).json({ error: 'Pixabay import failed', detail: String(error?.message || error) });
  }
});

app.get('/api/assets', (req, res) => {

  const sorted = assets.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (req.query.lean === '1') {
    return res.json(sorted.map(({ peaks, analysis, ...asset }) => ({ ...asset, analysisReady: Boolean(analysis) })));
  }
  res.json(sorted);
});

app.get('/api/assets/:id/analysis', async (req, res) => {
  const asset = assets.find((item) => item.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  try {
    const force = req.query.refresh === '1';
    const analysis = await ensureAssetAnalysis(asset, force);
    if (!analysis) return res.status(422).json({ error: 'Analysis requires a media file on disk' });
    res.json({ assetId: asset.id, ...analysis });
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed', detail: String(error?.message || error) });
  }
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

app.post('/api/agent/sessions/:id/proxy', async (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  try {
    const proxy = await renderTimelineProxy(session.project, {
      from: req.body?.from,
      to: req.body?.to,
      width: req.body?.width,
      fps: req.body?.fps
    });
    res.json(proxy);
  } catch (error) {
    res.status(500).json({ error: 'Proxy render failed', detail: String(error?.message || error) });
  }
});

app.get('/api/assets/:id/frame', async (req, res) => {
  const asset = assets.find((item) => item.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  try {
    const frame = await renderAssetFrame(asset, Number(req.query.at) || 0, Number(req.query.w) || 960);
    res.type('image/jpeg').sendFile(frame);
  } catch (error) {
    res.status(500).json({ error: 'Frame render failed', detail: String(error?.message || error) });
  }
});

app.get('/api/agent/sessions/:id/frame', async (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  try {
    const frame = await renderTimelineFrame(session.project, Math.max(0, Number(req.query.at) || 0), Number(req.query.w) || 960);
    res.type('image/jpeg').sendFile(frame);
  } catch (error) {
    res.status(500).json({ error: 'Frame render failed', detail: String(error?.message || error) });
  }
});

app.get('/api/agent/sessions/:id/sheet', async (req, res) => {
  const session = agentSession(req, res);
  if (!session) return;
  try {
    const from = req.query.from === undefined ? 0 : Number(req.query.from);
    const to = req.query.to === undefined ? projectDuration(session.project) : Number(req.query.to);
    const step = req.query.step === undefined ? (to - from) / 12 : Number(req.query.step);
    const sheet = await renderContactSheet(session.project, from, to, step, Number(req.query.w) || 480);
    res.type('image/jpeg').sendFile(sheet);
  } catch (error) {
    res.status(500).json({ error: 'Contact sheet failed', detail: String(error?.message || error) });
  }
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
      void ensureAssetAnalysis(asset).catch(() => {});
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
  if (asset.source !== 'demo') {
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

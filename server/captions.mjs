import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VAD = {
  fileName: 'ggml-silero-v6.2.0.bin',
  size: 885098,
  sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'
};

export const MODELS = [
  {
    id: 'large-v3-turbo-q5_0',
    label: 'Whisper large-v3-turbo',
    quality: 'accurate',
    description: 'Best multilingual accuracy. 547 MiB download.',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    size: 574041195,
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
  },
  {
    id: 'small',
    label: 'Whisper small',
    quality: 'fast',
    description: 'Faster and smaller. 466 MiB download.',
    fileName: 'ggml-small.bin',
    size: 487601967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  }
];

const MODELS_BY_ID = new Map(MODELS.map((model) => [model.id, model]));
const jobs = new Map();
let activeJobId = null;

function execFileP(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 32, ...opts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function findRuntime(root) {
  const bases = [];
  if (process.env.LUMACUT_WHISPER_DIR) bases.push(path.resolve(process.env.LUMACUT_WHISPER_DIR));
  if (process.resourcesPath) bases.push(path.join(process.resourcesPath, 'whisper'));
  bases.push(path.join(root, 'vendor', 'whisper'));

  for (const base of bases) {
    const vulkan = path.join(base, 'vulkan', 'whisper-cli');
    const cpu = path.join(base, 'cpu', 'whisper-cli');
    const libDir = path.join(base, 'vulkan', 'lib');
    const hasVulkan = fs.existsSync(vulkan);
    const hasCpu = fs.existsSync(cpu);
    if (hasVulkan || hasCpu) {
      return {
        base,
        vulkan: hasVulkan ? vulkan : null,
        cpu: hasCpu ? cpu : null,
        libDir: fs.existsSync(libDir) ? libDir : null,
        version: '1.9.5'
      };
    }
  }
  return { base: null, vulkan: null, cpu: null, libDir: null, version: null };
}

function modelPaths(dataRoot) {
  const dir = path.join(dataRoot, 'models');
  return {
    dir,
    model: (model) => path.join(dir, model.fileName),
    vad: path.join(dir, VAD.fileName)
  };
}

async function downloadToFile(url, destination, expectedSize, expectedSha, { onProgress, signal } = {}) {
  const part = `${destination}.part`;
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const response = await fetch(url, { redirect: 'follow', signal });
  if (!response.ok || !response.body) throw new Error(`Model download failed: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || expectedSize || 0;
  let received = 0;
  const hash = crypto.createHash('sha256');
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      hash.update(chunk);
      onProgress?.(total ? Math.min(1, received / total) : 0, received, total);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(part), { signal });
    const digest = hash.digest('hex');
    if (expectedSha && digest !== expectedSha) {
      await fsp.unlink(part).catch(() => {});
      throw new Error('Downloaded model failed its checksum. Please retry.');
    }
    const stat = await fsp.stat(part);
    if (expectedSize && stat.size !== expectedSize) {
      await fsp.unlink(part).catch(() => {});
      throw new Error('Downloaded model has an unexpected size. Please retry.');
    }
    await fsp.rename(part, destination);
    return destination;
  } catch (error) {
    await fsp.unlink(part).catch(() => {});
    throw error;
  }
}

async function ensureFile(meta, destination, { onProgress, signal } = {}) {
  if (fs.existsSync(destination)) {
    const stat = await fsp.stat(destination);
    if (!meta.size || stat.size === meta.size) return destination;
    await fsp.unlink(destination).catch(() => {});
  }
  return downloadToFile(meta.url, destination, meta.size, meta.sha256, { onProgress, signal });
}

function atempoFilters(speed) {
  const value = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const filters = [];
  if (Math.abs(value - 1) < 0.001) return filters;
  let remaining = value;
  while (remaining > 2) { filters.push('atempo=2.0'); remaining /= 2; }
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters;
}

function sourcePathFor(asset, mediaDir, publicDir) {
  if (!asset?.url) return null;
  if (asset.source === 'demo' || asset.url.startsWith('/demo/')) {
    return path.join(publicDir, asset.url.replace(/^\//, ''));
  }
  return path.join(mediaDir, asset.url.replace(/^\/media\//, ''));
}

async function buildAudioMix(project, { clipId, dataRoot, mediaDir, publicDir, getAssets, jobDir, signal }) {
  const assets = getAssets();
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const trackById = new Map((project.tracks || []).map((track) => [track.id, track]));
  const soloActive = (project.tracks || []).some((track) => track.solo);
  const clips = (project.clips || []).filter((clip) => {
    if (clipId && clip.id !== clipId) return false;
    if (!clip.assetId) return false;
    if (clip.kind !== 'audio' && clip.kind !== 'video') return false;
    const asset = assetById.get(clip.assetId);
    if (!asset) return false;
    if (clip.kind === 'video' && !asset.hasAudio) return false;
    const track = trackById.get(clip.trackId);
    if (track?.muted) return false;
    if (soloActive && !track?.solo) return false;
    return true;
  });

  if (!clips.length) {
    throw new Error('No audio clips were found. Add a voiceover, video with audio, or an audio clip first.');
  }

  const inputPaths = [];
  const filters = [];
  let inputIndex = 0;
  for (const clip of clips) {
    const asset = assetById.get(clip.assetId);
    const source = sourcePathFor(asset, mediaDir, publicDir);
    if (!source || !fs.existsSync(source)) continue;
    const track = trackById.get(clip.trackId);
    const speed = Math.max(0.25, Math.min(4, Number(clip.speed) || 1));
    const trimIn = Math.max(0, Number(clip.trimIn) || 0);
    const timelineDuration = Math.max(0.1, Number(clip.duration) || 0);
    const sourceDuration = Math.max(0.1, Math.min(timelineDuration * speed, asset.duration ? asset.duration - trimIn : timelineDuration * speed));
    const volume = Math.max(0, Math.min(4, (Number(clip.volume) || 1) * (Number(track?.gain) || 1)));
    const chain = [`atrim=start=${trimIn.toFixed(4)}:duration=${sourceDuration.toFixed(4)}`, 'asetpts=PTS-STARTPTS'];
    chain.push(...atempoFilters(speed));
    chain.push(`volume=${volume.toFixed(4)}`);
    const fadeIn = Math.max(0, Math.min(timelineDuration, Number(clip.audioFadeIn) || 0));
    const fadeOut = Math.max(0, Math.min(timelineDuration, Number(clip.audioFadeOut) || 0));
    if (fadeIn > 0.01) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
    if (fadeOut > 0.01) chain.push(`afade=t=out:st=${Math.max(0, timelineDuration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
    const delay = Math.max(0, Math.round((Number(clip.start) || 0) * 1000));
    if (delay > 0) chain.push(`adelay=${delay}:all=1`);
    filters.push(`[${inputIndex}:a]${chain.join(',')}[a${inputIndex}]`);
    inputPaths.push(source);
    inputIndex += 1;
  }

  if (!inputPaths.length) throw new Error('No usable audio sources were found for this project.');

  const mix = inputIndex === 1
    ? '[a0]highpass=f=80,aresample=16000[aout]'
    : `${Array.from({ length: inputIndex }, (_, index) => `[a${index}]`).join('')}amix=inputs=${inputIndex}:normalize=0:dropout_transition=0,highpass=f=80,aresample=16000[aout]`;
  const filterComplex = `${filters.join(';')};${mix}`;
  const output = path.join(jobDir, 'speech.wav');
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const input of inputPaths) args.push('-i', input);
  args.push('-filter_complex', filterComplex, '-map', '[aout]', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output);
  await execFileP('ffmpeg', args, { timeout: 15 * 60 * 1000, signal });
  return { path: output, clips: inputPaths.length, duration: project.clips.reduce((max, clip) => Math.max(max, (Number(clip.start) || 0) + (Number(clip.duration) || 0)), 0) };
}

function cleanCueText(text) {
  return String(text || '')
    .replace(/\[_[A-Z0-9_]+\]/g, '')
    .replace(/\[[A-Z ]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCues(json) {
  const cues = [];
  const segments = Array.isArray(json?.transcription) ? json.transcription : [];
  for (const segment of segments) {
    const rawTokens = (segment.tokens || []).filter((token) => {
      const raw = String(token.text || '');
      const text = raw.trim();
      if (!raw || /^\[_\[A-Z0-9_\]+\]$/.test(text) || /^\[[A-Z ]+\]$/.test(text)) return false;
      const start = Number(token.offsets?.from);
      const end = Number(token.offsets?.to);
      return Number.isFinite(start) && Number.isFinite(end) && end >= start;
    });
    // whisper.cpp with VAD reports segment times on the original timeline but
    // token offsets on the reduced (silence-removed) timeline. Map tokens back
    // across the segment so cue timings stay aligned with the source.
    const firstToken = rawTokens.length ? Number(rawTokens[0].offsets.from) : 0;
    const lastToken = rawTokens.length ? Math.max(...rawTokens.map((token) => Number(token.offsets.to))) : 0;
    const segmentStart = Number(segment.offsets?.from) || 0;
    const segmentEnd = Number(segment.offsets?.to) || segmentStart;
    const scale = lastToken > firstToken ? (segmentEnd - segmentStart) / (lastToken - firstToken) : 1;
    const words = [];
    for (const token of rawTokens) {
      const raw = String(token.text || '');
      const text = raw.trim();
      const start = segmentStart + (Number(token.offsets.from) - firstToken) * scale;
      const end = segmentStart + (Number(token.offsets.to) - firstToken) * scale;
      words.push({ text: raw, display: text, start: start / 1000, end: end / 1000, p: Number(token.p) || 0.75 });
    }

    if (!words.length) {
      const text = cleanCueText(segment.text);
      const start = Number(segment.offsets?.from) / 1000;
      const end = Number(segment.offsets?.to) / 1000;
      if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) {
        cues.push({ start, end, text, confidence: 0.72 });
      }
      continue;
    }

    let current = null;
    const flush = () => {
      if (!current) return;
      const text = cleanCueText(current.words.map((word) => word.text).join(''));
      if (text) {
        cues.push({
          start: current.words[0].start,
          end: current.words[current.words.length - 1].end,
          text,
          confidence: current.words.reduce((sum, word) => sum + word.p, 0) / current.words.length
        });
      }
      current = null;
    };

    for (const word of words) {
      const projected = current ? `${current.text}${word.text}` : word.text;
      const gap = current ? word.start - current.end : 0;
      const tooLong = current && (projected.length > 42 || word.end - current.start > 6 || gap > 0.85);
      if (tooLong) flush();
      if (!current) current = { words: [], text: '', start: word.start, end: word.end };
      current.words.push(word);
      current.text = current.text ? `${current.text}${word.text}` : word.text;
      current.end = word.end;
      if (/[.!?]$/.test(word.display) || (/[,;:]$/.test(word.display) && current.text.length >= 24)) flush();
    }
    flush();
  }

  return cues
    .filter((cue) => cue.text && cue.end > cue.start)
    .map((cue) => ({ ...cue, start: Number(cue.start.toFixed(3)), end: Number(cue.end.toFixed(3)), confidence: Number(cue.confidence.toFixed(3)) }))
    .slice(0, 1000);
}

function parseWhisperProgress(line) {
  const match = line.match(/progress\s*=\s*(\d+)%/);
  return match ? Number(match[1]) : null;
}

function runWhisper({ runtime, modelPath, vadPath, audioPath, outPrefix, language, device, prompt, onProgress, signal, job }) {
  return new Promise((resolve, reject) => {
    const cpu = device === 'cpu' || (!runtime.vulkan);
    const binary = cpu ? (runtime.cpu || runtime.vulkan) : runtime.vulkan;
    if (!binary) { reject(new Error('whisper.cpp runtime is not installed.')); return; }
    const args = [
      '-m', modelPath, '-f', audioPath,
      '-ojf', '-of', outPrefix,
      '--vad', '-vm', vadPath,
      '-l', language || 'auto',
      '--beam-size', '5',
      '--suppress-nst',
      '--print-progress'
    ];
    if (cpu) args.push('-ng', '-t', String(Math.min(8, os.cpus().length || 4)));
    if (prompt) args.push('--prompt', String(prompt).slice(0, 500));
    const env = { ...process.env };
    if (runtime.libDir) env.LD_LIBRARY_PATH = `${runtime.libDir}${env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : ''}`;
    const child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    job.process = child;
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      job.process = null;
      if (error) reject(error); else resolve();
    };
    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(new Error('Transcription timed out.'));
    }, 30 * 60 * 1000);
    const onAbort = () => { try { child.kill('SIGKILL'); } catch {} };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        const progress = parseWhisperProgress(line);
        if (progress !== null) onProgress?.(progress / 100);
      }
      if (stderr.length > 300_000) stderr = stderr.slice(-150_000);
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (job.cancelled) return finish(new Error('Cancelled'));
      if (code !== 0) return finish(Object.assign(new Error('whisper.cpp failed'), { stderr, code }));
      finish();
    });
  });
}

export function createCaptionService({ root, dataRoot, mediaDir, publicDir, getAssets, hardware }) {
  const models = modelPaths(dataRoot);
  const runtime = findRuntime(root);

  function capabilities() {
    return {
      version: '1.0.0',
      runtime: {
        available: Boolean(runtime.vulkan || runtime.cpu),
        vulkan: Boolean(runtime.vulkan),
        cpu: Boolean(runtime.cpu || runtime.vulkan),
        version: runtime.version,
        path: runtime.vulkan || runtime.cpu
      },
      device: {
        detected: Boolean(hardware?.detected),
        label: hardware?.gpuNames?.[0] || null,
        preferred: runtime.vulkan ? 'AMD Vulkan' : 'CPU'
      },
      models: MODELS.map((model) => ({
        ...model,
        url: undefined,
        installed: fs.existsSync(models.model(model))
      })),
      vadInstalled: fs.existsSync(models.vad),
      activeJobId
    };
  }

  function publicJob(job) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      error: job.error || null,
      result: job.result || null,
      model: job.model,
      language: job.language,
      source: job.source,
      device: job.device,
      createdAt: job.createdAt
    };
  }

  async function runJob(job, project) {
    const controller = new AbortController();
    job.controller = controller;
    const jobDir = path.join(dataRoot, 'captions', 'tmp', job.id);
    job.jobDir = jobDir;
    try {
      job.status = 'preparing';
      job.progress = 3;
      job.message = 'Preparing audio mix';
      await fsp.mkdir(jobDir, { recursive: true });
      const mix = await buildAudioMix(project, {
        clipId: job.sourceClipId,
        dataRoot, mediaDir, publicDir, getAssets,
        jobDir, signal: controller.signal
      });
      job.audioPath = mix.path;

      job.status = 'downloading';
      job.progress = 10;
      const model = MODELS_BY_ID.get(job.model);
      job.message = fs.existsSync(models.model(model)) ? 'Loading model' : 'Downloading model';
      await ensureFile(model, models.model(model), {
        signal: controller.signal,
        onProgress: (fraction) => {
          job.progress = 10 + Math.round(fraction * 20);
          job.message = `Downloading model ${Math.round(fraction * 100)}%`;
        }
      });
      await ensureFile(VAD, models.vad, {
        signal: controller.signal,
        onProgress: () => { job.message = 'Downloading VAD model'; }
      });

      job.status = 'transcribing';
      job.progress = 35;
      job.message = job.device === 'cpu' ? 'Transcribing on CPU' : 'Transcribing on AMD GPU';
      const outPrefix = path.join(jobDir, 'transcript');
      const transcribe = (device) => runWhisper({
        runtime,
        modelPath: models.model(model),
        vadPath: models.vad,
        audioPath: mix.path,
        outPrefix,
        language: job.language,
        device,
        prompt: job.prompt,
        onProgress: (fraction) => {
          job.progress = 35 + Math.round(fraction * 58);
        },
        signal: controller.signal,
        job
      });
      try {
        await transcribe(job.device);
      } catch (error) {
        if (job.device === 'auto' && runtime.vulkan && !job.cancelled) {
          job.message = 'GPU transcription failed; retrying on CPU';
          job.progress = 35;
          await fsp.rm(`${outPrefix}.json`, { force: true }).catch(() => {});
          await transcribe('cpu');
          job.device = 'cpu';
        } else {
          throw error;
        }
      }
      if (job.cancelled) throw new Error('Cancelled');
      const jsonPath = `${outPrefix}.json`;
      if (!fs.existsSync(jsonPath)) throw new Error('whisper.cpp completed without a transcript.');
      const json = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
      job.status = 'parsing';
      job.progress = 96;
      job.message = 'Building caption cues';
      const cues = buildCues(json);
      if (!cues.length) throw new Error('No speech was detected in the selected audio.');
      job.result = {
        cues,
        language: json.result?.language || job.language,
        model: model.id,
        modelLabel: model.label,
        device: job.device === 'cpu' ? 'CPU' : 'AMD Vulkan',
        duration: mix.duration
      };
      job.status = 'done';
      job.progress = 100;
      job.message = `${cues.length} caption cue${cues.length === 1 ? '' : 's'} ready`;
    } catch (error) {
      if (job.cancelled) {
        job.status = 'cancelled';
        job.message = 'Cancelled';
      } else {
        job.status = 'error';
        job.error = String(error?.stderr || error?.message || error).slice(-4000);
        job.message = 'Caption generation failed';
      }
    } finally {
      job.process = null;
      if (jobDir) await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
      job.audioPath = null;
      job.controller = null;
      if (activeJobId === job.id) activeJobId = null;
    }
  }

  function startJob(body) {
    if (!body || typeof body.project !== 'object' || !Array.isArray(body.project.clips)) {
      const error = new Error('A project with clips is required.');
      error.statusCode = 400;
      throw error;
    }
    if (activeJobId) {
      const error = new Error('A caption job is already running.');
      error.statusCode = 429;
      throw error;
    }
    const model = MODELS_BY_ID.get(body.model) || MODELS[0];
    const language = /^[a-z]{2}$/.test(String(body.language || '')) ? String(body.language) : 'auto';
    const source = body.source === 'clip' ? 'clip' : 'mix';
    const clipId = source === 'clip' ? String(body.clipId || '') : null;
    if (source === 'clip' && !clipId) {
      const error = new Error('Select a clip to transcribe.');
      error.statusCode = 400;
      throw error;
    }
    const device = body.device === 'cpu' ? 'cpu' : 'auto';
    const id = crypto.randomBytes(8).toString('hex');
    const job = {
      id,
      status: 'queued',
      progress: 0,
      message: 'Queued',
      error: null,
      result: null,
      model: model.id,
      language,
      source,
      sourceClipId: clipId,
      device,
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
      createdAt: new Date().toISOString(),
      process: null,
      cancelled: false
    };
    jobs.set(id, job);
    activeJobId = id;
    void runJob(job, body.project);
    return publicJob(job);
  }

  function getJob(id) {
    const job = jobs.get(id);
    return job ? publicJob(job) : null;
  }

  function cancelJob(id) {
    const job = jobs.get(id);
    if (!job) return false;
    job.cancelled = true;
    try { job.process?.kill('SIGKILL'); } catch {}
    try { job.controller?.abort(); } catch {}
    return true;
  }

  return { capabilities, startJob, getJob, cancelJob, runtime };
}

export { buildCues };

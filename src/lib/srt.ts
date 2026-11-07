export interface SrtCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(value: string): number {
  const match = value.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, '0').slice(0, 3)) / 1000;
}

export function parseSrt(content: string): SrtCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n{2,}/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex === -1) continue;
    const [startRaw, endRaw] = lines[timeIndex].split('-->');
    const text = lines.slice(timeIndex + 1).join('\n').trim();
    if (!text) continue;
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) cues.push({ start, end, text });
  }
  return cues;
}

function pad(value: number, size = 2): string {
  return String(Math.floor(value)).padStart(size, '0');
}

export function toSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe % 1) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(millis).padStart(3, '0')}`;
}

export function buildSrt(cues: SrtCue[]): string {
  return cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((cue, index) => `${index + 1}\n${toSrtTimestamp(cue.start)} --> ${toSrtTimestamp(cue.end)}\n${cue.text.trim()}`)
    .join('\n\n');
}

export function scriptToCues(script: string, startAt: number): SrtCue[] {
  const parts = script
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cues: SrtCue[] = [];
  let cursor = startAt;
  for (const part of parts) {
    const words = part.split(/\s+/).length;
    const duration = Math.max(1.3, Math.min(5.5, words / 2.6));
    cues.push({ start: cursor, end: cursor + duration, text: part });
    cursor += duration + 0.08;
  }
  return cues;
}

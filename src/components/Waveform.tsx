import { useMemo } from 'react';

export function samplePeaks(peaks: number[], count: number, startFraction = 0, endFraction = 1): number[] {
  if (!peaks?.length || count <= 0) return Array.from({ length: Math.max(0, count) }, () => 0.12);
  const start = Math.max(0, Math.min(peaks.length - 1, Math.floor(startFraction * peaks.length)));
  const end = Math.max(start + 1, Math.min(peaks.length, Math.ceil(endFraction * peaks.length)));
  const result: number[] = [];
  const span = end - start;
  for (let i = 0; i < count; i++) {
    const from = start + Math.floor((i / count) * span);
    const to = Math.max(from + 1, start + Math.floor(((i + 1) / count) * span));
    let peak = 0;
    for (let j = from; j < to && j < peaks.length; j++) peak = Math.max(peak, peaks[j]);
    result.push(Math.max(3, peak) / 100);
  }
  return result;
}

export function WaveformMini({ peaks, color = '#62e6c1', bars = 52, className = '' }: { peaks?: number[]; color?: string; bars?: number; className?: string }) {
  const values = useMemo(() => samplePeaks(peaks || [], bars), [peaks, bars]);
  return (
    <svg className={`waveform-mini ${className}`} viewBox={`0 0 ${bars * 3} 32`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((value, index) => {
        const height = Math.max(2, value * 27);
        return <rect key={index} x={index * 3} y={16 - height / 2} width="1.7" height={height} rx="0.8" fill={color} opacity={0.55 + value * 0.45} />;
      })}
    </svg>
  );
}

export function TimelineWaveform({
  peaks, color = '#7ff0c9', bars = 160, trimStart = 0, trimEnd = 1
}: {
  peaks?: number[];
  color?: string;
  bars?: number;
  trimStart?: number;
  trimEnd?: number;
}) {
  const values = useMemo(() => samplePeaks(peaks || [], bars, trimStart, trimEnd), [peaks, bars, trimStart, trimEnd]);
  return (
    <svg className="timeline-waveform" viewBox={`0 0 ${bars * 3} 40`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((value, index) => {
        const height = Math.max(2, value * 34);
        return <rect key={index} x={index * 3} y={20 - height / 2} width="1.7" height={height} rx="0.8" fill={color} opacity={0.48 + value * 0.5} />;
      })}
    </svg>
  );
}

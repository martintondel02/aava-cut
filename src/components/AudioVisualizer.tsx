import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { mediaPool } from '../engine/mediaPool';

const ACCENT_HEX: Record<string, string> = {
  mint: '#72f5d1',
  blue: '#7f9cff',
  amber: '#ffc76b',
  rose: '#ff91ad'
};

export function AudioVisualizer({ playing, variant = 'overlay' }: { playing: boolean; variant?: 'overlay' | 'panel' }) {
  const style = useSettingsStore((state) => state.visualizerStyle);
  const accent = useSettingsStore((state) => state.accent);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const color = ACCENT_HEX[accent] || ACCENT_HEX.mint;
    const light = false;
    let frequency = new Uint8Array(0);
    let waveform = new Uint8Array(0);
    let analyser = null as AnalyserNode | null;
    let raf = 0;
    let smooth = new Float32Array(48);

    const ensureBuffers = () => {
      const next = mediaPool.getAnalyser();
      if (next && next !== analyser) {
        analyser = next;
        frequency = new Uint8Array(next.frequencyBinCount);
        waveform = new Uint8Array(next.fftSize);
      }
      return next;
    };

    const drawSpectrum = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      const count = 42;
      const gap = 3;
      const barWidth = (width - gap * (count - 1) - 16) / count;
      const idle = !playingRef.current || !analyser;
      if (analyser && playingRef.current) analyser.getByteFrequencyData(frequency);
      const sampleRate = mediaPool.context?.sampleRate || 48000;
      const fMin = 42;
      const fMax = 14000;
      const binForFrequency = (frequencyHz: number) => Math.max(0, Math.min(frequency.length - 1, Math.round((frequencyHz / (sampleRate / 2)) * frequency.length)));
      for (let index = 0; index < count; index++) {
        let value = 0;
        if (!idle) {
          const from = binForFrequency(fMin * Math.pow(fMax / fMin, index / count));
          const to = Math.max(from + 1, binForFrequency(fMin * Math.pow(fMax / fMin, (index + 1) / count)));
          let total = 0;
          for (let bin = from; bin < to; bin++) total += frequency[bin] || 0;
          const normalized = (total / Math.max(1, to - from)) / 255;
          value = Math.min(1, Math.pow(Math.max(0, normalized - 0.006), 0.58) * 3.5);
        } else {
          value = 0.035 + Math.sin(time / 650 + index * 0.42) * 0.014;
        }
        smooth[index] = smooth[index] * 0.68 + value * 0.32;
        const barHeight = Math.max(2.5, smooth[index] * (height - 19));
        const x = 8 + index * (barWidth + gap);
        const y = height - 10 - barHeight;
        const gradient = ctx.createLinearGradient(0, y, 0, height - 10);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, light ? 'rgba(11,146,115,.18)' : 'rgba(114,245,209,.18)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, Math.min(2, barWidth / 2));
        ctx.fill();
      }
    };

    const drawWaveform = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      const idle = !playingRef.current || !analyser;
      if (analyser && playingRef.current) analyser.getByteTimeDomainData(waveform);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const points = 120;
      for (let index = 0; index < points; index++) {
        const x = 10 + (index / (points - 1)) * (width - 20);
        let value = 128;
        if (!idle) value = waveform[Math.floor((index / points) * waveform.length)] || 128;
        else value = 128 + Math.sin(time / 500 + index * 0.18) * 6;
        const y = height / 2 + ((value - 128) / 128) * (height * 0.32);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineTo(width - 10, height - 10);
      ctx.lineTo(10, height - 10);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, height);
      fill.addColorStop(0, light ? 'rgba(11,146,115,.16)' : 'rgba(114,245,209,.16)');
      fill.addColorStop(1, 'rgba(114,245,209,0)');
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const drawRadial = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      const idle = !playingRef.current || !analyser;
      if (analyser && playingRef.current) analyser.getByteFrequencyData(frequency);
      const cx = 62;
      const cy = height / 2;
      const base = 22;
      const count = 30;
      for (let index = 0; index < count; index++) {
        const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
        let value = 0.05;
        if (!idle) {
          const bin = Math.floor((index / count) * 220);
          value = (frequency[bin] || 0) / 255;
        } else value = 0.06 + Math.sin(time / 700 + index) * 0.02;
        const length = 4 + value * 30;
        const x1 = cx + Math.cos(angle) * base;
        const y1 = cy + Math.sin(angle) * base;
        const x2 = cx + Math.cos(angle) * (base + length);
        const y2 = cy + Math.sin(angle) * (base + length);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35 + value * 0.65;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(128, height / 2 - 5);
      ctx.fillStyle = light ? 'rgba(20,44,37,.65)' : 'rgba(255,255,255,.5)';
      ctx.font = '600 8px "Montserrat", sans-serif';
      ctx.fillText('LIVE MIX', 0, 0);
      ctx.fillStyle = light ? 'rgba(20,44,37,.35)' : 'rgba(255,255,255,.26)';
      ctx.font = '500 6.5px "Open Sans", sans-serif';
      ctx.fillText('master bus', 0, 13);
      ctx.restore();
    };

    const draw = (time: number) => {
      ensureBuffers();
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      if (style === 'waveform') drawWaveform(time);
      else if (style === 'radial') drawRadial(time);
      else drawSpectrum(time);
      ctx.fillStyle = light ? 'rgba(20,44,37,.4)' : 'rgba(255,255,255,.3)';
      ctx.font = '600 6px "Montserrat", sans-serif';
      ctx.fillText(style.toUpperCase(), 9, 11);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onResize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      canvas.width = Math.round(rect.width * Math.min(2, window.devicePixelRatio || 1));
      canvas.height = Math.round(rect.height * Math.min(2, window.devicePixelRatio || 1));
    };
    onResize();
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [style, accent]);

  return <canvas ref={canvasRef} className={`audio-visualizer ${variant === 'panel' ? 'panel-visualizer' : ''}`} aria-hidden="true" />;
}

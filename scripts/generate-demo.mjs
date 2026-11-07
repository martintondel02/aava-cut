#!/usr/bin/env node
/**
 * Generates the bundled, license-free demo media used by LumaCut.
 * Everything is synthesized locally with FFmpeg + SVG, so the editor works offline.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'demo');
const tmp = path.join(root, '.demo-tmp');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

const run = (bin, args) => {
  process.stdout.write(`  ${bin} ${args.slice(0, 4).join(' ')}…\n`);
  execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
};

const grain = `
  <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
  </filter>`;

const scenes = {
  aurora: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="#050a1c"/>
        <stop offset="0.48" stop-color="#0c1e3f"/>
        <stop offset="0.74" stop-color="#163b4d"/>
        <stop offset="1" stop-color="#07111f"/>
      </linearGradient>
      <linearGradient id="auroraA" x1="0" y1="0" x2="1" y2="0.5">
        <stop offset="0" stop-color="#5fffc8" stop-opacity="0"/>
        <stop offset=".38" stop-color="#54f7c2" stop-opacity=".9"/>
        <stop offset=".68" stop-color="#5db8ff" stop-opacity=".55"/>
        <stop offset="1" stop-color="#6c5cff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="auroraB" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#ff59c7" stop-opacity="0"/>
        <stop offset=".45" stop-color="#b56bff" stop-opacity=".62"/>
        <stop offset="1" stop-color="#5fffc8" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="#9fffe9" stop-opacity=".35"/><stop offset="1" stop-color="#9fffe9" stop-opacity="0"/></radialGradient>
      <filter id="blurA"><feGaussianBlur stdDeviation="34"/></filter>
      <filter id="blurB"><feGaussianBlur stdDeviation="16"/></filter>
      ${grain}
    </defs>
    <rect width="1920" height="1080" fill="url(#sky)"/>
    <ellipse cx="1350" cy="370" rx="530" ry="250" fill="url(#glow)"/>
    <g filter="url(#blurA)" opacity=".85">
      <path d="M-100 350 C 300 110, 560 560, 950 300 S 1540 150, 2060 370 L 2060 540 C 1500 300, 1200 520, 900 440 S 330 300, -100 530 Z" fill="url(#auroraA)"/>
      <path d="M-100 470 C 350 260, 680 640, 1120 360 S 1750 330, 2080 520 L 2080 610 C 1600 440, 1350 620, 1080 520 S 440 430, -100 640 Z" fill="url(#auroraB)" opacity=".6"/>
    </g>
    <g filter="url(#blurB)" opacity=".5">
      <path d="M-100 250 C 400 40, 720 410, 1200 220 S 1800 250, 2050 320" fill="none" stroke="#b8ffe8" stroke-width="26"/>
    </g>
    <path d="M0 820 L240 690 L470 810 L690 640 L940 830 L1200 700 L1470 850 L1730 690 L1920 790 L1920 1080 L0 1080Z" fill="#071019" opacity=".9"/>
    <path d="M0 930 L210 830 L430 940 L660 850 L920 970 L1180 830 L1430 960 L1660 860 L1920 970 L1920 1080 L0 1080Z" fill="#03080f"/>
    <rect width="1920" height="1080" filter="url(#grain)" opacity=".8"/>
  </svg>`,

  sunset: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#24163a"/>
        <stop offset=".34" stop-color="#7a3c5b"/>
        <stop offset=".62" stop-color="#e58a63"/>
        <stop offset=".82" stop-color="#ffc27d"/>
        <stop offset="1" stop-color="#ffe0b0"/>
      </linearGradient>
      <radialGradient id="sun"><stop offset="0" stop-color="#fff8d8"/><stop offset=".22" stop-color="#ffeda6"/><stop offset=".68" stop-color="#ffad5c" stop-opacity=".65"/><stop offset="1" stop-color="#ff8d4d" stop-opacity="0"/></radialGradient>
      <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#39263a"/><stop offset="1" stop-color="#17111f"/></linearGradient>
      <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1423"/><stop offset="1" stop-color="#08070d"/></linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c97a5d"/><stop offset="1" stop-color="#24172c"/></linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="haze"><feGaussianBlur stdDeviation="40"/></filter>
      ${grain}
    </defs>
    <rect width="1920" height="1080" fill="url(#sky)"/>
    <circle cx="1180" cy="600" r="430" fill="url(#sun)"/>
    <circle cx="1180" cy="600" r="112" fill="#fff2c2" opacity=".95"/>
    <g filter="url(#haze)" opacity=".6">
      <ellipse cx="720" cy="520" rx="620" ry="50" fill="#ffd19f"/>
      <ellipse cx="1420" cy="460" rx="520" ry="38" fill="#ffb88f"/>
    </g>
    <path d="M0 700 L180 530 L350 660 L520 470 L740 690 L890 580 L1050 710 L1210 520 L1390 660 L1580 500 L1750 640 L1920 540 L1920 820 L0 820Z" fill="url(#m1)" opacity=".85"/>
    <rect y="760" width="1920" height="320" fill="url(#water)"/>
    <g opacity=".55" filter="url(#soft)">
      <rect x="1080" y="770" width="200" height="10" rx="5" fill="#ffd6a8"/>
      <rect x="1010" y="815" width="340" height="9" rx="4" fill="#ffc18d"/>
      <rect x="1120" y="864" width="250" height="8" rx="4" fill="#ffb37f"/>
      <rect x="960" y="918" width="430" height="7" rx="3" fill="#f59c74"/>
      <rect x="1100" y="980" width="240" height="6" rx="3" fill="#e88c69"/>
    </g>
    <path d="M0 870 L240 760 L410 850 L640 750 L860 880 L1110 780 L1360 890 L1630 760 L1920 870 L1920 1080 L0 1080Z" fill="url(#m2)"/>
    <rect width="1920" height="1080" filter="url(#grain)" opacity=".85"/>
  </svg>`,

  coast: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8bd7e4"/><stop offset=".55" stop-color="#cceef1"/><stop offset="1" stop-color="#f4e6d4"/></linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b9baa"/><stop offset=".45" stop-color="#0b667d"/><stop offset="1" stop-color="#052d43"/></linearGradient>
      <linearGradient id="cliff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b5b45"/><stop offset="1" stop-color="#2b211c"/></linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="30"/></filter>
      <filter id="soft2"><feGaussianBlur stdDeviation="4"/></filter>
      ${grain}
    </defs>
    <rect width="1920" height="1080" fill="url(#sky)"/>
    <circle cx="500" cy="330" r="330" fill="#fff4d8" opacity=".55" filter="url(#blur)"/>
    <rect y="540" width="1920" height="540" fill="url(#sea)"/>
    <g opacity=".7">
      <path d="M0 620 Q 280 580 560 630 T 1120 620 T 1680 640 T 1920 610" fill="none" stroke="#c5f5f3" stroke-width="5" filter="url(#soft2)"/>
      <path d="M0 710 Q 240 680 520 720 T 1080 700 T 1640 730 T 1920 700" fill="none" stroke="#9ce9e7" stroke-width="3" opacity=".6"/>
      <path d="M0 810 Q 300 770 640 825 T 1240 805 T 1760 830 T 1920 800" fill="none" stroke="#7ed7dc" stroke-width="2" opacity=".4"/>
    </g>
    <path d="M980 1080 L1190 710 L1320 700 L1420 750 L1510 660 L1640 690 L1720 590 L1850 640 L1920 610 L1920 1080Z" fill="url(#cliff)"/>
    <path d="M1160 1080 L1280 760 L1390 748 L1480 792 L1560 710 L1650 735 L1740 660 L1850 690 L1920 670 L1920 1080Z" fill="#241b18" opacity=".75"/>
    <path d="M0 900 L120 840 L210 1080 L0 1080Z" fill="url(#cliff)" opacity=".9"/>
    <rect width="1920" height="1080" filter="url(#grain)" opacity=".7"/>
  </svg>`,

  neon: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#100525"/><stop offset=".5" stop-color="#2a0a42"/><stop offset="1" stop-color="#08040f"/></linearGradient>
      <linearGradient id="neon1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fa1"/><stop offset="1" stop-color="#7a5cff"/></linearGradient>
      <linearGradient id="neon2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3cf7df"/><stop offset="1" stop-color="#1e80ff"/></linearGradient>
      <radialGradient id="pinkglow"><stop offset="0" stop-color="#ff3d9a" stop-opacity=".65"/><stop offset="1" stop-color="#ff3d9a" stop-opacity="0"/></radialGradient>
      <radialGradient id="cyanglow"><stop offset="0" stop-color="#32ffdf" stop-opacity=".5"/><stop offset="1" stop-color="#32ffdf" stop-opacity="0"/></radialGradient>
      <filter id="blur1"><feGaussianBlur stdDeviation="24"/></filter>
      <filter id="blur2"><feGaussianBlur stdDeviation="6"/></filter>
      ${grain}
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <ellipse cx="380" cy="580" rx="480" ry="280" fill="url(#pinkglow)"/>
    <ellipse cx="1540" cy="420" rx="500" ry="300" fill="url(#cyanglow)"/>
    <g opacity=".35" filter="url(#blur1)" fill="none" stroke-linecap="round">
      <path d="M200 250 L720 460 L420 900" stroke="#ff4fa1" stroke-width="28"/>
      <path d="M1600 240 L1050 420 L1400 920" stroke="#3cf7df" stroke-width="24"/>
      <path d="M420 140 L820 700 L1260 210" stroke="#8d67ff" stroke-width="18"/>
    </g>
    <g fill="#06030c">
      <rect x="0" y="640" width="180" height="440"/><rect x="210" y="540" width="140" height="540"/>
      <rect x="380" y="720" width="210" height="360"/><rect x="620" y="590" width="120" height="490"/>
      <rect x="770" y="690" width="190" height="390"/><rect x="990" y="500" width="160" height="580"/>
      <rect x="1180" y="650" width="130" height="430"/><rect x="1340" y="560" width="210" height="520"/>
      <rect x="1580" y="700" width="150" height="380"/><rect x="1760" y="610" width="160" height="470"/>
    </g>
    <g opacity=".8">
      <rect x="235" y="580" width="18" height="80" fill="#3cf7df" filter="url(#blur2)"/>
      <rect x="270" y="620" width="12" height="50" fill="#ff4fa1" filter="url(#blur2)"/>
      <rect x="820" y="730" width="15" height="60" fill="#ff9dd0" filter="url(#blur2)"/>
      <rect x="1020" y="540" width="12" height="90" fill="#3cf7df" filter="url(#blur2)"/>
      <rect x="1370" y="610" width="16" height="70" fill="#ff4fa1" filter="url(#blur2)"/>
      <rect x="1790" y="660" width="14" height="55" fill="#3cf7df" filter="url(#blur2)"/>
    </g>
    <path d="M0 860 L1920 840 L1920 1080 L0 1080Z" fill="#05020b"/>
    <g opacity=".3" filter="url(#blur1)">
      <path d="M0 900 L1920 880" stroke="url(#neon1)" stroke-width="80"/>
    </g>
    <rect width="1920" height="1080" filter="url(#grain)" opacity=".8"/>
  </svg>`,

  portrait: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2333"/><stop offset=".52" stop-color="#4d6c78"/><stop offset=".72" stop-color="#d8a17f"/><stop offset="1" stop-color="#f4d4ac"/></linearGradient>
      <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#263843"/><stop offset="1" stop-color="#0a141b"/></linearGradient>
      <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101d24"/><stop offset="1" stop-color="#050a0e"/></linearGradient>
      <radialGradient id="sun"><stop offset="0" stop-color="#fff3cb"/><stop offset=".55" stop-color="#ffcf92" stop-opacity=".55"/><stop offset="1" stop-color="#ffb06b" stop-opacity="0"/></radialGradient>
      ${grain}
    </defs>
    <rect width="1080" height="1350" fill="url(#sky)"/>
    <circle cx="760" cy="520" r="300" fill="url(#sun)"/>
    <circle cx="760" cy="520" r="72" fill="#fff5d8" opacity=".9"/>
    <path d="M0 800 L150 610 L300 760 L430 540 L610 790 L780 640 L920 800 L1080 680 L1080 960 L0 960Z" fill="url(#m1)"/>
    <path d="M0 1000 L190 840 L360 980 L560 820 L760 1000 L930 870 L1080 990 L1080 1350 L0 1350Z" fill="url(#m2)"/>
    <g opacity=".45"><path d="M0 930 L1080 900" stroke="#ffd8ac" stroke-width="3"/><path d="M0 980 L1080 950" stroke="#ffd8ac" stroke-width="2"/></g>
    <rect width="1080" height="1350" filter="url(#grain)" opacity=".8"/>
  </svg>`
};

const write = (name, data) => fs.writeFileSync(path.join(tmp, name), data.trim());

for (const [name, svg] of Object.entries(scenes)) write(`${name}.svg`, svg);

console.log('Generating demo film stills…');
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(tmp, 'aurora.svg'), '-vf', 'scale=1920:1080', '-frames:v', '1', path.join(out, 'aurora-still.jpg')]);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(tmp, 'sunset.svg'), '-vf', 'scale=1920:1080', '-frames:v', '1', path.join(out, 'sunset.jpg')]);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(tmp, 'coast.svg'), '-vf', 'scale=1920:1080', '-frames:v', '1', path.join(out, 'coast-still.jpg')]);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(tmp, 'neon.svg'), '-vf', 'scale=1920:1080', '-frames:v', '1', path.join(out, 'neon-still.jpg')]);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(tmp, 'portrait.svg'), '-vf', 'scale=1080:1350', '-frames:v', '1', path.join(out, 'portrait.jpg')]);

// Slow cinematic push-ins rendered from the stills.
const makeMotion = (src, dest, seconds = 7) => {
  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-i', path.join(out, src),
    '-vf', `scale=2560:1440,zoompan=z='1.02+0.00055*on':x='iw/2-(iw/zoom/2)+sin(on/180)*12':y='ih/2-(ih/zoom/2)':d=${seconds * 30}:s=1920x1080:fps=30,format=yuv420p`,
    '-t', String(seconds), '-c:v', 'libopenh264', '-b:v', '5M', '-movflags', '+faststart',
    path.join(out, dest)
  ]);
};
console.log('Rendering cinematic demo clips…');
makeMotion('aurora-still.jpg', 'aurora.mp4', 7);
makeMotion('sunset.jpg', 'sunset.mp4', 7);
makeMotion('coast-still.jpg', 'coast.mp4', 7);
makeMotion('neon-still.jpg', 'neon.mp4', 7);

console.log('Synthesizing original soundtrack…');
run('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi',
  '-i', "aevalsrc=0.055*sin(2*PI*110*t)+0.045*sin(2*PI*164.81*t)+0.036*sin(2*PI*220*t)+0.026*sin(2*PI*277.18*t)+0.02*sin(2*PI*329.63*t+0.4*sin(2*PI*0.08*t)):s=44100:d=48",
  '-af', "tremolo=f=0.12:d=0.25,aecho=0.8:0.65:480|960|1440:0.28|0.2|0.12,lowpass=f=2400,highpass=f=55,afade=t=in:st=0:d=2,afade=t=out:st=45:d=3,volume=1.3",
  '-c:a', 'libmp3lame', '-b:a', '192k', path.join(out, 'ambient.mp3')
]);
run('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=1.4:amplitude=0.35',
  '-af', "highpass=f=120,lowpass=f=9000,afade=t=in:st=0:d=0.35,afade=t=out:st=0.5:d=0.9,volume=0.8",
  '-c:a', 'libmp3lame', '-b:a', '160k', path.join(out, 'whoosh.mp3')
]);
run('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', "aevalsrc=0.12*sin(2*PI*(180+520*(t/3))*t)*(t/3):s=44100:d=3",
  '-af', "aecho=0.7:0.5:250:0.25,lowpass=f=8000,afade=t=out:st=2.4:d=0.6,volume=0.9",
  '-c:a', 'libmp3lame', '-b:a', '160k', path.join(out, 'riser.mp3')
]);

// Small poster frames for the asset browser.
for (const name of ['aurora', 'sunset', 'coast', 'neon']) {
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1.2', '-i', path.join(out, `${name}.mp4`), '-frames:v', '1', '-vf', 'scale=640:-2', path.join(out, `${name}-thumb.jpg`)]);
}
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(out, 'portrait.jpg'), '-vf', 'scale=640:-2', path.join(out, 'portrait-thumb.jpg')]);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(out, 'aurora-still.jpg'), '-frames:v', '1', '-vf', 'scale=640:-2', path.join(out, 'aurora-still-thumb.jpg')]);

const manifest = {
  generatedAt: new Date().toISOString(),
  assets: [
    { id: 'demo-aurora', name: 'Aurora Drift', kind: 'video', file: 'aurora.mp4', thumbnail: 'aurora-thumb.jpg', duration: 7, width: 1920, height: 1080 },
    { id: 'demo-sunset', name: 'Golden Hour', kind: 'video', file: 'sunset.mp4', thumbnail: 'sunset-thumb.jpg', duration: 7, width: 1920, height: 1080 },
    { id: 'demo-coast', name: 'Coastal Air', kind: 'video', file: 'coast.mp4', thumbnail: 'coast-thumb.jpg', duration: 7, width: 1920, height: 1080 },
    { id: 'demo-neon', name: 'Neon District', kind: 'video', file: 'neon.mp4', thumbnail: 'neon-thumb.jpg', duration: 7, width: 1920, height: 1080 },
    { id: 'demo-portrait', name: 'Quiet Peaks', kind: 'image', file: 'portrait.jpg', thumbnail: 'portrait-thumb.jpg', duration: 0, width: 1080, height: 1350 },
    { id: 'demo-still', name: 'Aurora Still', kind: 'image', file: 'aurora-still.jpg', thumbnail: 'aurora-still-thumb.jpg', duration: 0, width: 1920, height: 1080 },
    { id: 'demo-ambient', name: 'Slow Orbit', kind: 'audio', file: 'ambient.mp3', thumbnail: null, duration: 48, width: 0, height: 0 },
    { id: 'demo-whoosh', name: 'Air Whoosh', kind: 'audio', file: 'whoosh.mp3', thumbnail: null, duration: 1.4, width: 0, height: 0 },
    { id: 'demo-riser', name: 'Night Riser', kind: 'audio', file: 'riser.mp3', thumbnail: null, duration: 3, width: 0, height: 0 }
  ]
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nDone. Demo media written to ${out}`);

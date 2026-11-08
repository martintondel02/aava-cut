import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const VERSION = '2026.10.21';
const URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${VERSION}/yt-dlp_linux`;
const SHA256 = 'd8bd33fca9d5b23bd5b9952b3fca36db5c46331933fda9f598a3da14ce2c243f';
const dest = path.join(process.cwd(), 'vendor', 'yt-dlp', 'yt-dlp');

fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) {
  const existing = crypto.createHash('sha256').update(await fsp.readFile(dest)).digest('hex');
  if (existing === SHA256) {
    console.log(`yt-dlp ${VERSION} already bundled`);
    process.exit(0);
  }
}

console.log(`Downloading yt-dlp ${VERSION}…`);
const response = await fetch(URL, { redirect: 'follow' });
if (!response.ok) throw new Error(`yt-dlp download failed: HTTP ${response.status}`);
const buffer = Buffer.from(await response.arrayBuffer());
const hash = crypto.createHash('sha256').update(buffer).digest('hex');
if (hash !== SHA256) throw new Error(`yt-dlp checksum mismatch: ${hash}`);
await fsp.writeFile(dest, buffer);
await fsp.chmod(dest, 0o755);
console.log(`Bundled yt-dlp ${VERSION} at ${dest}`);

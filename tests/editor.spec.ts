import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const API = 'http://127.0.0.1:4317';
const videoFixture = path.join(process.cwd(), 'tests/fixtures/lumacut-test-fixture.mp4');
const audioFixture = path.join(process.cwd(), 'tests/fixtures/lumacut-test-audio.wav');
const longFixture = path.join(process.cwd(), 'tests/fixtures/lumacut-long-fixture.mp4');
let api: APIRequestContext;
let videoAssetId = '';
let audioAssetId = '';
let longAssetId = '';

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ baseURL: API });
  const existing = await api.get('/api/assets');
  if (existing.ok()) {
    for (const asset of await existing.json() as Array<{ id: string; name: string }>) {
      if (/lumacut-test/i.test(asset.name)) await api.delete(`/api/assets/${asset.id}`);
    }
  }
  const video = await api.post('/api/assets', {
    multipart: { files: { name: 'lumacut-test-fixture.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(videoFixture) } }
  });
  expect(video.ok()).toBeTruthy();
  const videoBody = await video.json() as { assets: Array<{ id: string }>; errors?: Array<{ error: string }> };
  if (!videoBody.assets[0]) throw new Error(`Video fixture upload failed: ${JSON.stringify(videoBody.errors || videoBody)}`);
  videoAssetId = videoBody.assets[0].id;

  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-t', '18', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', longFixture]);
  const long = await api.post('/api/assets', {
    multipart: { files: { name: 'lumacut-long-fixture.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(longFixture) } }
  });
  expect(long.ok()).toBeTruthy();
  const longBody = await long.json() as { assets: Array<{ id: string }>; errors?: Array<{ error: string }> };
  if (!longBody.assets[0]) throw new Error(`Long fixture upload failed: ${JSON.stringify(longBody.errors || longBody)}`);
  longAssetId = longBody.assets[0].id;

  const audio = await api.post('/api/assets', {
    multipart: { files: { name: 'lumacut-test-audio.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(audioFixture) } }
  });
  expect(audio.ok()).toBeTruthy();
  const audioBody = await audio.json() as { assets: Array<{ id: string }>; errors?: Array<{ error: string }> };
  if (!audioBody.assets[0]) throw new Error(`Audio fixture upload failed: ${JSON.stringify(audioBody.errors || audioBody)}`);
  audioAssetId = audioBody.assets[0].id;
});

test.afterAll(async () => {
  if (!api) return;
  if (videoAssetId) await api.delete(`/api/assets/${videoAssetId}`).catch(() => {});
  if (audioAssetId) await api.delete(`/api/assets/${audioAssetId}`).catch(() => {});
  if (longAssetId) await api.delete(`/api/assets/${longAssetId}`).catch(() => {});
  try { fs.unlinkSync(longFixture); } catch {}
  await api.dispose();
});

async function addFixtureClip(page: import('@playwright/test').Page) {
  await page.locator('.media-card', { hasText: 'lumacut-test-fixture' }).dblclick();
  await expect(page.locator('.timeline-clip')).toHaveCount(1);
  await page.waitForTimeout(500);
}

async function addFixtureAudio(page: import('@playwright/test').Page) {
  await page.locator('.rail-tab[title="Audio (2)"]').click();
  await page.locator('.audio-row', { hasText: 'lumacut-test-audio' }).dblclick();
  await expect(page.locator('.timeline-clip.clip-audio')).toHaveCount(1);
}

async function addThreeClips(page: import('@playwright/test').Page) {
  await addFixtureClip(page);
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+d');
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
}

test.describe('LumaCut editor', () => {
  test('starts blank and paints an imported clip', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.timeline-clip')).toHaveCount(0);
    await expect(page.locator('.track-header')).toHaveCount(5);
    await expect(page.locator('.transport-current')).toContainText('00:00:00');

    const assets = await request.get('/api/assets');
    expect(assets.ok()).toBeTruthy();
    const assetList = await assets.json() as Array<{ id: string; name: string }>;
    expect(assetList.some((asset) => asset.id.startsWith('demo-'))).toBe(false);
    expect(assetList.some((asset) => asset.name === 'lumacut-test-fixture')).toBe(true);

    await addFixtureClip(page);
    const litPixels = await page.locator('.preview-canvas').evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] + data[index + 1] + data[index + 2] > 16) lit++;
      }
      return lit;
    });
    expect(litPixels).toBeGreaterThan(100_000);
    expect(errors).toEqual([]);
  });

  test('splits a clip and undoes the edit', async ({ page }) => {
    await page.goto('/');
    await addFixtureClip(page);
    const zoom = Number((await page.locator('.zoom-readout').innerText()).match(/\d+/)?.[0] || 68);
    const ruler = await page.locator('.timeline-ruler').boundingBox();
    if (!ruler) throw new Error('ruler was not visible');
    await page.mouse.click(ruler.x + zoom * 2, ruler.y + 14);
    await page.locator('.timeline-clip').first().click({ position: { x: 60, y: 25 } });
    await page.keyboard.press('b');
    await expect(page.locator('.timeline-clip')).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.timeline-clip')).toHaveCount(1);
  });

  test('adds a new title on its own free track', async ({ page }) => {
    await page.goto('/');
    await page.locator('.rail-tab[title="Text (3)"]').click();
    await page.locator('.text-preset-card').first().click();
    await expect(page.locator('.timeline-clip')).toHaveCount(1);
    await expect(page.locator('.track-header')).toHaveCount(5);
    await expect(page.locator('.clip-name-input')).toHaveValue('Editorial');
    await expect(page.locator('.transform-box')).toHaveCount(1);
  });

  test('serves the media API without demo assets', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).ok).toBe(true);
    const assets = await request.get('/api/assets');
    expect(assets.ok()).toBeTruthy();
    const list = await assets.json() as Array<{ id: string; name: string }>;
    expect(list.some((asset) => /lumacut-test/i.test(asset.name))).toBe(true);
    expect(list.some((asset) => asset.id.startsWith('demo-'))).toBe(false);
  });
});

test.describe('LumaCut editor tools', () => {
  test('settings applies theme and interface scale', async ({ page }) => {
    await page.goto('/');
    await page.locator('.topbar-actions .icon-btn[title="Settings (Ctrl+,)"]').click();
    await expect(page.locator('.settings-page')).toBeVisible();
    await page.locator('.theme-card.theme-light').click();
    await page.locator('.scale-presets button', { hasText: '120%' }).click();
    await page.locator('.settings-topbar .btn-primary').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const metrics = await page.evaluate(() => ({
      scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      shell: document.querySelector('.app-shell')?.getBoundingClientRect().height,
      viewport: window.innerHeight,
      scroll: document.documentElement.scrollHeight
    }));
    expect(metrics.scale).toBe('1.2');
    expect(metrics.shell).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.scroll).toBe(metrics.viewport);
  });

  test('adds, drags and deletes timeline keyframes with spring easing', async ({ page }) => {
    await page.goto('/');
    await addFixtureClip(page);
    await page.locator('.timeline-clip').first().click({ position: { x: 60, y: 25 } });
    const keyframes = page.locator('.inspector-section', { hasText: 'Keyframes' }).first();
    await keyframes.locator('.inspector-section-title').click();
    await keyframes.locator('.keyframe-add-grid button', { hasText: 'Opacity' }).click();
    await expect(page.locator('.keyframe-lane')).toHaveCount(1);
    await expect(page.locator('.keyframe-block')).toHaveCount(1);
    await expect(page.locator('.keyframe-selection-pill')).toHaveCount(1);

    await page.locator('.keyframe-lane').first().dblclick({ position: { x: 120, y: 7 } });
    await expect(page.locator('.keyframe-block')).toHaveCount(2);
    await page.locator('.keyframe-selection-pill select').selectOption('springSoft');
    await page.locator('.keyframe-block').last().click();
    const before = await page.locator('.keyframe-selection-pill .kf-pill-time').innerText();
    const block = page.locator('.keyframe-block.is-selected').first();
    const box = await block.boundingBox();
    if (!box) throw new Error('keyframe block was not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 38, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.keyframe-selection-pill .kf-pill-time')).not.toHaveText(before);
    await page.keyboard.press('Delete');
    await expect(page.locator('.keyframe-block')).toHaveCount(1);
  });

  test('applies master EQ and exposes per-track tone', async ({ page }) => {
    await page.goto('/');
    await addFixtureAudio(page);
    await page.locator('.eq-presets button', { hasText: 'Bass' }).click();
    await page.waitForTimeout(800);
    const masterEq = await page.evaluate(() => JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}').masterEq);
    expect(masterEq).toEqual([6, 5, 4, 2, 0, 0, 0, 0, 0, 0]);
    await page.locator('.timeline-clip.clip-audio').first().click({ position: { x: 100, y: 20 } });
    await expect(page.locator('.track-tone-block')).toHaveCount(1);
    await expect(page.locator('.solo-pill')).toHaveCount(1);
  });

  test('adds, renames and removes an audio track', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('.track-header').count();
    await page.locator('.corner-add').click();
    await page.locator('.corner-track-menu button', { hasText: 'Audio track' }).click();
    await expect(page.locator('.track-header')).toHaveCount(before + 1);
    const trackNames = page.locator('.track-name');
    const last = trackNames.last();
    const name = await last.innerText();
    await last.dblclick();
    await page.locator('.track-rename-input').fill('Voice notes');
    await page.locator('.track-rename-input').press('Enter');
    await expect(page.locator('.track-name').last()).toHaveText('Voice notes');
    await page.locator('.track-header').last().locator('.track-action').last().click();
    await page.locator('.track-menu button', { hasText: 'Remove track' }).click();
    await expect(page.locator('.track-header')).toHaveCount(before);
    expect(await page.locator('.track-name').allInnerTexts()).not.toContain('Voice notes');
    expect(name).not.toBe('Voice notes');
  });

  test('migrates a 1.0 project with string effects and easing', async ({ page }) => {
    await page.goto('/');
    await addFixtureClip(page);
    await page.waitForTimeout(900);
    const migrated = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
      project.version = 1;
      project.masterEq = undefined;
      project.tracks = project.tracks.map((track: Record<string, unknown>) => ({ ...track, eq: undefined, gain: undefined, solo: undefined }));
      project.clips = project.clips.map((clip: Record<string, unknown>) => ({
        ...clip,
        effects: clip.effects ? (clip.effects as Array<{ type: string }>).map((effect) => effect.type) : [],
        keyframes: [
          { id: 'legacy-1', property: 'opacity', time: 0, value: 0, easing: 'linear' },
          ...(clip.keyframes || [])
        ]
      }));
      localStorage.setItem('lumacut.project.v1', JSON.stringify(project));
      return true;
    });
    expect(migrated).toBe(true);
    await page.reload();
    await page.waitForTimeout(1000);
    const check = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
      return {
        version: project.version,
        masterEq: project.masterEq,
        effectsAreObjects: project.clips.every((clip: { effects: unknown[] }) => clip.effects.every((effect) => typeof effect === 'object' && effect !== null)),
        tracksHaveEq: project.tracks.every((track: { eq?: unknown }) => typeof track.eq === 'object'),
        easingPreserved: project.clips.some((clip: { keyframes: Array<{ easing?: string }> }) => clip.keyframes.some((frame) => frame.easing === 'linear'))
      };
    });
    expect(check.version).toBe(2);
    expect(check.masterEq).toHaveLength(10);
    expect(check.effectsAreObjects).toBe(true);
    expect(check.tracksHaveEq).toBe(true);
    expect(check.easingPreserved).toBe(true);
  });
});

test('auto-key writes a keyframe when a transform changes at the playhead', async ({ page }) => {
  await page.goto('/');
  await addFixtureClip(page);
  await page.locator('.topbar-actions .icon-btn[title="Settings (Ctrl+,)"]').click();
  await page.locator('.settings-nav button', { hasText: 'Timeline' }).click();
  await page.locator('.toggle-row', { hasText: 'Auto-key by default' }).locator('.switch').click();
  await page.locator('.settings-topbar .btn-primary').click();
  await page.locator('.timeline-clip').first().click({ position: { x: 70, y: 25 } });
  const ruler = await page.locator('.timeline-ruler').boundingBox();
  if (!ruler) throw new Error('ruler was not visible');
  const zoom = Number((await page.locator('.zoom-readout').innerText()).match(/\d+/)?.[0] || 44);
  await page.mouse.click(ruler.x + zoom * 2, ruler.y + 14);
  const opacity = page.locator('.inspector-section', { hasText: 'Transform' }).first()
    .locator('.slider-row', { hasText: 'Opacity' }).locator('input[type=range]');
  await opacity.focus();
  for (let index = 0; index < 6; index++) await opacity.press('ArrowLeft');
  await expect(page.locator('.keyframe-block')).toHaveCount(1);
  await expect(page.locator('.keyframe-lane')).toHaveCount(1);
});

test('extracts audio from a video clip to the bottom audio track', async ({ page }) => {
  await page.goto('/');
  await addFixtureClip(page);
  await page.locator('.timeline-clip').first().click({ button: 'right', position: { x: 60, y: 25 } });
  await expect(page.locator('.context-menu')).toBeVisible();
  await page.locator('.context-menu button', { hasText: 'Extract audio' }).click();
  await expect(page.locator('.timeline-clip.clip-audio')).toHaveCount(1);
  await expect(page.locator('.track-header')).toHaveCount(5);
  await page.waitForTimeout(700);
  const levels = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
    return project.clips.map((clip: { kind: string; volume: number }) => ({ kind: clip.kind, volume: clip.volume }));
  });
  expect(levels.find((clip: { kind: string }) => clip.kind === 'video')?.volume).toBe(0);
  expect(levels.find((clip: { kind: string }) => clip.kind === 'audio')?.volume).toBeGreaterThan(0);
});

test('Ctrl+A selects all clips and leaves document text alone', async ({ page }) => {
  await page.goto('/');
  await addThreeClips(page);
  await page.keyboard.press('Control+a');
  await expect(page.locator('.timeline-clip.is-selected')).toHaveCount(3);
  expect(await page.evaluate(() => window.getSelection()?.toString() || '')).toBe('');
});

test('Ctrl+drag marquee selects intersecting clips', async ({ page }) => {
  await page.goto('/');
  await addThreeClips(page);
  const content = await page.locator('.timeline-content').boundingBox();
  const titleRow = await page.locator('.track-row').first().boundingBox();
  const mainRow = await page.locator('.track-row.track-video').first().boundingBox();
  const zoom = Number((await page.locator('.zoom-readout').innerText()).match(/\d+/)?.[0] || 68);
  if (!content || !titleRow || !mainRow) throw new Error('timeline geometry missing');
  await page.keyboard.down('Control');
  await page.mouse.move(content.x + 5, titleRow.y + 6);
  await page.mouse.down();
  await page.mouse.move(content.x + zoom * 6, mainRow.y + mainRow.height - 5, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('.timeline-clip.is-selected')).toHaveCount(2);
});

test('Space plays instead of activating a focused toolbar button', async ({ page }) => {
  await page.goto('/');
  await addFixtureClip(page);
  await page.locator('.rail-tab[title="Audio (2)"]').click();
  await page.keyboard.press('Space');
  await expect(page.locator('.preview-panel')).toHaveClass(/is-playing/);
  await page.keyboard.press('Space');
  await expect(page.locator('.preview-panel')).not.toHaveClass(/is-playing/);
});

test('reports AMD hardware capabilities without breaking CPU fallback', async ({ request }) => {
  const response = await request.get('/api/capabilities');
  expect(response.ok()).toBe(true);
  const capabilities = await response.json();
  expect(capabilities.version).toBe('1.15.0');
  expect(capabilities.hardware).toBeTruthy();
  expect(capabilities.hardware.preferredFor).toHaveProperty('mp4');
  expect(capabilities.hardware.preferredFor).toHaveProperty('webm');
  expect(Array.isArray(capabilities.hardware.encoders)).toBe(true);
  expect(capabilities.software.h264).toBeTruthy();
  expect(capabilities.software.vp9).toBeTruthy();
  expect(capabilities.codecs).toHaveProperty('h264');
  expect(capabilities.codecs).toHaveProperty('hevc');
  expect(capabilities.codecs).toHaveProperty('av1');
  expect(capabilities.codecs.h264.maxBitDepth).toBe(8);
  expect(capabilities.codecs.hevc.maxBitDepth).toBe(10);
  expect(capabilities.codecs.av1.maxBitDepth).toBe(10);
});

test('codec picker handles 8-bit H.264 and 10-bit HDR AV1', async ({ page, request }) => {
  const capabilityResponse = await request.get('/api/capabilities');
  const capabilities = await capabilityResponse.json();
  const av1Available = Boolean(capabilities.codecs.av1.software || capabilities.codecs.av1.hardware);
  test.skip(!av1Available, 'This FFmpeg build has no AV1 encoder.');

  await page.goto('/');
  await page.locator('.export-btn').click();
  await expect(page.locator('.codec-cards button')).toHaveCount(4);
  const h264 = page.locator('.codec-cards button', { hasText: 'H.264' });
  const av1 = page.locator('.codec-cards button', { hasText: 'AV1' });
  const tenBit = page.locator('.export-option-row .segmented button', { hasText: '10-bit' }).first();
  const hdr = page.locator('.export-hdr-control .switch');

  await h264.click();
  await expect(page.locator('.export-summary')).toContainText('H.264 8-bit');
  await expect(tenBit).toBeDisabled();

  await av1.click();
  await expect(tenBit).toBeEnabled();
  await tenBit.click();
  await expect(hdr).toBeEnabled();
  await hdr.click();
  await expect(page.locator('.export-summary')).toContainText('AV1 10-bit HDR10');
});

test('serves local caption capabilities and exposes the auto caption card', async ({ page, request }) => {
  const response = await request.get('/api/captions/capabilities');
  expect(response.ok()).toBe(true);
  const capabilities = await response.json();
  expect(capabilities.runtime.available).toBe(true);
  expect(capabilities.runtime.vulkan || capabilities.runtime.cpu).toBe(true);
  expect(Array.isArray(capabilities.models)).toBe(true);
  expect(capabilities.models.some((model: { id: string }) => model.id === 'large-v3-turbo-q5_0')).toBe(true);
  expect(capabilities.models[0]).toHaveProperty('installed');

  const bad = await request.post('/api/captions/jobs', { data: {} });
  expect(bad.status()).toBe(400);

  await page.goto('/');
  await page.locator('.rail-tab[title="Captions (8)"]').click();
  await expect(page.locator('.auto-captions-card')).toBeVisible();
  await expect(page.locator('.auto-captions-start')).toBeVisible();
});

test('keeps canvas labels legible and media hint balanced', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const aspectGrid = page.locator('.aspect-grid');
  await expect(aspectGrid).toBeVisible();
  const idSizes = await aspectGrid.locator('.aspect-id').evaluateAll((nodes) =>
    nodes.map((node) => parseFloat(getComputedStyle(node).fontSize))
  );
  expect(Math.min(...idSizes)).toBeGreaterThanOrEqual(8);

  const hint = page.locator('.panel-actions-hint');
  await expect(hint).toBeVisible();
  await expect(hint.locator('span')).toHaveCount(2);
  const hintMetrics = await hint.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth
  }));
  expect(hintMetrics.scrollWidth).toBeLessThanOrEqual(hintMetrics.clientWidth + 1);
  expect(await page.locator('.media-name').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(13);
  expect(await page.locator('.track-name').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(13);
});
test('context menu and playhead stay aligned at 120% UI scale', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lumacut.settings.v1', JSON.stringify({ scale: 120 })));
  await page.goto('/');
  await addFixtureClip(page);
  const clip = await page.locator('.timeline-clip').first().boundingBox();
  if (!clip) throw new Error('clip missing');
  const clickX = clip.x + 45;
  const clickY = clip.y + 25;
  await page.mouse.click(clickX, clickY, { button: 'right' });
  await page.locator('.context-menu').waitFor();
  await page.waitForTimeout(150);
  const menu = await page.locator('.context-menu').boundingBox();
  if (!menu) throw new Error('menu missing');
  expect(Math.abs(menu.x - clickX)).toBeLessThan(25);
  expect(menu.y).toBeGreaterThanOrEqual(0);
  expect(menu.y + menu.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight) + 2);

  await page.keyboard.press('Escape');
  const ruler = await page.locator('.timeline-ruler').boundingBox();
  if (!ruler) throw new Error('ruler missing');
  const offset = 320;
  await page.mouse.click(ruler.x + offset, ruler.y + 14);
  const playhead = await page.locator('.timeline-playhead').boundingBox();
  if (!playhead) throw new Error('playhead missing');
  expect(Math.abs((playhead.x - ruler.x) - offset)).toBeLessThan(2);
});
test('visualizer lives in the Sound panel and gain reaches 1000%', async ({ page }) => {
  await page.goto('/');
  await addFixtureAudio(page);
  await expect(page.locator('.preview-panel .audio-visualizer')).toHaveCount(0);
  await expect(page.locator('.audio-panel .audio-visualizer')).toHaveCount(1);
  await expect(page.locator('.audio-panel .audio-analyser-card .segmented button')).toHaveCount(3);

  const master = page.locator('.volume-range');
  expect(await master.getAttribute('max')).toBe('10');
  await master.focus();
  await master.press('End');
  await expect(page.locator('.volume-percent')).toHaveText('1000%');

  await page.locator('.timeline-clip.clip-audio').first().click({ position: { x: 80, y: 20 } });
  const audioSection = page.locator('.inspector-section', { hasText: 'Audio' }).first();
  const volume = audioSection.locator('.slider-row', { hasText: 'Volume' }).locator('input[type=range]').first();
  const trackLevel = audioSection.locator('.slider-row', { hasText: 'Track level' }).locator('input[type=range]').first();
  expect(await volume.getAttribute('max')).toBe('1000');
  expect(await trackLevel.getAttribute('max')).toBe('1000');
  await volume.focus();
  await volume.press('End');
  expect(await volume.inputValue()).toBe('1000');
});
test('ripple delete closes same-track gaps and can be toggled off', async ({ page }) => {
  await page.goto('/');
  await addThreeClips(page);
  const starts = () => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
    return (project.clips || []).map((clip: { start: number }) => clip.start).sort((a: number, b: number) => a - b);
  });

  await page.locator('.timeline-clip').nth(1).click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(700);
  expect(await starts()).toEqual([0, 4]);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await page.locator('.timeline-tool[title^="Ripple delete"]').click();
  await expect(page.locator('.timeline-tool[title^="Ripple delete"]')).not.toHaveClass(/is-active/);
  await page.locator('.timeline-clip').nth(1).click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(700);
  expect(await starts()).toEqual([0, 8]);
});
test('agent command API supports live sync, commands, proposals and ripple edits', async ({ request }) => {
  const agentToken = 'agent-test-token-1234567890';
  const agentHeaders = { 'x-lumacut-agent-token': agentToken };
  const capabilities = await request.get('/api/agent/capabilities');
  expect(capabilities.ok()).toBeTruthy();
  const caps = await capabilities.json();
  expect(caps.commands.some((command: { type: string }) => command.type === 'clip.delete')).toBe(true);
  const cropCommand = caps.commands.find((command: { type: string }) => command.type === 'clip.crop');
  expect(cropCommand?.params?.properties?.source).toBeTruthy();

  const base = {
    id: 'clip-a', trackId: 'track-main', kind: 'video', name: 'A', assetId: videoAssetId,
    start: 0, duration: 4, trimIn: 0, speed: 1, volume: 1, opacity: 1, x: 0, y: 0, scale: 1,
    rotation: 0, blend: 'source-over', filter: 'none', filterIntensity: 65, effects: [],
    fadeIn: 0, fadeOut: 0, audioFadeIn: 0, audioFadeOut: 0, keyframes: []
  };
  const project = {
    id: 'agent-test', version: 2, name: 'Agent test', width: 1920, height: 1080, fps: 30,
    background: '#000000', masterEq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    tracks: [
      { id: 'track-main', name: 'Main', kind: 'video', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: { low: 0, mid: 0, high: 0 } },
      { id: 'track-audio', name: 'Audio', kind: 'audio', muted: false, hidden: false, locked: false, solo: false, gain: 1, eq: { low: 0, mid: 0, high: 0 } }
    ],
    clips: [base, { ...base, id: 'clip-b', name: 'B', start: 6 }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const sessionResponse = await request.post('/api/agent/sessions', { data: { project, token: agentToken } });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  expect(session.id).toBeTruthy();

  const live = await (await request.get('/api/agent/current', { headers: agentHeaders })).json();
  expect(live.id).toBe(session.id);
  const synced = await request.post(`/api/agent/sessions/${session.id}/sync`, {
    headers: agentHeaders,
    data: { project: { ...project, name: 'Agent synced' }, baseRevision: session.revision }
  });
  expect(synced.ok()).toBeTruthy();
  expect((await synced.json()).project.name).toBe('Agent synced');

  const deleteResponse = await request.post(`/api/agent/sessions/${session.id}/commands`, {
    headers: agentHeaders,
    data: { commands: [{ type: 'clip.delete', clipIds: ['clip-a'], ripple: true }] }
  });
  expect(deleteResponse.ok()).toBeTruthy();
  const deleted = await deleteResponse.json();
  expect(deleted.project.clips.find((clip: { id: string }) => clip.id === 'clip-b').start).toBe(2);
  expect(deleted.diff.clips.removed).toHaveLength(1);

  const splitResponse = await request.post(`/api/agent/sessions/${session.id}/commands`, {
    headers: agentHeaders,
    data: { commands: [{ type: 'clip.split', clipId: 'clip-b', at: 4 }] }
  });
  expect(splitResponse.ok()).toBeTruthy();
  const split = await splitResponse.json();
  expect(split.project.clips).toHaveLength(2);

  const addResponse = await request.post(`/api/agent/sessions/${session.id}/commands`, {
    headers: agentHeaders,
    data: { commands: [{ type: 'clip.add', assetId: videoAssetId, start: 10, trackId: 'track-main' }] }
  });
  expect(addResponse.ok()).toBeTruthy();
  const added = await addResponse.json();
  expect(added.project.clips).toHaveLength(3);

  const cropResponse = await request.post(`/api/agent/sessions/${session.id}/commands`, {
    headers: agentHeaders,
    data: { commands: [{ type: 'clip.crop', clipId: 'clip-b', source: { x: 0, y: 0, width: 500, height: 300 } }] }
  });
  expect(cropResponse.ok()).toBeTruthy();

  const frameResponse = await request.get(`/api/agent/sessions/${session.id}/frame?at=3&w=640`, { headers: agentHeaders });
  expect(frameResponse.ok()).toBeTruthy();
  expect(frameResponse.headers()['content-type']).toContain('image/jpeg');
  expect((await frameResponse.body()).length).toBeGreaterThan(1000);

  const sheetResponse = await request.get(`/api/agent/sessions/${session.id}/sheet?from=2&to=6&step=2&w=320`, { headers: agentHeaders });
  expect(sheetResponse.ok()).toBeTruthy();
  expect(sheetResponse.headers()['content-type']).toContain('image/jpeg');

  const proxyResponse = await request.post(`/api/agent/sessions/${session.id}/proxy`, {
    headers: agentHeaders, data: { from: 2, to: 4, width: 320, fps: 1 }
  });
  expect(proxyResponse.ok()).toBeTruthy();
  const proxy = await proxyResponse.json();
  expect(proxy.url).toMatch(/^\/exports\/agent-proxy-.*\.mp4$/);
  expect(proxy.caveat).toContain('top visible');
  expect((await request.get(proxy.url)).ok()).toBeTruthy();

  const analysisResponse = await request.get(`/api/assets/${videoAssetId}/analysis`);
  expect(analysisResponse.ok()).toBeTruthy();
  const analysis = await analysisResponse.json();
  expect(Array.isArray(analysis.sceneCuts)).toBe(true);

  const dryRun = await request.post(`/api/agent/sessions/${session.id}/commands`, {
    headers: agentHeaders,
    data: { dryRun: true, commands: [{ type: 'clip.move', clipId: 'clip-b', start: 8 }] }
  });
  expect(dryRun.ok()).toBeTruthy();
  expect((await dryRun.json()).project.clips.find((clip: { id: string }) => clip.id === 'clip-b').start).toBe(8);
  const unchanged = await (await request.get(`/api/agent/sessions/${session.id}`, { headers: agentHeaders })).json();
  expect(unchanged.project.clips.find((clip: { id: string }) => clip.id === 'clip-b').start).toBe(2);

  const proposalResponse = await request.post(`/api/agent/sessions/${session.id}/proposals`, {
    headers: agentHeaders,
    data: { rationale: 'Move the second shot earlier', commands: [{ type: 'clip.move', clipId: 'clip-b', start: 8 }] }
  });
  expect(proposalResponse.ok()).toBeTruthy();
  const proposal = await proposalResponse.json();
  const applyResponse = await request.post(`/api/agent/sessions/${session.id}/proposals/${proposal.id}/apply`, { headers: agentHeaders });
  expect(applyResponse.ok()).toBeTruthy();
  const applied = await applyResponse.json();
  expect(applied.project.clips.find((clip: { id: string }) => clip.id === 'clip-b').start).toBe(8);

  const bad = await request.post(`/api/agent/sessions/${session.id}/commands`, { headers: agentHeaders, data: { commands: [{ type: 'nope' }] } });
  expect(bad.status()).toBe(400);
  await request.delete(`/api/agent/sessions/${session.id}`, { headers: agentHeaders });
});
test('Agent Bridge settings exposes a live MCP config', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+,');
  await page.locator('.settings-nav button', { hasText: 'Agent bridge' }).click();
  await expect(page.locator('.agent-bridge-copy h3')).toHaveText('Give your agent the timeline.');
  const toggle = page.locator('.agent-bridge-card .switch');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.agent-bridge-status')).toContainText('Live');
  await expect(page.locator('.agent-bridge-field code').nth(1)).toContainText('lc_');
  await expect(page.locator('.agent-bridge-config pre')).toContainText('LUMACUT_AGENT_TOKEN');
  await expect(page.locator('.agent-bridge-config pre')).toContainText('mcp.mjs');
  await toggle.click();
  await expect(page.locator('.agent-bridge-status')).toContainText('Off');
});
test('MCP stdio bridge exposes project and command tools', async ({ request }) => {
  const token = 'mcp-test-token-1234567890';
  const headers = { 'x-lumacut-agent-token': token };
  const project = {
    id: 'mcp-test', version: 2, name: 'MCP test', width: 1920, height: 1080, fps: 30,
    background: '#000000', tracks: [{ id: 'track-main', name: 'Main', kind: 'video', muted: false, hidden: false, locked: false }],
    clips: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const sessionResponse = await request.post('/api/agent/sessions', { data: { project, token } });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) as Record<string, string>;
  env.LUMACUT_AGENT_URL = API;
  env.LUMACUT_AGENT_TOKEN = token;
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(process.cwd(), 'server/mcp.mjs')],
    env
  });
  const client = new Client({ name: 'lumacut-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['get_project', 'get_thumbnail', 'get_asset_analysis', 'get_frame', 'get_contact_sheet', 'render_proxy', 'apply_commands', 'create_proposal', 'apply_proposal']));
    const result = await client.callTool({ name: 'get_project', arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.type).toBe('text');
    expect(content[0]?.text).toContain('MCP test');
  } finally {
    await client.close();
    await request.delete(`/api/agent/sessions/${session.id}`, { headers });
  }
});
test('live Agent Bridge applies an agent command to the open editor', async ({ page, request }) => {
  await page.goto('/');
  await addFixtureClip(page);
  await page.keyboard.press('Control+,');
  await page.locator('.settings-nav button', { hasText: 'Agent bridge' }).click();
  await page.locator('.agent-bridge-card .switch').click();
  await expect(page.locator('.agent-bridge-status')).toContainText('Live');
  const configText = await page.locator('.agent-bridge-config pre').textContent();
  const config = JSON.parse(configText || '{}');
  const token = config.mcpServers.lumacut.env.LUMACUT_AGENT_TOKEN as string;
  const headers = { 'x-lumacut-agent-token': token };
  const current = await (await request.get('/api/agent/current', { headers })).json();
  const clipId = current.project.clips[0].id as string;
  const changed = await request.post(`/api/agent/sessions/${current.id}/commands`, {
    headers,
    data: { commands: [{ type: 'clip.set', clipId, patch: { volume: 0.15 } }] }
  });
  expect(changed.ok()).toBeTruthy();
  await expect(page.locator('.agent-live-pill')).toContainText('Agent updated');
  await expect.poll(async () => page.evaluate((id) => {
    const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
    return project.clips?.find((clip: { id: string }) => clip.id === id)?.volume;
  }, clipId), { timeout: 6000 }).toBe(0.15);
});
test('imports the entire duration of a long clip', async ({ page }) => {
  await page.goto('/');
  await page.locator('.media-card', { hasText: 'lumacut-long-fixture' }).dblclick();
  await expect(page.locator('.timeline-clip')).toHaveCount(1);
  await page.waitForTimeout(700);
  const duration = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
    return project.clips?.[0]?.duration as number;
  });
  expect(duration).toBeGreaterThan(17.5);
});

test('Ctrl+wheel zooms the timeline around the pointer', async ({ page }) => {
  await page.goto('/');
  const readZoom = async () => Number((await page.locator('.zoom-readout').innerText()).match(/\d+/)?.[0] || 0);
  await page.locator('.timeline-tool[title="Zoom out"]').click();
  await page.locator('.timeline-tool[title="Zoom out"]').click();
  const before = await readZoom();
  const scroller = page.locator('.timeline-scroll');
  const box = await scroller.boundingBox();
  if (!box) throw new Error('timeline scroller is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + 80);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -260);
  await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  expect(await readZoom()).toBeGreaterThan(before);
});

test('applies caption-specific animations to all cues and new cues', async ({ page }) => {
  await page.goto('/');
  await page.locator('.rail-tab', { hasText: 'Captions' }).click();
  await page.locator('.caption-compose textarea').first().fill('Caption animation test');
  await page.locator('.caption-compose .btn-primary').first().click();
  await expect(page.locator('.timeline-clip.clip-text')).toHaveCount(1);
  await page.locator('.caption-animation-grid button', { hasText: 'Typewriter' }).click();
  await page.waitForTimeout(700);
  const animation = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
    return project.clips?.find((clip: { caption?: boolean }) => clip.caption)?.text?.animation;
  });
  expect(animation).toBe('typewriter');
  await page.locator('.caption-animation-grid button', { hasText: 'Bounce' }).click();
  await page.waitForTimeout(700);
  const bounce = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lumacut.project.v1') || '{}');
    return project.clips?.find((clip: { caption?: boolean }) => clip.caption)?.text?.animation;
  });
  expect(bounce).toBe('bounce');
});
test('Pixabay panel shows attribution and requires an API key', async ({ page, request }) => {
  const noKey = await request.get('/api/pixabay/search?type=video&q=ocean');
  expect(noKey.status()).toBe(400);
  expect((await noKey.json()).code).toBe('missing-key');
  const badImport = await request.post('/api/pixabay/import', {
    headers: { 'x-pixabay-key': 'test-key' },
    data: { type: 'video', downloadUrl: 'https://example.com/not-pixabay.mp4' }
  });
  expect(badImport.status()).toBe(400);

  await page.goto('/');
  await page.locator('.media-source-tabs button', { hasText: 'Pixabay' }).click();
  await expect(page.locator('.pixabay-connect')).toContainText('Free stock media');
  await expect(page.locator('.pixabay-connect')).toContainText('Pixabay Content License');
});

test('Pixabay search renders clean attributed results', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lumacut.settings.v1', JSON.stringify({ pixabayApiKey: 'test-pixabay-key' }));
  });
  await page.route('**/api/pixabay/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'Pixabay',
        total: 1,
        totalHits: 1,
        page: 1,
        perPage: 12,
        hits: [{
          provider: 'Pixabay', id: '123', type: 'video', kind: 'video', title: 'Ocean Waves',
          tags: 'ocean, waves', thumbnail: '', downloadUrl: 'https://cdn.pixabay.com/video/123.mp4',
          pageURL: 'https://pixabay.com/videos/id-123/', width: 1920, height: 1080, duration: 12,
          size: 123456, creator: 'Pixabay Creator', creatorUrl: 'https://pixabay.com/users/creator-1/',
          license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/'
        }],
        attribution: {
          text: 'Photos and videos from Pixabay', url: 'https://pixabay.com/',
          license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/'
        }
      })
    });
  });
  await page.goto('/');
  await page.locator('.media-source-tabs button', { hasText: 'Pixabay' }).click();
  await page.locator('.pixabay-search input').fill('ocean');
  await page.locator('.pixabay-search button').click();
  await expect(page.locator('.pixabay-card')).toHaveCount(1);
  await expect(page.locator('.pixabay-card')).toContainText('Ocean Waves');
  await expect(page.locator('.pixabay-card-badge')).toHaveText('Pixabay');
  await expect(page.locator('.pixabay-card-copy a')).toContainText('Pixabay Creator on Pixabay');
  await expect(page.locator('.pixabay-footer')).toContainText('Pixabay Content License');
});
test('resizes both side panels and persists their widths', async ({ page }) => {
  await page.goto('/');
  const leftPanel = page.locator('.asset-panel');
  const rightPanel = page.locator('.inspector');
  const leftBefore = (await leftPanel.boundingBox())!.width;
  const rightBefore = (await rightPanel.boundingBox())!.width;
  const leftHandle = await page.locator('.panel-resizer[data-side="left"]').boundingBox();
  if (!leftHandle) throw new Error('left panel resizer missing');
  await page.mouse.move(leftHandle.x + 2, leftHandle.y + 260);
  await page.mouse.down();
  await page.mouse.move(leftHandle.x + 92, leftHandle.y + 260, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await leftPanel.boundingBox())!.width).toBeGreaterThan(leftBefore + 60);
  const rightHandle = await page.locator('.panel-resizer[data-side="right"]').boundingBox();
  if (!rightHandle) throw new Error('right panel resizer missing');
  await page.mouse.move(rightHandle.x + 2, rightHandle.y + 260);
  await page.mouse.down();
  await page.mouse.move(rightHandle.x - 92, rightHandle.y + 260, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await rightPanel.boundingBox())!.width).toBeGreaterThan(rightBefore + 60);
  const widths = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('lumacut.settings.v1') || '{}');
    return { left: settings.leftPanelWidth, right: settings.rightPanelWidth };
  });
  expect(widths.left).toBeGreaterThan(leftBefore + 60);
  expect(widths.right).toBeGreaterThan(rightBefore + 60);
});

test('Lots of Sounds search renders effects with attribution', async ({ page }) => {
  await page.route('**/api/sounds/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'Lots of Sounds',
        hits: [{
          provider: 'Lots of Sounds', id: 'fs-11587', name: 'Microwave Ding',
          description: 'Short notification ding when a microwave finishes',
          tags: ['ding', 'notification', 'kitchen'], duration: 2.9,
          previewUrl: '/api/sounds/stream/fs-11587', pageURL: 'https://www.lotsofsounds.com/',
          license: 'CC0 sample · Lots of Sounds', licenseUrl: 'https://www.lotsofsounds.com/license'
        }],
        attribution: {
          text: 'Sound effects from Lots of Sounds', url: 'https://www.lotsofsounds.com/',
          license: 'CC0 sample collection', licenseUrl: 'https://www.lotsofsounds.com/license'
        }
      })
    });
  });
  await page.goto('/');
  await page.locator('.rail-tab[title="Audio (2)"]').click();
  await page.locator('.media-source-tabs button', { hasText: 'Sound effects' }).click();
  await page.locator('.sounds-search input').fill('notification');
  await page.locator('.sounds-search button').click();
  await expect(page.locator('.sound-card')).toHaveCount(1);
  await expect(page.locator('.sound-card')).toContainText('Microwave Ding');
  await expect(page.locator('.sound-tags')).toContainText('notification');
  await expect(page.locator('.sounds-attribution')).toContainText('Lots of Sounds');
  await expect(page.locator('.sounds-attribution')).toContainText('CC0');
});
test('TikTok import refuses non-TikTok links and requires consent', async ({ page, request }) => {
  const capabilities = await request.get('/api/tiktok/capabilities');
  expect(capabilities.ok()).toBeTruthy();
  expect(typeof (await capabilities.json()).available).toBe('boolean');

  const invalid = await request.post('/api/tiktok/import', {
    data: { url: 'https://example.com/video/1', confirmed: true }
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).toBe('invalid-url');

  const consent = await request.post('/api/tiktok/import', {
    data: { url: 'https://www.tiktok.com/@creator/video/1234567890', confirmed: false }
  });
  expect(consent.status()).toBe(428);
  expect((await consent.json()).code).toBe('consent-required');

  await page.goto('/');
  await page.locator('.rail-tab[title="Audio (2)"]').click();
  await expect(page.locator('.tiktok-audio-card')).toContainText('Use the sound from a TikTok video');
  const extractButton = page.locator('.tiktok-url-row .btn');
  await expect(extractButton).toBeDisabled();
  await page.locator('.tiktok-url-row input').fill('https://www.tiktok.com/@creator/video/1234567890');
  await page.locator('.tiktok-consent input').check();
  await expect(extractButton).toBeEnabled();
});
test('storage reports disk usage and exposes cleanup controls', async ({ page, request }) => {
  const usage = await request.get('/api/storage');
  expect(usage.ok()).toBeTruthy();
  const data = await usage.json();
  expect(typeof data.total).toBe('number');
  expect(data.media).toHaveProperty('bytes');
  expect(data.frames).toHaveProperty('files');
  expect(data.assets).toBeGreaterThanOrEqual(0);

  await page.goto('/');
  await page.locator('.topbar-actions .icon-btn[title="Settings (Ctrl+,)"]').click();
  await page.locator('.settings-nav button', { hasText: 'Storage' }).click();
  await expect(page.locator('.settings-content')).toContainText('Disk usage');
  await expect(page.locator('.settings-content')).toContainText('Generated frame cache');
  await expect(page.locator('.settings-content')).toContainText('Unused library media');
  await expect(page.locator('.settings-content')).toContainText('Exports');
});

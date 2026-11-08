import fs from 'node:fs';
import path from 'node:path';
import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const API = 'http://127.0.0.1:4317';
const videoFixture = path.join(process.cwd(), 'tests/fixtures/lumacut-test-fixture.mp4');
const audioFixture = path.join(process.cwd(), 'tests/fixtures/lumacut-test-audio.wav');
let api: APIRequestContext;
let videoAssetId = '';
let audioAssetId = '';

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
  expect(capabilities.version).toBe('1.6.1');
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

test('keeps canvas labels legible and media hint on one line', async ({ page }) => {
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
  const hintMetrics = await hint.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    whiteSpace: getComputedStyle(node).whiteSpace
  }));
  expect(hintMetrics.whiteSpace).toBe('nowrap');
  expect(hintMetrics.scrollWidth).toBeLessThanOrEqual(hintMetrics.clientWidth + 1);
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

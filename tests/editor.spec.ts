import { test, expect } from '@playwright/test';

test.describe('LumaCut editor', () => {
  test('boots the demo film and paints the program monitor', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.timeline-clip')).toHaveCount(17);
    await expect(page.locator('.transport-current')).toContainText('00:00:02');
    await expect(page.locator('.track-header')).toHaveCount(5);
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
    const aurora = page.locator('.timeline-clip', { hasText: 'Aurora Drift' }).first();
    await aurora.click({ position: { x: 60, y: 25 } });
    await page.keyboard.press('b');
    await expect(page.locator('.timeline-clip')).toHaveCount(18);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.timeline-clip')).toHaveCount(17);
  });

  test('adds a new title on its own free track', async ({ page }) => {
    await page.goto('/');
    await page.locator('.rail-tab[title="Text (3)"]').click();
    await page.locator('.text-preset-card').first().click();
    await expect(page.locator('.timeline-clip')).toHaveCount(18);
    await expect(page.locator('.track-header')).toHaveCount(6);
    await expect(page.locator('.clip-name-input')).toHaveValue('Editorial');
    await expect(page.locator('.transform-box')).toHaveCount(1);
  });

  test('serves the media API', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).ok).toBe(true);
    const assets = await request.get('/api/assets');
    expect(assets.ok()).toBeTruthy();
    expect((await assets.json()).length).toBeGreaterThanOrEqual(9);
  });
});

test.describe('LumaCut 1.1 rework', () => {
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
    await page.locator('.timeline-clip', { hasText: 'Aurora Drift' }).first().click({ position: { x: 60, y: 25 } });
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
    await page.locator('.rail-tab[title="Audio (2)"]').click();
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
  await page.locator('.topbar-actions .icon-btn[title="Settings (Ctrl+,)"]').click();
  await page.locator('.settings-nav button', { hasText: 'Timeline' }).click();
  await page.locator('.toggle-row', { hasText: 'Auto-key by default' }).locator('.switch').click();
  await page.locator('.settings-topbar .btn-primary').click();
  await page.locator('.timeline-clip', { hasText: 'Aurora Drift' }).first().click({ position: { x: 70, y: 25 } });
  const ruler = await page.locator('.timeline-ruler').boundingBox();
  if (!ruler) throw new Error('ruler was not visible');
  const zoom = Number((await page.locator('.zoom-readout').innerText()).match(/\d+/)?.[0] || 44);
  await page.mouse.click(ruler.x + zoom * 4, ruler.y + 14);
  const opacity = page.locator('.inspector-section', { hasText: 'Transform' }).first()
    .locator('.slider-row', { hasText: 'Opacity' }).locator('input[type=range]');
  await opacity.focus();
  for (let index = 0; index < 6; index++) await opacity.press('ArrowLeft');
  await expect(page.locator('.keyframe-block')).toHaveCount(1);
  await expect(page.locator('.keyframe-lane')).toHaveCount(1);
});

test('reports AMD hardware capabilities without breaking CPU fallback', async ({ request }) => {
  const response = await request.get('/api/capabilities');
  expect(response.ok()).toBe(true);
  const capabilities = await response.json();
  expect(capabilities.version).toBe('1.4.1');
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
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  const aspectGrid = page.locator('.aspect-grid');
  await expect(aspectGrid).toBeVisible();
  const idSizes = await aspectGrid.locator('.aspect-id').evaluateAll((nodes) =>
    nodes.map((node) => parseFloat(getComputedStyle(node).fontSize))
  );
  expect(Math.min(...idSizes)).toBeGreaterThanOrEqual(8);

  const mediaTab = page.locator('.rail-tab[title="Media (1)"]');
  await mediaTab.click();
  const hint = page.locator('.panel-actions-hint');
  if (!(await hint.isVisible().catch(() => false))) await mediaTab.click();
  await expect(hint).toBeVisible();
  const hintMetrics = await hint.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    whiteSpace: getComputedStyle(node).whiteSpace
  }));
  expect(hintMetrics.whiteSpace).toBe('nowrap');
  expect(hintMetrics.scrollWidth).toBeLessThanOrEqual(hintMetrics.clientWidth + 1);
});

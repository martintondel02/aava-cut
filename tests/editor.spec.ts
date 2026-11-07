import { test, expect } from '@playwright/test';

test.describe('LumaCut editor', () => {
  test('boots the demo film and paints the program monitor', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.timeline-clip')).toHaveCount(17);
    await expect(page.locator('.transport-current')).toContainText('00:00:02');
    await expect(page.locator('.track-header')).toHaveCount(5);
    const litPixels = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
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

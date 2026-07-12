import { expect, test } from '@playwright/test';

test('canvas exists and has nonzero dimensions', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#seat-canvas');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();

  expect(rect).not.toBeNull();
  expect((rect && rect.width) || 0).toBeGreaterThan(0);
  expect((rect && rect.height) || 0).toBeGreaterThan(0);
});

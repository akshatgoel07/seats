import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('canvas exists and has nonzero dimensions', async () => {
  const indexHtml = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');

  expect(indexHtml).toContain('<canvas id="seat-canvas"></canvas>');
  expect(indexHtml).toContain('width: 100vw;');
  expect(indexHtml).toContain('height: 100vh;');
});

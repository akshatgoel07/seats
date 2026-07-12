import { expect, test } from '@playwright/test';
import { inflateSync } from 'node:zlib';

interface BrowserGpuDevice {
  destroy?: () => void;
}

interface BrowserGpuAdapter {
  requestDevice(): Promise<BrowserGpuDevice>;
}

interface BrowserGpuApi {
  requestAdapter(): Promise<BrowserGpuAdapter | null>;
}

interface BrowserNavigatorWithGpu extends Navigator {
  readonly gpu?: BrowserGpuApi;
}

interface PngImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

test('renders the 10k WebGPU demo scene with non-background pixels', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  const support = await page.evaluate(async () => {
    const gpu = (navigator as BrowserNavigatorWithGpu).gpu;

    if (!gpu) {
      return { supported: false, reason: 'navigator.gpu is unavailable in headless Chromium' };
    }

    const adapter = await gpu.requestAdapter();

    if (!adapter) {
      return { supported: false, reason: 'requestAdapter() returned null in headless Chromium' };
    }

    try {
      const device = await adapter.requestDevice();
      device.destroy?.();
      return { supported: true, reason: '' };
    } catch (error) {
      return {
        supported: false,
        reason: `requestDevice() failed in headless Chromium: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  });

  if (!support.supported) {
    test.skip(true, support.reason);
    return;
  }

  await page.goto('/');
  await page.waitForFunction(() => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutDemoStatus?: { readonly state: string };
    };

    return Boolean(
      host.__seatLayoutDemoStatus && host.__seatLayoutDemoStatus.state !== 'initializing',
    );
  });

  const status = await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutDemoStatus?: {
        readonly state: string;
        readonly reason?: string;
        readonly instanceCount?: number;
      };
    };

    return host.__seatLayoutDemoStatus;
  });

  if (status?.state === 'unsupported') {
    test.skip(true, status.reason ?? 'WebGPU became unavailable while loading the demo page');
    return;
  }

  expect(status).toEqual({ state: 'rendered', backend: 'webgpu', instanceCount: 10000 });

  const canvas = page.locator('#seat-canvas');
  const screenshot = await canvas.screenshot();
  const png = decodePngRgba(screenshot);
  const nonBackgroundRatio = countNonWhitePixels(png) / (png.width * png.height);

  expect(nonBackgroundRatio).toBeGreaterThan(0.01);
});

function countNonWhitePixels(image: PngImage): number {
  let nonWhitePixels = 0;

  for (let index = 0; index < image.rgba.length; index += 4) {
    const red = image.rgba[index];
    const green = image.rgba[index + 1];
    const blue = image.rgba[index + 2];
    const alpha = image.rgba[index + 3];

    if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
      nonWhitePixels += 1;
    }
  }

  return nonWhitePixels;
}

function decodePngRgba(buffer: Buffer): PngImage {
  const signature = buffer.subarray(0, 8);

  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error('Expected a PNG screenshot');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkData = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(
      `Unsupported PNG screenshot format: bitDepth=${bitDepth}, colorType=${colorType}`,
    );
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowByteLength = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowByteLength);
  let currentRow = new Uint8Array(rowByteLength);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;

    for (let x = 0; x < rowByteLength; x += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= bytesPerPixel ? currentRow[x - bytesPerPixel] : 0;
      const up = previousRow[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] : 0;

      currentRow[x] = unfilterByte(filterType, raw, left, up, upLeft);
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * bytesPerPixel;
      const targetIndex = (y * width + x) * 4;
      rgba[targetIndex + 0] = currentRow[sourceIndex + 0];
      rgba[targetIndex + 1] = currentRow[sourceIndex + 1];
      rgba[targetIndex + 2] = currentRow[sourceIndex + 2];
      rgba[targetIndex + 3] = colorType === 6 ? currentRow[sourceIndex + 3] : 255;
    }

    const completedRow = currentRow;
    currentRow = previousRow;
    currentRow.fill(0);
    previousRow = completedRow;
  }

  return { width, height, rgba };
}

function unfilterByte(
  filterType: number,
  raw: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  switch (filterType) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter type ${filterType}`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) {
    return left;
  }

  if (distanceUp <= distanceUpLeft) {
    return up;
  }

  return upLeft;
}

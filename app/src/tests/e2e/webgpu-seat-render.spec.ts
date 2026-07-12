import { expect, test, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';

import { generateSeatMap } from '../../fixtures/generate';
import { SEAT_STATE_FLAG_UNAVAILABLE } from '../../shared/instance-layout';
import { flattenSeatMap, type SeatMapDocument } from '../../shared/seat-map';

const DEMO_FIXTURE_SEED = 20260712;

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

test('renders and zooms the 10k stadium WebGPU demo scene', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  const support = await detectWebGpuSupport(page);

  if (!support.supported) {
    test.skip(true, support.reason);
    return;
  }

  await page.goto('/?layout=stadium&seats=10000');
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

  const frameCountBeforeZoom = await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutFrameStats?: { readonly frameCount: number };
    };

    return host.__seatLayoutFrameStats?.frameCount ?? 0;
  });
  const canvasBox = await canvas.boundingBox();

  expect(canvasBox).not.toBeNull();

  if (!canvasBox) {
    return;
  }

  await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.mouse.wheel(0, -720);
  await page.waitForFunction((previousFrameCount) => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutFrameStats?: { readonly frameCount: number };
    };

    return (host.__seatLayoutFrameStats?.frameCount ?? 0) > previousFrameCount;
  }, frameCountBeforeZoom);

  const zoomedScreenshot = await canvas.screenshot();
  const zoomedPng = decodePngRgba(zoomedScreenshot);
  const zoomedNonBackgroundRatio =
    countNonWhitePixels(zoomedPng) / (zoomedPng.width * zoomedPng.height);

  expect(zoomedNonBackgroundRatio).toBeGreaterThan(0.005);
  await exerciseGridInteraction(page);
});

async function exerciseGridInteraction(page: Page): Promise<void> {
  await page.goto('/?layout=grid&seats=1000');
  await waitForRenderedDemo(page, 1000);

  const document = generateSeatMap({
    layout: 'grid',
    seatCount: 1000,
    seed: DEMO_FIXTURE_SEED,
  });
  const flat = flattenSeatMap(document);
  const availableIndex = findSeatIndexByAvailability(flat.stateFlags, true);
  const unavailableIndex = findSeatIndexByAvailability(flat.stateFlags, false);
  const availablePoint = await screenPointForSeat(
    page,
    document,
    flat.x[availableIndex],
    flat.y[availableIndex],
  );
  const unavailablePoint = await screenPointForSeat(
    page,
    document,
    flat.x[unavailableIndex],
    flat.y[unavailableIndex],
  );

  const pickedAvailable = await pickAt(page, availablePoint.x, availablePoint.y);
  expect(pickedAvailable?.seatIndex).toBe(availableIndex);

  await page.mouse.move(availablePoint.x, availablePoint.y);
  await page.waitForFunction((seatIndex) => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutInteractionLog?: Array<{
        readonly type: string;
        readonly payload: { readonly seatIndex?: number } | null;
      }>;
    };

    return host.__seatLayoutInteractionLog?.some(
      (entry) => entry.type === 'seatHover' && entry.payload?.seatIndex === seatIndex,
    );
  }, availableIndex);

  await page.mouse.click(availablePoint.x, availablePoint.y);

  await page.waitForFunction((seatIndex) => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutInteractionLog?: Array<{
        readonly type: string;
        readonly payload: {
          readonly seatIndex?: number;
          readonly selected?: boolean;
          readonly selectedIndices?: readonly number[];
        } | null;
      }>;
    };

    return host.__seatLayoutInteractionLog?.some(
      (entry) =>
        entry.type === 'seatSelect' &&
        entry.payload?.seatIndex === seatIndex &&
        entry.payload.selected === true,
    );
  }, availableIndex);

  await expect(page.locator('#seat-selection-count')).toHaveText('1 selected');
  await expect(
    page.locator(`#seat-selection-list [data-seat-index="${availableIndex}"]`),
  ).toBeVisible();

  const pickedUnavailable = await pickAt(page, unavailablePoint.x, unavailablePoint.y);
  expect(pickedUnavailable?.seatIndex).toBe(unavailableIndex);

  await page.mouse.click(unavailablePoint.x, unavailablePoint.y);
  await expect(page.locator('#seat-selection-count')).toHaveText('1 selected');

  const selectedUnavailableEvents = await page.evaluate((seatIndex) => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutInteractionLog?: Array<{
        readonly type: string;
        readonly payload: { readonly seatIndex?: number; readonly selected?: boolean } | null;
      }>;
    };

    return (
      host.__seatLayoutInteractionLog?.filter(
        (entry) =>
          entry.type === 'seatSelect' &&
          entry.payload?.seatIndex === seatIndex &&
          entry.payload.selected === true,
      ).length ?? 0
    );
  }, unavailableIndex);

  expect(selectedUnavailableEvents).toBe(0);
}

async function detectWebGpuSupport(page: Page): Promise<{ supported: boolean; reason: string }> {
  return page.evaluate(async () => {
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
}

async function waitForRenderedDemo(page: Page, instanceCount: number): Promise<void> {
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

  expect(status).toEqual({ state: 'rendered', backend: 'webgpu', instanceCount });
}

async function screenPointForSeat(
  page: Page,
  document: SeatMapDocument,
  worldX: number,
  worldY: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const canvasMetrics = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#seat-canvas');

    if (!canvas) {
      throw new Error('Expected #seat-canvas');
    }

    const rect = canvas.getBoundingClientRect();
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
  });
  const contentWidth = Math.max(1, document.bounds.maxX - document.bounds.minX);
  const contentHeight = Math.max(1, document.bounds.maxY - document.bounds.minY);
  const paddedWidth = Math.max(1, canvasMetrics.canvasWidth - 80);
  const paddedHeight = Math.max(1, canvasMetrics.canvasHeight - 80);
  const zoom = Math.min(paddedWidth / contentWidth, paddedHeight / contentHeight);
  const centerX = (document.bounds.minX + document.bounds.maxX) * 0.5;
  const centerY = (document.bounds.minY + document.bounds.maxY) * 0.5;
  const screenX = (worldX - centerX) * zoom + canvasMetrics.canvasWidth * 0.5;
  const screenY = (worldY - centerY) * zoom + canvasMetrics.canvasHeight * 0.5;

  return {
    x: canvasMetrics.rectLeft + (screenX / canvasMetrics.canvasWidth) * canvasMetrics.rectWidth,
    y: canvasMetrics.rectTop + (screenY / canvasMetrics.canvasHeight) * canvasMetrics.rectHeight,
  };
}

function findSeatIndexByAvailability(stateFlags: Uint32Array, available: boolean): number {
  for (let index = 0; index < stateFlags.length; index += 1) {
    const isAvailable = (stateFlags[index] & SEAT_STATE_FLAG_UNAVAILABLE) === 0;

    if (isAvailable === available) {
      return index;
    }
  }

  throw new Error(`Expected at least one ${available ? 'available' : 'unavailable'} seat`);
}

async function pickAt(
  page: Page,
  clientX: number,
  clientY: number,
): Promise<{ readonly seatIndex: number; readonly seatId: string } | null> {
  return page.evaluate(
    ([x, y]) => {
      const host = globalThis as typeof globalThis & {
        __seatLayoutPickAt?: (
          clientX: number,
          clientY: number,
        ) => { readonly seatIndex: number; readonly seatId: string } | null;
      };

      return host.__seatLayoutPickAt?.(x, y) ?? null;
    },
    [clientX, clientY] as const,
  );
}

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

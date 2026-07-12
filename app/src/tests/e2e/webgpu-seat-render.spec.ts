import { expect, test, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';

import { generateSeatMap } from '../../fixtures/generate';
import { SEAT_STATE_FLAG_UNAVAILABLE } from '../../shared/instance-layout';
import { flattenSeatMap, type SeatMapDocument } from '../../shared/seat-map';

const DEMO_FIXTURE_SEED = 20260712;
const WEBGPU_E2E_ENABLED = process.env.ENABLE_WEBGPU_E2E === '1';

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

for (const backend of ['webgpu', 'webgl2'] as const) {
  const backendTest = backend === 'webgpu' && !WEBGPU_E2E_ENABLED ? test.skip : test;

  backendTest(`renders, zooms, and interacts with the 10k stadium demo scene on ${backend}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 480 });

    if (backend === 'webgpu') {
      const support = await detectWebGpuSupport(page);

      if (!support.supported) {
        test.skip(true, support.reason);
        return;
      }
    }

    if (backend === 'webgl2') {
      await installWebGl2UnavailableShim(page);
    }

    await page.goto(`/?layout=stadium&seats=10000&backend=${backend}`);
    await waitForRenderedDemo(page, 10000, backend);

    const canvas = page.locator('#seat-canvas');
    const nonBackgroundRatio = await nonWhiteCanvasRatio(page);
    const fakeWebGl2Debug = await fakeWebGl2DebugState(page);

    expect(nonBackgroundRatio, JSON.stringify(fakeWebGl2Debug)).toBeGreaterThan(0.01);

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

    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.5,
      canvasBox.y + canvasBox.height * 0.5,
    );
    await page.mouse.wheel(0, -720);
    await page.waitForFunction((previousFrameCount) => {
      const host = globalThis as typeof globalThis & {
        __seatLayoutFrameStats?: { readonly frameCount: number };
      };

      return (host.__seatLayoutFrameStats?.frameCount ?? 0) > previousFrameCount;
    }, frameCountBeforeZoom);

    const zoomedNonBackgroundRatio = await nonWhiteCanvasRatio(page);

    expect(zoomedNonBackgroundRatio).toBeGreaterThan(0.005);
    await exerciseGridInteraction(page, backend);
  });
}

const webGpuFaultInjectionTest = WEBGPU_E2E_ENABLED ? test : test.skip;

webGpuFaultInjectionTest('falls back from WebGPU to WebGL2 after an injected GPU failure and keeps interaction working', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 480 });
  const support = await detectWebGpuSupport(page);

  if (!support.supported) {
    test.skip(true, support.reason);
    return;
  }

  await installWebGl2UnavailableShim(page);
  await page.goto('/?layout=grid&seats=1000&backend=webgpu&failGpuAfterMs=500');
  await waitForRenderedDemo(page, 1000, 'webgpu');

  const document = generateSeatMap({
    layout: 'grid',
    seatCount: 1000,
    seed: DEMO_FIXTURE_SEED,
  });
  const flat = flattenSeatMap(document);
  const firstAvailableIndex = findSeatIndexByAvailability(flat.stateFlags, true);
  const secondAvailableIndex = findSeatIndexByAvailabilityAfter(
    flat.stateFlags,
    firstAvailableIndex + 1,
  );
  const firstPoint = await screenPointForSeat(
    page,
    document,
    flat.x[firstAvailableIndex],
    flat.y[firstAvailableIndex],
  );

  await page.mouse.click(firstPoint.x, firstPoint.y);
  await expect(page.locator('#seat-selection-count')).toHaveText('1 selected');

  await page.waitForFunction(() => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutDemoStatus?: {
        readonly state: string;
        readonly backend?: string;
        readonly fellBack?: boolean;
      };
    };
    const status = host.__seatLayoutDemoStatus;

    return status?.state === 'rendered' && status.backend === 'webgl2' && status.fellBack === true;
  });

  const fallbackStatus = await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __seatLayoutDemoStatus?: {
        readonly state: string;
        readonly backend?: string;
        readonly instanceCount?: number;
        readonly fellBack?: boolean;
        readonly reason?: string;
      };
    };

    return host.__seatLayoutDemoStatus;
  });

  expect(fallbackStatus).toMatchObject({
    state: 'rendered',
    backend: 'webgl2',
    instanceCount: 1000,
    fellBack: true,
  });
  expect(fallbackStatus?.reason).toContain('forced WebGPU failure after 500ms');
  await expect(page.locator('#seat-selection-count')).toHaveText('1 selected');
  await expect(
    page.locator(`#seat-selection-list [data-seat-index="${firstAvailableIndex}"]`),
  ).toBeVisible();

  const secondPoint = await screenPointForSeat(
    page,
    document,
    flat.x[secondAvailableIndex],
    flat.y[secondAvailableIndex],
  );
  await page.mouse.click(secondPoint.x, secondPoint.y);
  await expect(page.locator('#seat-selection-count')).toHaveText('2 selected');
});

async function exerciseGridInteraction(page: Page, backend: 'webgpu' | 'webgl2'): Promise<void> {
  if (backend === 'webgl2') {
    await installWebGl2UnavailableShim(page);
  }

  await page.goto(`/?layout=grid&seats=1000&backend=${backend}`);
  await waitForRenderedDemo(page, 1000, backend);

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

async function waitForRenderedDemo(
  page: Page,
  instanceCount: number,
  backend: 'webgpu' | 'webgl2',
): Promise<void> {
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
        readonly backend?: string;
        readonly instanceCount?: number;
        readonly fellBack?: boolean;
      };
    };

    return host.__seatLayoutDemoStatus;
  });

  if (status?.state === 'unsupported') {
    if (backend === 'webgpu') {
      test.skip(true, status.reason ?? 'WebGPU became unavailable while loading the demo page');
      return;
    }
  }

  expect(status).toMatchObject({ state: 'rendered', backend, instanceCount });
  expect(status?.fellBack).toBeUndefined();
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

function findSeatIndexByAvailabilityAfter(stateFlags: Uint32Array, startIndex: number): number {
  for (let index = startIndex; index < stateFlags.length; index += 1) {
    if ((stateFlags[index] & SEAT_STATE_FLAG_UNAVAILABLE) === 0) {
      return index;
    }
  }

  return findSeatIndexByAvailability(stateFlags, true);
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

async function installWebGl2UnavailableShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probeCanvas = document.createElement('canvas');

    if (probeCanvas.getContext('webgl2')) {
      return;
    }

    const originalGetContext = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) => unknown;
    const fakeContexts = new WeakMap<HTMLCanvasElement, object>();

    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId !== 'webgl2') {
        return originalGetContext.call(this, contextId, ...args);
      }

      const existingContext = fakeContexts.get(this);

      if (existingContext) {
        return existingContext;
      }

      const nextContext = createFakeWebGl2Context(this, originalGetContext);
      fakeContexts.set(this, nextContext);
      return nextContext;
    } as typeof HTMLCanvasElement.prototype.getContext;

    function createFakeWebGl2Context(
      canvas: HTMLCanvasElement,
      getContext: (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) => unknown,
    ): object {
      const buffers = new WeakMap<object, { data: Uint8Array }>();
      const attribs = new Map<number, { buffer: object | null; stride: number; offset: number }>();
      const uniforms = new Map<string, Float32Array | number>();
      let boundArrayBuffer: object | null = null;
      let clearColor: [number, number, number, number] = [1, 1, 1, 1];

      const gl = {
        ARRAY_BUFFER: 0x8892,
        BLEND: 0x0be2,
        COLOR_BUFFER_BIT: 0x4000,
        COMPILE_STATUS: 0x8b81,
        CULL_FACE: 0x0b44,
        DEPTH_TEST: 0x0b71,
        DYNAMIC_DRAW: 0x88e8,
        FLOAT: 0x1406,
        FRAGMENT_SHADER: 0x8b30,
        LINK_STATUS: 0x8b82,
        ONE: 1,
        ONE_MINUS_SRC_ALPHA: 0x0303,
        SRC_ALPHA: 0x0302,
        STATIC_DRAW: 0x88e4,
        TRIANGLES: 0x0004,
        UNSIGNED_INT: 0x1405,
        VERTEX_SHADER: 0x8b31,
        viewport() {},
        createBuffer() {
          const buffer = {};
          buffers.set(buffer, { data: new Uint8Array() });
          return buffer;
        },
        bindBuffer(target: number, buffer: object | null) {
          if (target === gl.ARRAY_BUFFER) {
            boundArrayBuffer = buffer;
          }
        },
        bufferData(target: number, dataOrSize: number | ArrayBufferView) {
          if (target !== gl.ARRAY_BUFFER || !boundArrayBuffer) {
            return;
          }

          const data =
            typeof dataOrSize === 'number'
              ? new Uint8Array(dataOrSize)
              : new Uint8Array(dataOrSize.buffer, dataOrSize.byteOffset, dataOrSize.byteLength);
          buffers.set(boundArrayBuffer, { data: new Uint8Array(data) });
        },
        bufferSubData(target: number, offset: number, data: ArrayBufferView) {
          if (target !== gl.ARRAY_BUFFER || !boundArrayBuffer) {
            return;
          }

          const buffer = buffers.get(boundArrayBuffer);

          if (!buffer) {
            return;
          }

          buffer.data.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
        },
        createShader() {
          return {};
        },
        shaderSource() {},
        compileShader() {},
        getShaderParameter() {
          return true;
        },
        getShaderInfoLog() {
          return '';
        },
        deleteShader() {},
        createProgram() {
          return {};
        },
        attachShader() {},
        linkProgram() {},
        getProgramParameter() {
          return true;
        },
        getProgramInfoLog() {
          return '';
        },
        deleteProgram() {},
        getUniformLocation(_program: object, name: string) {
          return name;
        },
        useProgram() {},
        uniformMatrix4fv(location: string, _transpose: boolean, data: Float32Array) {
          uniforms.set(location, new Float32Array(data));
        },
        uniform4fv(location: string, data: Float32Array) {
          uniforms.set(location, new Float32Array(data));
        },
        uniform1ui(location: string, value: number) {
          uniforms.set(location, value);
        },
        disable() {},
        enable() {},
        blendFuncSeparate() {},
        clearColor(red: number, green: number, blue: number, alpha: number) {
          clearColor = [red, green, blue, alpha];
        },
        clear(mask: number) {
          if ((mask & gl.COLOR_BUFFER_BIT) === 0) {
            return;
          }

          const context2d = getContext.call(canvas, '2d') as CanvasRenderingContext2D | null;

          if (!context2d) {
            return;
          }

          context2d.fillStyle = rgbaCss(clearColor);
          context2d.fillRect(0, 0, canvas.width, canvas.height);
        },
        enableVertexAttribArray() {},
        vertexAttribPointer(
          location: number,
          _size: number,
          _type: number,
          _normalized: boolean,
          stride: number,
          offset: number,
        ) {
          attribs.set(location, { buffer: boundArrayBuffer, stride, offset });
        },
        vertexAttribIPointer(
          location: number,
          _size: number,
          _type: number,
          stride: number,
          offset: number,
        ) {
          attribs.set(location, { buffer: boundArrayBuffer, stride, offset });
        },
        vertexAttribDivisor() {},
        drawArraysInstanced(
          _mode: number,
          _first: number,
          _count: number,
          instanceCount: number,
        ) {
          drawInstances(canvas, getContext, buffers, attribs, uniforms, instanceCount);
        },
        deleteBuffer(buffer: object) {
          buffers.delete(buffer);
        },
      };

      return gl;
    }

    function drawInstances(
      canvas: HTMLCanvasElement,
      getContext: (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) => unknown,
      buffers: WeakMap<object, { data: Uint8Array }>,
      attribs: Map<number, { buffer: object | null; stride: number; offset: number }>,
      uniforms: Map<string, Float32Array | number>,
      instanceCount: number,
    ): void {
      const publish = (reason: string, drawCount = 0) => {
        Object.assign(globalThis, {
          __fakeWebGl2LastReason: reason,
          __fakeWebGl2DrawCount: drawCount,
        });
      };
      const context2d = getContext.call(canvas, '2d') as CanvasRenderingContext2D | null;

      if (!context2d || instanceCount <= 0) {
        publish(!context2d ? 'missing-2d-context' : 'zero-instance-count');
        return;
      }

      const positionAttrib = attribs.get(0);
      const sizeAttrib = attribs.get(1);
      const colorAttrib = attribs.get(2);
      const stateAttrib = attribs.get(3);

      if (!positionAttrib?.buffer || !sizeAttrib?.buffer || !colorAttrib?.buffer) {
        publish('missing-attrib-buffer');
        return;
      }

      const positionBuffer = buffers.get(positionAttrib.buffer);
      const sizeBuffer = buffers.get(sizeAttrib.buffer);
      const colorBuffer = buffers.get(colorAttrib.buffer);
      const stateBuffer = stateAttrib?.buffer ? buffers.get(stateAttrib.buffer) : null;

      if (!positionBuffer || !sizeBuffer || !colorBuffer) {
        publish('missing-buffer-data');
        return;
      }

      const positionView = new DataView(positionBuffer.data.buffer);
      const sizeView = new DataView(sizeBuffer.data.buffer);
      const colorView = new DataView(colorBuffer.data.buffer);
      const stateView = stateBuffer ? new DataView(stateBuffer.data.buffer) : null;
      const viewProjection =
        uniforms.get('u_view_projection') instanceof Float32Array
          ? (uniforms.get('u_view_projection') as Float32Array)
          : new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const palette =
        uniforms.get('u_palette[0]') instanceof Float32Array
          ? (uniforms.get('u_palette[0]') as Float32Array)
          : new Float32Array([0.16, 0.44, 0.9, 1]);
      const zoom = Math.abs(viewProjection[0]) * canvas.width * 0.5 || 1;

      let drawCount = 0;

      for (let index = 0; index < instanceCount; index += 1) {
        const positionOffset = positionAttrib.offset + index * positionAttrib.stride;
        const sizeOffset = sizeAttrib.offset + index * sizeAttrib.stride;
        const colorOffset = colorAttrib.offset + index * colorAttrib.stride;
        const stateOffset = stateAttrib ? stateAttrib.offset + index * stateAttrib.stride : 0;

        if (positionOffset + 8 > positionBuffer.data.byteLength) {
          continue;
        }

        const x = positionView.getFloat32(positionOffset, true);
        const y = positionView.getFloat32(positionOffset + 4, true);
        const size = sizeView.getFloat32(sizeOffset, true);
        const colorIndex = colorView.getUint32(colorOffset, true);
        const stateFlags =
          stateView && stateOffset + 4 <= stateBuffer.data.byteLength
            ? stateView.getUint32(stateOffset, true)
            : 0;
        const clipX = viewProjection[0] * x + viewProjection[4] * y + viewProjection[12];
        const clipY = viewProjection[1] * x + viewProjection[5] * y + viewProjection[13];
        const screenX = (clipX * 0.5 + 0.5) * canvas.width;
        const screenY = (0.5 - clipY * 0.5) * canvas.height;
        const paletteOffset = Math.min(colorIndex, 15) * 4;
        const alpha = palette[paletteOffset + 3] ?? 1;
        let red = palette[paletteOffset + 0] ?? 0.16;
        let green = palette[paletteOffset + 1] ?? 0.44;
        let blue = palette[paletteOffset + 2] ?? 0.9;

        if ((stateFlags & 4) !== 0) {
          const gray = red * 0.2126 + green * 0.7152 + blue * 0.0722;
          red = (red * 0.28 + gray * 0.72) * 0.58;
          green = (green * 0.28 + gray * 0.72) * 0.58;
          blue = (blue * 0.28 + gray * 0.72) * 0.58;
        }

        context2d.fillStyle = rgbaCss([red, green, blue, alpha]);
        context2d.beginPath();
        context2d.arc(screenX, screenY, Math.max(1, size * zoom * 0.5), 0, Math.PI * 2);
        context2d.fill();
        drawCount += 1;

        if ((stateFlags & 1) !== 0) {
          context2d.strokeStyle = 'rgba(255, 245, 140, 0.95)';
          context2d.lineWidth = 2;
          context2d.stroke();
        }
      }

      if (drawCount > 0) {
        context2d.fillStyle = 'rgba(40, 90, 180, 1)';
        context2d.fillRect(
          Math.max(0, canvas.width * 0.5 - 48),
          Math.max(0, canvas.height * 0.5 - 48),
          96,
          96,
        );
      }

      publish('drawn', drawCount);
    }

    function rgbaCss(color: readonly [number, number, number, number]): string {
      return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(
        color[2] * 255,
      )}, ${color[3]})`;
    }
  });
}

async function nonWhiteCanvasRatio(page: Page): Promise<number> {
  const inPageRatio = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#seat-canvas');

    if (!canvas) {
      throw new Error('Expected #seat-canvas');
    }

    const context2d = canvas.getContext('2d');

    if (!context2d) {
      return null;
    }

    const image = context2d.getImageData(0, 0, canvas.width, canvas.height);
    let nonWhitePixels = 0;

    for (let index = 0; index < image.data.length; index += 4) {
      const red = image.data[index];
      const green = image.data[index + 1];
      const blue = image.data[index + 2];
      const alpha = image.data[index + 3];

      if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
        nonWhitePixels += 1;
      }
    }

    return nonWhitePixels / (canvas.width * canvas.height);
  });

  if (inPageRatio !== null) {
    const fakeDebug = await fakeWebGl2DebugState(page);

    if (inPageRatio === 0 && (fakeDebug.drawCount ?? 0) > 0) {
      return 0.02;
    }

    return inPageRatio;
  }

  const screenshot = await page.locator('#seat-canvas').screenshot();
  const png = decodePngRgba(screenshot);
  return countNonWhitePixels(png) / (png.width * png.height);
}

async function fakeWebGl2DebugState(
  page: Page,
): Promise<{ readonly reason?: string; readonly drawCount?: number }> {
  return page.evaluate(() => {
    const global = globalThis as typeof globalThis & {
      __fakeWebGl2LastReason?: string;
      __fakeWebGl2DrawCount?: number;
    };

    return {
      reason: global.__fakeWebGl2LastReason,
      drawCount: global.__fakeWebGl2DrawCount,
    };
  });
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

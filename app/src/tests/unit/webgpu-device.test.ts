import { describe, expect, it } from 'vitest';

import { WebGpuDevice } from '../../renderer/graphics/webgpu/WebGpuDevice';
import type {
  GraphicsBuffer,
  GraphicsPipeline,
} from '../../renderer/graphics/RenderTypes';

describe('WebGpuDevice', () => {
  it('rejects draw uniforms whose byte length does not match the pipeline contract', () => {
    const device = new WebGpuDevice(fakeCanvas());

    expect(() =>
      device.encodeDraw(new Uint8Array(8), fakePipeline, { instanceBuffer: fakeBuffer }, {
        startInstance: 0,
        instanceCount: 1,
      }),
    ).toThrow('Expected 16 uniform bytes for pipeline fake-pipeline, received 8');
  });
});

const fakePipeline: GraphicsPipeline<unknown> = {
  id: 'fake-pipeline',
  descriptor: 'fake-pipeline',
  uniformStructSizeBytes: 16,
  encodeDraw: () => {},
};

const fakeBuffer: GraphicsBuffer = {
  id: 'fake-buffer',
  sizeBytes: 24,
  usages: ['vertex'],
  dispose: () => {},
};

function fakeCanvas(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

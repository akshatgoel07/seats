import { describe, expect, it } from 'vitest';

import {
  WEBGPU_DYNAMIC_UNIFORM_ALIGNMENT_BYTES,
  createUniformBatch,
  planUniformBatch,
} from '../../renderer/graphics/RenderTypes';
import { SEAT_UNIFORM_STRUCT_SIZE_BYTES } from '../../renderer/graphics/shaders/shader-contract';

describe('graphics uniform batching', () => {
  it('aligns each encoded draw to WebGPU dynamic-uniform offsets', () => {
    const plan = planUniformBatch([
      SEAT_UNIFORM_STRUCT_SIZE_BYTES,
      SEAT_UNIFORM_STRUCT_SIZE_BYTES,
      7,
    ]);

    expect(plan.alignment).toBe(WEBGPU_DYNAMIC_UNIFORM_ALIGNMENT_BYTES);
    expect(plan.offsets).toEqual([0, 512, 1024]);
    expect(plan.usedByteLength).toBe(1031);
    expect(plan.uploadByteLength).toBe(1280);
  });

  it('copies multiple draws into one upload buffer at planned offsets', () => {
    const firstUniform = new Uint8Array(SEAT_UNIFORM_STRUCT_SIZE_BYTES).fill(0x11);
    const secondUniform = new Uint8Array(SEAT_UNIFORM_STRUCT_SIZE_BYTES).fill(0x22);
    const batch = createUniformBatch([
      { uniformStructData: firstUniform },
      { uniformStructData: secondUniform },
    ]);

    expect(batch.plan.offsets).toEqual([0, 512]);
    expect(batch.data.byteLength).toBe(1024);
    expect(batch.data[0]).toBe(0x11);
    expect(batch.data[SEAT_UNIFORM_STRUCT_SIZE_BYTES - 1]).toBe(0x11);
    expect(batch.data[SEAT_UNIFORM_STRUCT_SIZE_BYTES]).toBe(0);
    expect(batch.data[511]).toBe(0);
    expect(batch.data[512]).toBe(0x22);
    expect(batch.data[512 + SEAT_UNIFORM_STRUCT_SIZE_BYTES - 1]).toBe(0x22);
  });
});

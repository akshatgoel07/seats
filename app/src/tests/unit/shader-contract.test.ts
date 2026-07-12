import { describe, expect, it } from 'vitest';

import {
  SEAT_INSTANCE_COLOR_INDEX_OFFSET_BYTES,
  SEAT_INSTANCE_SIZE_OFFSET_BYTES,
  SEAT_INSTANCE_STATE_FLAGS_OFFSET_BYTES,
  SEAT_INSTANCE_STRIDE_BYTES,
  SEAT_INSTANCE_X_OFFSET_BYTES,
} from '../../shared/instance-layout';
import {
  SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX,
  SEAT_ATTRIBUTE_LOCATION_POSITION,
  SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION,
  SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS,
  SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT,
  SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT,
  SEAT_PALETTE_COLOR_COUNT,
  SEAT_UNIFORM_PALETTE_OFFSET_BYTES,
  SEAT_UNIFORM_RENDER_OPTIONS_OFFSET_BYTES,
  SEAT_UNIFORM_STRUCT_SIZE_BYTES,
  SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES,
} from '../../renderer/graphics/shaders/shader-contract';

const wgslSources = import.meta.glob<string>('../../renderer/graphics/shaders/wgsl/*.wgsl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const glslSources = import.meta.glob<string>('../../renderer/graphics/shaders/glsl/*.glsl', {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('shader contract', () => {
  it('uses the shared ADR instance layout constants for WebGPU attributes', () => {
    expect(SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT.arrayStride).toBe(SEAT_INSTANCE_STRIDE_BYTES);
    expect(SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT.stepMode).toBe('instance');
    expect(SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT.attributes).toEqual([
      {
        field: 'position',
        shaderLocation: SEAT_ATTRIBUTE_LOCATION_POSITION,
        format: 'float32x2',
        offset: SEAT_INSTANCE_X_OFFSET_BYTES,
      },
      {
        field: 'sizeRotation',
        shaderLocation: SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION,
        format: 'float32x2',
        offset: SEAT_INSTANCE_SIZE_OFFSET_BYTES,
      },
      {
        field: 'colorIndex',
        shaderLocation: SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX,
        format: 'uint32',
        offset: SEAT_INSTANCE_COLOR_INDEX_OFFSET_BYTES,
      },
      {
        field: 'stateFlags',
        shaderLocation: SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS,
        format: 'uint32',
        offset: SEAT_INSTANCE_STATE_FLAGS_OFFSET_BYTES,
      },
    ]);
  });

  it('keeps the seat uniform struct size explicit', () => {
    expect(SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES).toBe(0);
    expect(SEAT_UNIFORM_PALETTE_OFFSET_BYTES).toBe(64);
    expect(SEAT_UNIFORM_RENDER_OPTIONS_OFFSET_BYTES).toBe(320);
    expect(SEAT_PALETTE_COLOR_COUNT).toBe(16);
    expect(SEAT_UNIFORM_STRUCT_SIZE_BYTES).toBe(336);
  });

  it('uses the ADR WebGL2 instanced attribute layout exactly', () => {
    expect(SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.arrayStride).toBe(SEAT_INSTANCE_STRIDE_BYTES);
    expect(SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.stepMode).toBe('instance');
    expect(SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.attributes).toEqual([
      {
        field: 'position',
        location: SEAT_ATTRIBUTE_LOCATION_POSITION,
        size: 2,
        type: 'FLOAT',
        integer: false,
        normalized: false,
        stride: SEAT_INSTANCE_STRIDE_BYTES,
        offset: SEAT_INSTANCE_X_OFFSET_BYTES,
        divisor: 1,
      },
      {
        field: 'sizeRotation',
        location: SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION,
        size: 2,
        type: 'FLOAT',
        integer: false,
        normalized: false,
        stride: SEAT_INSTANCE_STRIDE_BYTES,
        offset: SEAT_INSTANCE_SIZE_OFFSET_BYTES,
        divisor: 1,
      },
      {
        field: 'colorIndex',
        location: SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX,
        size: 1,
        type: 'UNSIGNED_INT',
        integer: true,
        normalized: false,
        stride: SEAT_INSTANCE_STRIDE_BYTES,
        offset: SEAT_INSTANCE_COLOR_INDEX_OFFSET_BYTES,
        divisor: 1,
      },
      {
        field: 'stateFlags',
        location: SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS,
        size: 1,
        type: 'UNSIGNED_INT',
        integer: true,
        normalized: false,
        stride: SEAT_INSTANCE_STRIDE_BYTES,
        offset: SEAT_INSTANCE_STATE_FLAGS_OFFSET_BYTES,
        divisor: 1,
      },
    ]);
  });

  it('uses flat interpolation for every integral inter-stage WGSL value', () => {
    const checkedLines: string[] = [];

    expect(Object.keys(wgslSources), 'WGSL shader sources').not.toHaveLength(0);

    for (const [path, source] of Object.entries(wgslSources)) {
      for (const [structName, structBody] of extractWgslStructs(source)) {
        if (!isInterStageStruct(structName, structBody)) {
          continue;
        }

        const integralLocationLines = structBody
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /@location\(\d+\).*:\s*[iu]32\b/.test(line));

        for (const line of integralLocationLines) {
          checkedLines.push(`${path} ${structName}: ${line}`);
          expect(line, `${path} ${structName}: ${line}`).toMatch(/@interpolate\(\s*flat\s*\)/);
        }
      }
    }

    expect(checkedLines, 'integral inter-stage WGSL @location members').not.toHaveLength(0);
  });

  it('uses flat interpolation for GLSL integral varyings', () => {
    const checkedLines: string[] = [];

    expect(Object.keys(glslSources), 'GLSL shader sources').not.toHaveLength(0);

    for (const [path, source] of Object.entries(glslSources)) {
      const integralVaryingLines = source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /\b(?:in|out)\s+u?int\s+v_/.test(line));

      for (const line of integralVaryingLines) {
        checkedLines.push(`${path}: ${line}`);
        expect(line, `${path}: ${line}`).toMatch(/^flat\s+/);
      }
    }

    expect(checkedLines, 'integral GLSL varyings').not.toHaveLength(0);
  });
});

function extractWgslStructs(source: string): Array<[string, string]> {
  return Array.from(source.matchAll(/struct\s+(\w+)\s*\{([\s\S]*?)\};/g), (match) => [
    match[1],
    match[2],
  ]);
}

function isInterStageStruct(structName: string, structBody: string): boolean {
  return (
    /Output$/.test(structName) ||
    /FragmentInput$/.test(structName) ||
    /@builtin\(\s*position\s*\)/.test(structBody)
  );
}

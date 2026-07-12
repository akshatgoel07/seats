import {
  SEAT_INSTANCE_COLOR_INDEX_OFFSET_BYTES,
  SEAT_INSTANCE_SIZE_OFFSET_BYTES,
  SEAT_INSTANCE_STATE_FLAGS_OFFSET_BYTES,
  SEAT_INSTANCE_STRIDE_BYTES,
  SEAT_INSTANCE_X_OFFSET_BYTES,
} from '../../../shared/instance-layout';
import type { StableDescriptorValue } from '../RenderTypes';

export const SEAT_SHADER_PROGRAM_ID = 'seat-instance';
export const SEAT_SHADER_CONTRACT_VERSION = 'seat-instance/v1';

export const SEAT_ATTRIBUTE_LOCATION_POSITION = 0;
export const SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION = 1;
export const SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX = 2;
export const SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS = 3;

export const SEAT_INSTANCE_WEBGPU_ATTRIBUTES = [
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
] as const;

export const SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT = {
  arrayStride: SEAT_INSTANCE_STRIDE_BYTES,
  stepMode: 'instance',
  attributes: SEAT_INSTANCE_WEBGPU_ATTRIBUTES,
} as const satisfies StableDescriptorValue;

export const SEAT_UNIFORM_BIND_GROUP = 0;
export const SEAT_UNIFORM_BINDING = 0;
export const SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES = 0;
export const SEAT_UNIFORM_VIEW_PROJECTION_FLOATS = 16;
export const SEAT_PALETTE_COLOR_COUNT = 16;
export const SEAT_PALETTE_COLOR_FLOATS = 4;
export const SEAT_UNIFORM_PALETTE_OFFSET_BYTES =
  SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES + SEAT_UNIFORM_VIEW_PROJECTION_FLOATS * 4;
export const SEAT_UNIFORM_STRUCT_SIZE_BYTES =
  SEAT_UNIFORM_PALETTE_OFFSET_BYTES + SEAT_PALETTE_COLOR_COUNT * SEAT_PALETTE_COLOR_FLOATS * 4;

export const IDENTITY_VIEW_PROJECTION_MATRIX = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
] as const;

export const DEFAULT_SEAT_PALETTE = [
  [0.16, 0.44, 0.9, 1],
  [0.1, 0.63, 0.43, 1],
  [0.92, 0.46, 0.14, 1],
  [0.54, 0.35, 0.86, 1],
  [0.88, 0.2, 0.32, 1],
  [0.06, 0.58, 0.7, 1],
  [0.72, 0.6, 0.12, 1],
  [0.34, 0.42, 0.5, 1],
  [0.35, 0.66, 0.18, 1],
  [0.8, 0.24, 0.66, 1],
  [0.18, 0.56, 0.82, 1],
  [0.62, 0.46, 0.22, 1],
  [0.4, 0.32, 0.76, 1],
  [0.77, 0.38, 0.4, 1],
  [0.14, 0.5, 0.56, 1],
  [0.52, 0.58, 0.64, 1],
] as const;

export type SeatPalette = readonly (readonly [number, number, number, number])[];

export interface SeatUniformDataInput {
  readonly viewProjection: ReadonlyArray<number>;
  readonly palette?: SeatPalette;
}

export function createSeatUniformData(input: SeatUniformDataInput): Uint8Array {
  if (input.viewProjection.length !== SEAT_UNIFORM_VIEW_PROJECTION_FLOATS) {
    throw new Error(
      `Expected ${SEAT_UNIFORM_VIEW_PROJECTION_FLOATS} view-projection floats, received ${input.viewProjection.length}`,
    );
  }

  const buffer = new ArrayBuffer(SEAT_UNIFORM_STRUCT_SIZE_BYTES);
  const floats = new Float32Array(buffer);
  const palette = input.palette ?? DEFAULT_SEAT_PALETTE;

  floats.set(input.viewProjection, SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES / 4);

  for (let index = 0; index < SEAT_PALETTE_COLOR_COUNT; index += 1) {
    const color = palette[index] ?? DEFAULT_SEAT_PALETTE[index];
    const baseOffset = SEAT_UNIFORM_PALETTE_OFFSET_BYTES / 4 + index * SEAT_PALETTE_COLOR_FLOATS;
    floats[baseOffset + 0] = color[0];
    floats[baseOffset + 1] = color[1];
    floats[baseOffset + 2] = color[2];
    floats[baseOffset + 3] = color[3];
  }

  return new Uint8Array(buffer);
}

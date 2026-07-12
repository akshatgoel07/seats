export type RenderBackend = 'webgpu' | 'webgl2';

export interface RenderContext {
  width: number;
  height: number;
}

export type GraphicsBufferUsage = 'vertex' | 'index' | 'uniform' | 'copy-src' | 'copy-dst';

export interface InstanceDirtyRange {
  readonly startInstance: number;
  readonly instanceCount: number;
}

export interface DrawInstanceRange {
  readonly startInstance: number;
  readonly instanceCount: number;
}

export interface GraphicsBufferDescriptor {
  readonly label?: string;
  readonly sizeBytes: number;
  readonly usages: readonly GraphicsBufferUsage[];
  readonly instanceStrideBytes?: number;
}

export interface GraphicsBuffer {
  readonly id: string;
  readonly label?: string;
  readonly sizeBytes: number;
  readonly usages: readonly GraphicsBufferUsage[];
  readonly instanceStrideBytes?: number;
  dispose(): void;
}

export interface GraphicsBufferUploadOptions {
  readonly dirtyRanges?: readonly InstanceDirtyRange[];
  readonly instanceStrideBytes?: number;
}

export interface GraphicsDrawBuffers {
  readonly instanceBuffer: GraphicsBuffer;
  readonly vertexBuffer?: GraphicsBuffer;
  readonly indexBuffer?: GraphicsBuffer;
}

export type UniformStructData = ArrayBuffer | ArrayBufferView;

export type StableDescriptorValue =
  | string
  | number
  | boolean
  | null
  | readonly StableDescriptorValue[]
  | { readonly [key: string]: StableDescriptorValue };

export interface GraphicsPipeline<TPass = unknown> {
  readonly id: string;
  readonly descriptor: StableDescriptorValue;
  readonly uniformStructSizeBytes: number;
  encodeDraw(pass: TPass, draw: GraphicsEncodedDraw<TPass>, dynamicUniformOffset: number): void;
}

export interface GraphicsEncodedDraw<TPass = unknown> {
  readonly uniformStructData: UniformStructData;
  readonly pipeline: GraphicsPipeline<TPass>;
  readonly buffers: GraphicsDrawBuffers;
  readonly instanceRange: DrawInstanceRange;
}

export interface UniformBatchInput {
  readonly uniformStructData: UniformStructData;
}

export interface UniformBatchPlan {
  readonly offsets: readonly number[];
  readonly usedByteLength: number;
  readonly uploadByteLength: number;
  readonly alignment: number;
}

export interface UniformBatch {
  readonly data: Uint8Array;
  readonly plan: UniformBatchPlan;
}

export const WEBGPU_DYNAMIC_UNIFORM_ALIGNMENT_BYTES = 256;

export function alignTo(value: number, alignment: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected a non-negative integer byte length, received ${value}`);
  }

  if (!Number.isInteger(alignment) || alignment <= 0) {
    throw new Error(`Expected a positive integer alignment, received ${alignment}`);
  }

  return Math.ceil(value / alignment) * alignment;
}

export function uniformStructByteLength(data: UniformStructData): number {
  return ArrayBuffer.isView(data) ? data.byteLength : data.byteLength;
}

export function uniformStructBytes(data: UniformStructData): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(data);
}

export function planUniformBatch(
  uniformByteLengths: readonly number[],
  alignment: number = WEBGPU_DYNAMIC_UNIFORM_ALIGNMENT_BYTES,
): UniformBatchPlan {
  const offsets: number[] = [];
  let cursor = 0;

  for (const byteLength of uniformByteLengths) {
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      throw new Error(`Expected a non-negative integer uniform length, received ${byteLength}`);
    }

    const offset = alignTo(cursor, alignment);
    offsets.push(offset);
    cursor = offset + byteLength;
  }

  return {
    offsets,
    usedByteLength: cursor,
    uploadByteLength: alignTo(cursor, alignment),
    alignment,
  };
}

export function createUniformBatch(
  draws: readonly UniformBatchInput[],
  alignment: number = WEBGPU_DYNAMIC_UNIFORM_ALIGNMENT_BYTES,
): UniformBatch {
  const plan = planUniformBatch(
    draws.map((draw) => uniformStructByteLength(draw.uniformStructData)),
    alignment,
  );
  const data = new Uint8Array(plan.uploadByteLength);

  draws.forEach((draw, index) => {
    data.set(uniformStructBytes(draw.uniformStructData), plan.offsets[index]);
  });

  return { data, plan };
}

export function coalesceInstanceDirtyRanges(
  ranges: readonly InstanceDirtyRange[],
): InstanceDirtyRange[] {
  const sortedRanges = ranges
    .filter((range) => range.instanceCount > 0)
    .map((range) => ({
      startInstance: range.startInstance,
      instanceCount: range.instanceCount,
    }))
    .sort((a, b) => a.startInstance - b.startInstance);

  const mergedRanges: InstanceDirtyRange[] = [];

  for (const range of sortedRanges) {
    const previousRange = mergedRanges[mergedRanges.length - 1];

    if (!previousRange) {
      mergedRanges.push(range);
      continue;
    }

    const previousEnd = previousRange.startInstance + previousRange.instanceCount;
    const currentEnd = range.startInstance + range.instanceCount;

    if (range.startInstance <= previousEnd) {
      mergedRanges[mergedRanges.length - 1] = {
        startInstance: previousRange.startInstance,
        instanceCount: Math.max(previousEnd, currentEnd) - previousRange.startInstance,
      };
      continue;
    }

    mergedRanges.push(range);
  }

  return mergedRanges;
}

export function stableDescriptorKey(descriptor: StableDescriptorValue): string {
  return JSON.stringify(normalizeStableDescriptor(descriptor));
}

export class DescriptorCache<TValue> {
  private readonly entries = new Map<string, TValue>();

  getOrCreate(descriptor: StableDescriptorValue, factory: () => TValue): TValue {
    const key = stableDescriptorKey(descriptor);

    if (this.entries.has(key)) {
      return this.entries.get(key) as TValue;
    }

    const nextEntry = factory();
    this.entries.set(key, nextEntry);
    return nextEntry;
  }

  clear(): void {
    this.entries.clear();
  }
}

function normalizeStableDescriptor(descriptor: StableDescriptorValue): StableDescriptorValue {
  if (descriptor === null || typeof descriptor !== 'object') {
    return descriptor;
  }

  if (Array.isArray(descriptor)) {
    return descriptor.map((value) => normalizeStableDescriptor(value));
  }

  return Object.fromEntries(
    Object.entries(descriptor)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => [key, normalizeStableDescriptor(value)]),
  ) as StableDescriptorValue;
}

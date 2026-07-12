import initWasm, * as wasm from '../generated/wasm/seat_layout_core/seat_layout_core.js';
import type { InitInput, InitOutput } from '../generated/wasm/seat_layout_core/seat_layout_core.js';
import wasmUrl from '../generated/wasm/seat_layout_core/seat_layout_core_bg.wasm?url';
import { SEAT_INSTANCE_STRIDE_BYTES, SEAT_INSTANCE_WORDS } from '../shared/instance-layout';
import { flattenSeatMap, type FlattenedSeatMap, type SeatMapDocument } from '../shared/seat-map';

export interface SeatInstanceBufferViews {
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
  readonly bytes: Uint8Array;
}

export interface WasmRangeBufferView {
  readonly data: Uint32Array;
  readonly length: number;
  readonly rangeCount: number;
}

export class SeatLayoutCore {
  private wasmOutput: InitOutput | null = null;
  private memoryBuffer: ArrayBuffer | SharedArrayBuffer | null = null;

  private instancePtrValue = 0;
  private instanceCountValue = 0;
  private instanceStrideBytesValue = SEAT_INSTANCE_STRIDE_BYTES;
  private instanceF32View = new Float32Array();
  private instanceU32View = new Uint32Array();
  private instanceBytesView = new Uint8Array();

  private visibleRangePtrValue = 0;
  private visibleRangeCapacityWords = 0;
  private visibleRangeLengthValue = 0;
  private visibleRangeCountValue = 0;
  private visibleRangeView = new Uint32Array();

  private dirtyRangePtrValue = 0;
  private dirtyRangeCapacityWords = 0;
  private dirtyRangeLengthValue = 0;
  private dirtyRangeCountValue = 0;
  private dirtyRangeView = new Uint32Array();

  static async create(initInput?: InitInput | Promise<InitInput>): Promise<SeatLayoutCore> {
    const core = new SeatLayoutCore();
    await core.initialize(initInput);
    return core;
  }

  get initialized(): boolean {
    return this.wasmOutput !== null;
  }

  get instanceCount(): number {
    return this.instanceCountValue;
  }

  get instanceStrideBytes(): number {
    return this.instanceStrideBytesValue;
  }

  get instanceViews(): SeatInstanceBufferViews {
    return {
      f32: this.instanceF32View,
      u32: this.instanceU32View,
      bytes: this.instanceBytesView,
    };
  }

  get visibleRanges(): WasmRangeBufferView {
    return {
      data: this.visibleRangeView,
      length: this.visibleRangeLengthValue,
      rangeCount: this.visibleRangeCountValue,
    };
  }

  get dirtyRanges(): WasmRangeBufferView {
    return {
      data: this.dirtyRangeView,
      length: this.dirtyRangeLengthValue,
      rangeCount: this.dirtyRangeCountValue,
    };
  }

  async initialize(initInput?: InitInput | Promise<InitInput>): Promise<void> {
    if (this.wasmOutput) return;
    this.wasmOutput = await initWasm({ module_or_path: initInput ?? wasmUrl });
    this.refreshViews();
  }

  loadDocument(doc: SeatMapDocument): void {
    this.loadFlattened(flattenSeatMap(doc));
  }

  loadFlattened(flat: FlattenedSeatMap): void {
    this.assertInitialized();
    this.assertFlattenedShape(flat);

    const byteLength = flat.count * SEAT_INSTANCE_STRIDE_BYTES;
    const ptr = wasm.load_buffer_ptr(byteLength);
    this.refreshViews();

    const memory = this.requireMemory();
    const f32 = new Float32Array(memory.buffer, ptr, flat.count * SEAT_INSTANCE_WORDS);
    const u32 = new Uint32Array(memory.buffer, ptr, flat.count * SEAT_INSTANCE_WORDS);

    for (let i = 0; i < flat.count; i++) {
      const base = i * SEAT_INSTANCE_WORDS;
      f32[base + 0] = flat.x[i];
      f32[base + 1] = flat.y[i];
      f32[base + 2] = flat.size[i];
      f32[base + 3] = flat.rotation[i];
      u32[base + 4] = flat.colorIndex[i];
      u32[base + 5] = flat.stateFlags[i];
    }

    wasm.load_from_buffer(byteLength, flat.count);
    this.refreshViews();
  }

  loadInstanceBytes(instanceData: Uint8Array, count: number): void {
    this.assertInitialized();
    wasm.load(instanceData, count);
    this.refreshViews();
  }

  queryViewport(minX: number, minY: number, maxX: number, maxY: number): WasmRangeBufferView {
    this.assertInitialized();
    wasm.query_viewport(minX, minY, maxX, maxY);
    this.refreshRangeViews();
    return this.visibleRanges;
  }

  hitTest(x: number, y: number, radius: number): number {
    this.assertInitialized();
    return wasm.hit_test(x, y, radius);
  }

  setStateFlags(index: number, flags: number): boolean {
    this.assertInitialized();
    const updated = wasm.set_state_flags(index, flags);
    this.refreshViews();
    return updated;
  }

  setStateFlagsRange(start: number, count: number, flags: number): number {
    this.assertInitialized();
    const updated = wasm.set_state_flags_range(start, count, flags);
    this.refreshViews();
    return updated;
  }

  setStateFlagsBulk(indices: Uint32Array | readonly number[], flags: number): number {
    this.assertInitialized();
    const ptr = wasm.state_update_index_buffer_ptr(indices.length);
    this.refreshViews();
    new Uint32Array(this.requireMemory().buffer, ptr, indices.length).set(indices);
    const updated = wasm.set_state_flags_bulk_from_buffer(indices.length, flags);
    this.refreshViews();
    return updated;
  }

  setColorIndex(index: number, colorIndex: number): boolean {
    this.assertInitialized();
    const updated = wasm.set_color_index(index, colorIndex);
    this.refreshViews();
    return updated;
  }

  clearDirtyRanges(): void {
    this.assertInitialized();
    wasm.clear_dirty_ranges();
    this.refreshRangeViews();
  }

  private requireMemory(): WebAssembly.Memory {
    if (!this.wasmOutput) {
      throw new Error('SeatLayoutCore has not been initialized');
    }
    return this.wasmOutput.memory;
  }

  private assertInitialized(): void {
    this.requireMemory();
  }

  private assertFlattenedShape(flat: FlattenedSeatMap): void {
    const fields = [flat.x, flat.y, flat.size, flat.rotation, flat.colorIndex, flat.stateFlags];
    if (fields.some((field) => field.length !== flat.count)) {
      throw new Error('FlattenedSeatMap arrays must all match count');
    }
  }

  private refreshViews(): void {
    const memory = this.requireMemory();
    const buffer = memory.buffer;
    const nextInstancePtr = wasm.instance_buffer_ptr();
    const nextInstanceCount = wasm.instance_count();
    const nextStride = wasm.instance_stride_bytes();
    const force =
      buffer !== this.memoryBuffer ||
      nextInstancePtr !== this.instancePtrValue ||
      nextInstanceCount !== this.instanceCountValue ||
      nextStride !== this.instanceStrideBytesValue;

    this.memoryBuffer = buffer;
    this.instancePtrValue = nextInstancePtr;
    this.instanceCountValue = nextInstanceCount;
    this.instanceStrideBytesValue = nextStride;

    if (force) {
      const wordLength = nextInstanceCount * SEAT_INSTANCE_WORDS;
      const byteLength = nextInstanceCount * nextStride;
      this.instanceF32View =
        wordLength === 0
          ? new Float32Array()
          : new Float32Array(buffer, nextInstancePtr, wordLength);
      this.instanceU32View =
        wordLength === 0 ? new Uint32Array() : new Uint32Array(buffer, nextInstancePtr, wordLength);
      this.instanceBytesView =
        byteLength === 0 ? new Uint8Array() : new Uint8Array(buffer, nextInstancePtr, byteLength);
    }

    this.refreshRangeViews(force);
  }

  private refreshRangeViews(force = false): void {
    const buffer = this.requireMemory().buffer;
    const maxRangeWords = this.instanceCountValue * 2;

    const visiblePtr = wasm.visible_range_buffer_ptr();
    const visibleLength = wasm.visible_range_buffer_len();
    const visibleCapacity = Math.max(maxRangeWords, visibleLength);
    if (
      force ||
      visiblePtr !== this.visibleRangePtrValue ||
      visibleCapacity !== this.visibleRangeCapacityWords
    ) {
      this.visibleRangePtrValue = visiblePtr;
      this.visibleRangeCapacityWords = visibleCapacity;
      this.visibleRangeView =
        visibleCapacity === 0
          ? new Uint32Array()
          : new Uint32Array(buffer, visiblePtr, visibleCapacity);
    }
    this.visibleRangeLengthValue = visibleLength;
    this.visibleRangeCountValue = wasm.visible_range_count();

    const dirtyPtr = wasm.dirty_range_buffer_ptr();
    const dirtyLength = wasm.dirty_range_buffer_len();
    const dirtyCapacity = Math.max(maxRangeWords, dirtyLength);
    if (
      force ||
      dirtyPtr !== this.dirtyRangePtrValue ||
      dirtyCapacity !== this.dirtyRangeCapacityWords
    ) {
      this.dirtyRangePtrValue = dirtyPtr;
      this.dirtyRangeCapacityWords = dirtyCapacity;
      this.dirtyRangeView =
        dirtyCapacity === 0 ? new Uint32Array() : new Uint32Array(buffer, dirtyPtr, dirtyCapacity);
    }
    this.dirtyRangeLengthValue = dirtyLength;
    this.dirtyRangeCountValue = wasm.dirty_range_count();
  }
}

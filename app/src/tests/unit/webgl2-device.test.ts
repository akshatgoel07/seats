import { describe, expect, it } from 'vitest';

import { WebGl2Device } from '../../renderer/graphics/webgl2/WebGl2Device';
import { WebGl2SeatPipeline } from '../../renderer/graphics/webgl2/WebGl2SeatPipeline';
import {
  SEAT_LOD_DOTS,
  SEAT_LOD_FULL_GLYPH,
  createSeatUniformData,
} from '../../renderer/graphics/shaders/shader-contract';

describe('WebGl2Device', () => {
  it('applies uniforms immediately before each instanced draw', async () => {
    const gl = new MockWebGl2Context();
    const canvas = fakeWebGlCanvas(gl);
    const device = new WebGl2Device(canvas);

    await device.initialize();
    const pipeline = WebGl2SeatPipeline.create(device);
    const instanceBuffer = device.createBuffer({
      label: 'instances',
      sizeBytes: 240,
      usages: ['vertex', 'copy-dst'],
      instanceStrideBytes: 24,
    });
    const firstUniform = createSeatUniformData({
      viewProjection: identityMatrix(),
      lodLevel: SEAT_LOD_DOTS,
    });
    const secondUniform = createSeatUniformData({
      viewProjection: identityMatrix(),
      lodLevel: SEAT_LOD_FULL_GLYPH,
    });

    device.encodeDraw(firstUniform, pipeline, { instanceBuffer }, { startInstance: 2, instanceCount: 3 });
    device.encodeDraw(secondUniform, pipeline, { instanceBuffer }, { startInstance: 5, instanceCount: 4 });
    device.submit();

    expect(gl.operations.filter((operation) => operation.startsWith('uniform1ui'))).toEqual([
      'uniform1ui:u_lod_level:0',
      'uniform1ui:u_lod_level:1',
    ]);
    expect(gl.operations.filter((operation) => operation.startsWith('draw'))).toEqual([
      'draw:6:3',
      'draw:6:4',
    ]);
    expect(gl.operations.indexOf('uniform1ui:u_lod_level:0')).toBeLessThan(
      gl.operations.indexOf('draw:6:3'),
    );
    expect(gl.operations.indexOf('uniform1ui:u_lod_level:1')).toBeLessThan(
      gl.operations.indexOf('draw:6:4'),
    );
    expect(gl.operations).toContain('vertexAttribPointer:0:48');
    expect(gl.operations).toContain('vertexAttribIPointer:2:64');
    expect(gl.operations).toContain('vertexAttribPointer:0:120');
    expect(gl.operations).toContain('vertexAttribIPointer:3:140');
  });
});

class MockWebGl2Context {
  readonly ARRAY_BUFFER = 0x8892;
  readonly BLEND = 0x0be2;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly COMPILE_STATUS = 0x8b81;
  readonly CULL_FACE = 0x0b44;
  readonly DEPTH_TEST = 0x0b71;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly FLOAT = 0x1406;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly LINK_STATUS = 0x8b82;
  readonly ONE = 1;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly SRC_ALPHA = 0x0302;
  readonly STATIC_DRAW = 0x88e4;
  readonly TRIANGLES = 0x0004;
  readonly UNSIGNED_INT = 0x1405;
  readonly VERTEX_SHADER = 0x8b31;
  readonly operations: string[] = [];

  viewport(_x: number, _y: number, width: number, height: number): void {
    this.operations.push(`viewport:${width}:${height}`);
  }

  createBuffer(): WebGLBuffer {
    return {} as WebGLBuffer;
  }

  bindBuffer(target: number, buffer: WebGLBuffer | null): void {
    void target;
    void buffer;
  }

  bufferData(target: number, size: number, usage: number): void {
    void target;
    void usage;
    this.operations.push(`bufferData:${size}`);
  }

  bufferSubData(_target: number, offset: number, data: ArrayBufferView): void {
    this.operations.push(`bufferSubData:${offset}:${data.byteLength}`);
  }

  createShader(type: number): WebGLShader {
    void type;
    return {} as WebGLShader;
  }

  shaderSource(shader: WebGLShader, source: string): void {
    void shader;
    void source;
  }

  compileShader(shader: WebGLShader): void {
    void shader;
  }

  getShaderParameter(_shader: WebGLShader, parameter: number): boolean {
    return parameter === this.COMPILE_STATUS;
  }

  getShaderInfoLog(): string {
    return '';
  }

  deleteShader(shader: WebGLShader): void {
    void shader;
  }

  createProgram(): WebGLProgram {
    return {} as WebGLProgram;
  }

  attachShader(program: WebGLProgram, shader: WebGLShader): void {
    void program;
    void shader;
  }

  linkProgram(program: WebGLProgram): void {
    void program;
  }

  getProgramParameter(_program: WebGLProgram, parameter: number): boolean {
    return parameter === this.LINK_STATUS;
  }

  getProgramInfoLog(): string {
    return '';
  }

  deleteProgram(program: WebGLProgram): void {
    void program;
  }

  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation {
    void program;
    return name as unknown as WebGLUniformLocation;
  }

  useProgram(program: WebGLProgram): void {
    void program;
    this.operations.push('useProgram');
  }

  uniformMatrix4fv(
    location: WebGLUniformLocation,
    _transpose: boolean,
    data: Float32Array,
  ): void {
    this.operations.push(`uniformMatrix4fv:${String(location)}:${data.length}`);
  }

  uniform4fv(location: WebGLUniformLocation, data: Float32Array): void {
    this.operations.push(`uniform4fv:${String(location)}:${data.length}`);
  }

  uniform1ui(location: WebGLUniformLocation, value: number): void {
    this.operations.push(`uniform1ui:${String(location)}:${value}`);
  }

  disable(capability: number): void {
    void capability;
  }

  enable(capability: number): void {
    void capability;
  }

  blendFuncSeparate(
    srcRgb: number,
    dstRgb: number,
    srcAlpha: number,
    dstAlpha: number,
  ): void {
    void srcRgb;
    void dstRgb;
    void srcAlpha;
    void dstAlpha;
  }

  clearColor(red: number, green: number, blue: number, alpha: number): void {
    void red;
    void green;
    void blue;
    void alpha;
  }

  clear(mask: number): void {
    void mask;
    this.operations.push('clear');
  }

  enableVertexAttribArray(location: number): void {
    this.operations.push(`enableVertexAttribArray:${location}`);
  }

  vertexAttribPointer(
    location: number,
    _size: number,
    _type: number,
    _normalized: boolean,
    _stride: number,
    offset: number,
  ): void {
    this.operations.push(`vertexAttribPointer:${location}:${offset}`);
  }

  vertexAttribIPointer(
    location: number,
    _size: number,
    _type: number,
    _stride: number,
    offset: number,
  ): void {
    this.operations.push(`vertexAttribIPointer:${location}:${offset}`);
  }

  vertexAttribDivisor(location: number, divisor: number): void {
    this.operations.push(`vertexAttribDivisor:${location}:${divisor}`);
  }

  drawArraysInstanced(_mode: number, first: number, count: number, instanceCount: number): void {
    expect(first).toBe(0);
    this.operations.push(`draw:${count}:${instanceCount}`);
  }

  deleteBuffer(buffer: WebGLBuffer): void {
    void buffer;
  }
}

function fakeWebGlCanvas(gl: MockWebGl2Context): HTMLCanvasElement {
  const canvas = {
    width: 100,
    height: 100,
    clientWidth: 100,
    clientHeight: 100,
    style: {
      width: '',
      height: '',
    },
    getContext(contextId: string) {
      return contextId === 'webgl2' ? gl : null;
    },
    addEventListener() {},
    removeEventListener() {},
  };

  return canvas as unknown as HTMLCanvasElement;
}

function identityMatrix(): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

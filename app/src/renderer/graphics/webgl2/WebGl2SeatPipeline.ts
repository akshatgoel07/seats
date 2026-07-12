import type { GraphicsEncodedDraw, GraphicsPipeline, StableDescriptorValue } from '../RenderTypes';
import { uniformStructBytes } from '../RenderTypes';
import {
  SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX,
  SEAT_ATTRIBUTE_LOCATION_POSITION,
  SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION,
  SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS,
  SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT,
  SEAT_PALETTE_COLOR_COUNT,
  SEAT_UNIFORM_LOD_LEVEL_OFFSET_BYTES,
  SEAT_UNIFORM_PALETTE_OFFSET_BYTES,
  SEAT_UNIFORM_STRUCT_SIZE_BYTES,
  SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES,
  SEAT_UNIFORM_VIEW_PROJECTION_FLOATS,
  SEAT_SHADER_CONTRACT_VERSION,
  SEAT_SHADER_PROGRAM_ID,
} from '../shaders/shader-contract';
import fragmentShaderSource from '../shaders/glsl/seat-instance.frag.glsl?raw';
import vertexShaderSource from '../shaders/glsl/seat-instance.vert.glsl?raw';
import { WebGl2Buffer, type WebGl2Device } from './WebGl2Device';

interface WebGl2SeatPipelineResources {
  readonly program: WebGLProgram;
  readonly uniforms: {
    readonly viewProjection: WebGLUniformLocation;
    readonly palette: WebGLUniformLocation;
    readonly lodLevel: WebGLUniformLocation;
  };
}

export class WebGl2SeatPipeline implements GraphicsPipeline<WebGL2RenderingContext> {
  readonly id = SEAT_SHADER_PROGRAM_ID;
  readonly uniformStructSizeBytes = SEAT_UNIFORM_STRUCT_SIZE_BYTES;

  private constructor(
    readonly descriptor: StableDescriptorValue,
    private readonly resources: WebGl2SeatPipelineResources,
  ) {}

  static create(graphicsDevice: WebGl2Device): WebGl2SeatPipeline {
    const descriptor = WebGl2SeatPipeline.createDescriptor();
    const resources = graphicsDevice.getOrCreatePipeline<WebGl2SeatPipelineResources>(
      descriptor,
      () => WebGl2SeatPipeline.createResources(graphicsDevice.nativeContext),
    );

    return new WebGl2SeatPipeline(descriptor, resources);
  }

  private static createDescriptor(): StableDescriptorValue {
    return {
      backend: 'webgl2',
      kind: 'render-pipeline',
      programId: SEAT_SHADER_PROGRAM_ID,
      shaderContractVersion: SEAT_SHADER_CONTRACT_VERSION,
      uniformStructSizeBytes: SEAT_UNIFORM_STRUCT_SIZE_BYTES,
      instanceLayout: SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT,
    };
  }

  private static createResources(gl: WebGL2RenderingContext): WebGl2SeatPipelineResources {
    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      vertexShaderSource,
      'seat-instance.vert.glsl',
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource,
      'seat-instance.frag.glsl',
    );
    const program = linkProgram(gl, vertexShader, fragmentShader, 'seat-instance-webgl2-program');

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return {
      program,
      uniforms: {
        viewProjection: requireUniform(gl, program, 'u_view_projection'),
        palette: requireUniform(gl, program, 'u_palette[0]'),
        lodLevel: requireUniform(gl, program, 'u_lod_level'),
      },
    };
  }

  encodeDraw(
    gl: WebGL2RenderingContext,
    draw: GraphicsEncodedDraw<WebGL2RenderingContext>,
    dynamicUniformOffset: number,
  ): void {
    void dynamicUniformOffset;

    if (!(draw.buffers.instanceBuffer instanceof WebGl2Buffer)) {
      throw new Error('Seat pipeline requires a WebGL2 instance buffer');
    }

    gl.useProgram(this.resources.program);
    this.applyUniforms(gl, draw.uniformStructData);
    this.bindInstanceAttributes(gl, draw.buffers.instanceBuffer, draw.instanceRange.startInstance);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, draw.instanceRange.instanceCount);
  }

  private applyUniforms(gl: WebGL2RenderingContext, data: ArrayBuffer | ArrayBufferView): void {
    const bytes = uniformStructBytes(data);

    if (bytes.byteLength !== SEAT_UNIFORM_STRUCT_SIZE_BYTES) {
      throw new Error(
        `Expected ${SEAT_UNIFORM_STRUCT_SIZE_BYTES} seat uniform bytes, received ${bytes.byteLength}`,
      );
    }

    const alignedBytes =
      bytes.byteOffset % 4 === 0
        ? bytes
        : new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const floats = new Float32Array(
      alignedBytes.buffer,
      alignedBytes.byteOffset,
      alignedBytes.byteLength / 4,
    );
    const words = new Uint32Array(
      alignedBytes.buffer,
      alignedBytes.byteOffset,
      alignedBytes.byteLength / 4,
    );
    const paletteOffset = SEAT_UNIFORM_PALETTE_OFFSET_BYTES / 4;

    gl.uniformMatrix4fv(
      this.resources.uniforms.viewProjection,
      false,
      floats.subarray(
        SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES / 4,
        SEAT_UNIFORM_VIEW_PROJECTION_OFFSET_BYTES / 4 + SEAT_UNIFORM_VIEW_PROJECTION_FLOATS,
      ),
    );
    gl.uniform4fv(
      this.resources.uniforms.palette,
      floats.subarray(paletteOffset, paletteOffset + SEAT_PALETTE_COLOR_COUNT * 4),
    );
    gl.uniform1ui(
      this.resources.uniforms.lodLevel,
      words[SEAT_UNIFORM_LOD_LEVEL_OFFSET_BYTES / 4],
    );
  }

  private bindInstanceAttributes(
    gl: WebGL2RenderingContext,
    instanceBuffer: WebGl2Buffer,
    startInstance: number,
  ): void {
    const baseOffset = startInstance * SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.arrayStride;

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer.nativeBuffer);
    gl.enableVertexAttribArray(SEAT_ATTRIBUTE_LOCATION_POSITION);
    gl.vertexAttribPointer(
      SEAT_ATTRIBUTE_LOCATION_POSITION,
      2,
      gl.FLOAT,
      false,
      SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.arrayStride,
      baseOffset + SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.attributes[0].offset,
    );
    gl.vertexAttribDivisor(SEAT_ATTRIBUTE_LOCATION_POSITION, 1);

    gl.enableVertexAttribArray(SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION);
    gl.vertexAttribPointer(
      SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION,
      2,
      gl.FLOAT,
      false,
      SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.arrayStride,
      baseOffset + SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.attributes[1].offset,
    );
    gl.vertexAttribDivisor(SEAT_ATTRIBUTE_LOCATION_SIZE_ROTATION, 1);

    gl.enableVertexAttribArray(SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX);
    gl.vertexAttribIPointer(
      SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX,
      1,
      gl.UNSIGNED_INT,
      SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.arrayStride,
      baseOffset + SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.attributes[2].offset,
    );
    gl.vertexAttribDivisor(SEAT_ATTRIBUTE_LOCATION_COLOR_INDEX, 1);

    gl.enableVertexAttribArray(SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS);
    gl.vertexAttribIPointer(
      SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS,
      1,
      gl.UNSIGNED_INT,
      SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.arrayStride,
      baseOffset + SEAT_INSTANCE_WEBGL2_VERTEX_BUFFER_LAYOUT.attributes[3].offset,
    );
    gl.vertexAttribDivisor(SEAT_ATTRIBUTE_LOCATION_STATE_FLAGS, 1);
  }
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error(`WebGL2 createShader() returned null for ${label}`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`${label}: ${info}`);
  }

  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
  label: string,
): WebGLProgram {
  const program = gl.createProgram();

  if (!program) {
    throw new Error(`WebGL2 createProgram() returned null for ${label}`);
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`${label}: ${info}`);
  }

  return program;
}

function requireUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);

  if (!location) {
    throw new Error(`WebGL2 uniform ${name} was not found`);
  }

  return location;
}

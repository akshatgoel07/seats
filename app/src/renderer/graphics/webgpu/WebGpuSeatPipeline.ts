import type { GraphicsEncodedDraw, GraphicsPipeline, StableDescriptorValue } from '../RenderTypes';
import {
  SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT,
  SEAT_SHADER_CONTRACT_VERSION,
  SEAT_SHADER_PROGRAM_ID,
  SEAT_UNIFORM_BINDING,
  SEAT_UNIFORM_STRUCT_SIZE_BYTES,
} from '../shaders/shader-contract';
import seatInstanceShaderSource from '../shaders/wgsl/seat-instance.wgsl?raw';
import { WebGpuBuffer, type WebGpuDevice } from './WebGpuDevice';
import {
  WEBGPU_SHADER_STAGE,
  type WebGpuBindGroupLayout,
  type WebGpuRenderPassEncoder,
  type WebGpuRenderPipeline,
} from './webgpu-types';

interface WebGpuSeatPipelineResources {
  readonly bindGroupLayout: WebGpuBindGroupLayout;
  readonly renderPipeline: WebGpuRenderPipeline;
}

export class WebGpuSeatPipeline implements GraphicsPipeline<WebGpuRenderPassEncoder> {
  readonly id = SEAT_SHADER_PROGRAM_ID;
  readonly uniformStructSizeBytes = SEAT_UNIFORM_STRUCT_SIZE_BYTES;

  private constructor(
    private readonly graphicsDevice: WebGpuDevice,
    readonly descriptor: StableDescriptorValue,
    private readonly resources: WebGpuSeatPipelineResources,
  ) {}

  static async create(graphicsDevice: WebGpuDevice): Promise<WebGpuSeatPipeline> {
    const descriptor = WebGpuSeatPipeline.createDescriptor(graphicsDevice);
    const resources = await graphicsDevice.getOrCreatePipeline<Promise<WebGpuSeatPipelineResources>>(
      descriptor,
      () => WebGpuSeatPipeline.createResources(graphicsDevice),
    );

    return new WebGpuSeatPipeline(graphicsDevice, descriptor, resources);
  }

  private static createDescriptor(graphicsDevice: WebGpuDevice): StableDescriptorValue {
    return {
      backend: 'webgpu',
      kind: 'render-pipeline',
      programId: SEAT_SHADER_PROGRAM_ID,
      shaderContractVersion: SEAT_SHADER_CONTRACT_VERSION,
      colorFormat: graphicsDevice.presentationFormat,
      uniformStructSizeBytes: SEAT_UNIFORM_STRUCT_SIZE_BYTES,
      instanceLayout: SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT,
    };
  }

  private static async createResources(
    graphicsDevice: WebGpuDevice,
  ): Promise<WebGpuSeatPipelineResources> {
    const device = graphicsDevice.nativeDevice;
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'seat-instance-uniform-bind-group-layout',
      entries: [
        {
          binding: SEAT_UNIFORM_BINDING,
          visibility: WEBGPU_SHADER_STAGE.VERTEX | WEBGPU_SHADER_STAGE.FRAGMENT,
          buffer: {
            type: 'uniform',
            hasDynamicOffset: true,
            minBindingSize: SEAT_UNIFORM_STRUCT_SIZE_BYTES,
          },
        },
      ],
    });
    const shaderModule = await graphicsDevice.createValidatedShaderModule({
      label: 'seat-instance-wgsl',
      code: seatInstanceShaderSource,
    });

    const renderPipeline = await graphicsDevice.createValidatedRenderPipeline(
      'seat-instance-render-pipeline',
      () =>
        device.createRenderPipeline({
          label: 'seat-instance-render-pipeline',
          layout: device.createPipelineLayout({
            label: 'seat-instance-pipeline-layout',
            bindGroupLayouts: [bindGroupLayout],
          }),
          vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
            buffers: [
              {
                arrayStride: SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT.arrayStride,
                stepMode: SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT.stepMode,
                attributes: SEAT_INSTANCE_WEBGPU_VERTEX_BUFFER_LAYOUT.attributes.map(
                  (attribute) => ({
                    shaderLocation: attribute.shaderLocation,
                    offset: attribute.offset,
                    format: attribute.format,
                  }),
                ),
              },
            ],
          },
          fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [
              {
                format: graphicsDevice.presentationFormat,
                blend: {
                  color: {
                    srcFactor: 'src-alpha',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                  alpha: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                },
              },
            ],
          },
          primitive: {
            topology: 'triangle-list',
          },
          multisample: {
            count: 1,
          },
        }),
    );

    return { bindGroupLayout, renderPipeline };
  }

  encodeDraw(
    pass: WebGpuRenderPassEncoder,
    draw: GraphicsEncodedDraw<WebGpuRenderPassEncoder>,
    dynamicUniformOffset: number,
  ): void {
    if (!(draw.buffers.instanceBuffer instanceof WebGpuBuffer)) {
      throw new Error('Seat pipeline requires a WebGPU instance buffer');
    }

    const uniformBindGroup = this.graphicsDevice.getUniformBindGroup(
      {
        kind: 'bind-group',
        programId: SEAT_SHADER_PROGRAM_ID,
        shaderContractVersion: SEAT_SHADER_CONTRACT_VERSION,
      },
      this.resources.bindGroupLayout,
      SEAT_UNIFORM_STRUCT_SIZE_BYTES,
    );

    pass.setPipeline(this.resources.renderPipeline);
    pass.setBindGroup(0, uniformBindGroup, [dynamicUniformOffset]);
    pass.setVertexBuffer(0, draw.buffers.instanceBuffer.nativeBuffer);
    pass.draw(6, draw.instanceRange.instanceCount, 0, draw.instanceRange.startInstance);
  }
}

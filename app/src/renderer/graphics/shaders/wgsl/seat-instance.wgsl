const PALETTE_COLOR_COUNT: u32 = 16u;
const STATE_SELECTED: u32 = 1u;
const STATE_HOVERED: u32 = 2u;
const STATE_UNAVAILABLE: u32 = 4u;

struct SeatUniforms {
  viewProjection: mat4x4<f32>,
  palette: array<vec4<f32>, 16>,
};

struct VertexInput {
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) position: vec2<f32>,
  @location(1) sizeRotation: vec2<f32>,
  @location(2) colorIndex: u32,
  @location(3) stateFlags: u32,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) localPosition: vec2<f32>,
  @location(1) @interpolate(flat) colorIndex: u32,
  @location(2) @interpolate(flat) stateFlags: u32,
};

struct FragmentInput {
  @location(0) localPosition: vec2<f32>,
  @location(1) @interpolate(flat) colorIndex: u32,
  @location(2) @interpolate(flat) stateFlags: u32,
};

@group(0) @binding(0) var<uniform> uniforms: SeatUniforms;

fn quadCorner(vertexIndex: u32) -> vec2<f32> {
  switch vertexIndex {
    case 0u: {
      return vec2<f32>(-1.0, -1.0);
    }
    case 1u: {
      return vec2<f32>(1.0, -1.0);
    }
    case 2u: {
      return vec2<f32>(-1.0, 1.0);
    }
    case 3u: {
      return vec2<f32>(-1.0, 1.0);
    }
    case 4u: {
      return vec2<f32>(1.0, -1.0);
    }
    default: {
      return vec2<f32>(1.0, 1.0);
    }
  }
}

fn hasFlag(flags: u32, flag: u32) -> bool {
  return (flags & flag) != 0u;
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let localPosition = quadCorner(input.vertexIndex);
  let radius = input.sizeRotation.x * 0.5;
  let worldPosition = input.position + localPosition * radius;

  var output: VertexOutput;
  output.clipPosition = uniforms.viewProjection * vec4<f32>(worldPosition, 0.0, 1.0);
  output.localPosition = localPosition;
  output.colorIndex = input.colorIndex;
  output.stateFlags = input.stateFlags;
  return output;
}

@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  let distanceFromCenter = length(input.localPosition);

  if (distanceFromCenter > 1.0) {
    discard;
  }

  let paletteIndex = min(input.colorIndex, PALETTE_COLOR_COUNT - 1u);
  let paletteColor = uniforms.palette[paletteIndex];
  let edgeAlpha = 1.0 - smoothstep(0.94, 1.0, distanceFromCenter);

  var rgb = paletteColor.rgb;

  if (hasFlag(input.stateFlags, STATE_SELECTED)) {
    let ring = 1.0 - smoothstep(0.025, 0.075, abs(distanceFromCenter - 0.78));
    rgb = mix(rgb, vec3<f32>(1.0, 0.96, 0.55), ring * 0.88);
    rgb = mix(rgb, vec3<f32>(1.0), 0.16);
  }

  if (hasFlag(input.stateFlags, STATE_HOVERED)) {
    rgb = mix(rgb, vec3<f32>(1.0), 0.22);
  }

  if (hasFlag(input.stateFlags, STATE_UNAVAILABLE)) {
    let gray = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, vec3<f32>(gray), 0.72) * 0.58;
  }

  return vec4<f32>(rgb, paletteColor.a * edgeAlpha);
}

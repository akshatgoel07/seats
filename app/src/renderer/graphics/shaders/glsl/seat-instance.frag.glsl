#version 300 es
precision highp float;
precision highp int;

const uint PALETTE_COLOR_COUNT = 16u;
const uint LOD_DOTS = 0u;
const uint STATE_SELECTED = 1u;
const uint STATE_HOVERED = 2u;
const uint STATE_UNAVAILABLE = 4u;

uniform vec4 u_palette[16];
uniform uint u_lod_level;

in vec2 v_local_position;
flat in uint v_color_index;
flat in uint v_state_flags;

out vec4 out_color;

bool hasFlag(uint flags, uint flag) {
  return (flags & flag) != 0u;
}

void main() {
  float distanceFromCenter = length(v_local_position);

  if (distanceFromCenter > 1.0) {
    discard;
  }

  uint paletteIndex = min(v_color_index, PALETTE_COLOR_COUNT - 1u);
  vec4 paletteColor = u_palette[int(paletteIndex)];
  float edgeAlpha = 1.0 - smoothstep(0.94, 1.0, distanceFromCenter);

  vec3 rgb = paletteColor.rgb;

  if (u_lod_level != LOD_DOTS) {
    if (hasFlag(v_state_flags, STATE_SELECTED)) {
      float ring = 1.0 - smoothstep(0.025, 0.075, abs(distanceFromCenter - 0.78));
      rgb = mix(rgb, vec3(1.0, 0.96, 0.55), ring * 0.88);
      rgb = mix(rgb, vec3(1.0), 0.16);
    }

    if (hasFlag(v_state_flags, STATE_HOVERED)) {
      rgb = mix(rgb, vec3(1.0), 0.22);
    }

    if (hasFlag(v_state_flags, STATE_UNAVAILABLE)) {
      float gray = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(rgb, vec3(gray), 0.72) * 0.58;
    }
  }

  out_color = vec4(rgb, paletteColor.a * edgeAlpha);
}

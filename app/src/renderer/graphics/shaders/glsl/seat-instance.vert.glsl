#version 300 es

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_size_rotation;
layout(location = 2) in uint a_color_index;
layout(location = 3) in uint a_state_flags;

uniform mat4 u_view_projection;

out vec2 v_local_position;
flat out uint v_color_index;
flat out uint v_state_flags;

vec2 quadCorner(int vertexIndex) {
  if (vertexIndex == 0) {
    return vec2(-1.0, -1.0);
  }

  if (vertexIndex == 1) {
    return vec2(1.0, -1.0);
  }

  if (vertexIndex == 2 || vertexIndex == 3) {
    return vec2(-1.0, 1.0);
  }

  if (vertexIndex == 4) {
    return vec2(1.0, -1.0);
  }

  return vec2(1.0, 1.0);
}

void main() {
  vec2 localPosition = quadCorner(gl_VertexID);
  float radius = a_size_rotation.x * 0.5;
  vec2 worldPosition = a_position + localPosition * radius;

  gl_Position = u_view_projection * vec4(worldPosition, 0.0, 1.0);
  v_local_position = localPosition;
  v_color_index = a_color_index;
  v_state_flags = a_state_flags;
}

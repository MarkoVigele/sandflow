uniform float uSize;

varying float vAlive;

void main() {
  bool finitePos = position.x == position.x && position.y == position.y && position.z == position.z;
  vAlive = finitePos ? 1.0 : 0.0;
  vec3 pos = finitePos ? position : vec3(0.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.35);
  float size = uSize * (140.0 / dist);
  gl_PointSize = vAlive > 0.5 ? clamp(size, 2.0, 9.0) : 0.0;
}

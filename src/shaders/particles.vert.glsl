uniform float uSize;

attribute float aKind;
attribute float aLife;

varying float vAlive;
varying float vKind;
varying float vLife;

void main() {
  bool finitePos = position.x == position.x && position.y == position.y && position.z == position.z;
  float life = aLife == aLife ? clamp(aLife, 0.0, 1.0) : 1.0;
  vAlive = finitePos && life > 0.04 ? 1.0 : 0.0;
  vKind = aKind == aKind ? aKind : 0.0;
  vLife = life;
  vec3 pos = finitePos ? position : vec3(0.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.35);
  float size = uSize * (155.0 / dist);
  if (vKind > 1.5) size *= 0.52;
  else if (vKind > 0.5) size *= 1.22;
  float lo = vKind > 1.5 ? 1.5 : vKind > 0.5 ? 2.6 : 2.2;
  float hi = vKind > 1.5 ? 5.6 : vKind > 0.5 ? 13.0 : 11.0;
  gl_PointSize = vAlive > 0.5 ? clamp(size, lo, hi) : 0.0;
}

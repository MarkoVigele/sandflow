attribute float aKind;
attribute float aSeed;
attribute float aFlow;

uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;

varying float vKind;
varying float vSeed;
varying float vFlow;

void main() {
  vKind = aKind;
  vSeed = aSeed;
  vFlow = aFlow;
  vec3 pos = position;
  float bob = aKind > 0.5
    ? sin(uTime * 9.0 + aSeed * 6.2831) * 0.016
    : sin(uTime * 2.2 + aSeed * 4.0) * 0.004;
  pos.y += bob;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(uSize * 0.72, uSize * 1.15, aKind);
  size *= 0.9 + clamp(aFlow, 0.0, 0.2) * 1.6;
  gl_PointSize = size * uPixelRatio * (8.0 / max(2.2, -mv.z));
}

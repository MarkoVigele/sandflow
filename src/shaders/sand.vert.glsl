uniform sampler2D uMaps;
uniform sampler2D uMapsBefore;
uniform float uCompare;
uniform float uWipe;
uniform float uHeightScale;
uniform float uRelief;
uniform float uPivot;
uniform float uTexel;
uniform float uTraySize;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;
varying float vComparePick;

vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len2 = dot(v, v);
  if (!(len2 > 1.0e-12)) return fallback;
  vec3 n = v * inversesqrt(len2);
  if (!(n.x == n.x && n.y == n.y && n.z == n.z)) return fallback;
  return n;
}

float comparePick(vec3 pos) {
  if (uCompare < 0.5) return 0.0;
  if (uCompare > 1.5) return 1.0;
  vec4 clipFlat = projectionMatrix * modelViewMatrix * vec4(pos.x, 0.0, pos.z, 1.0);
  float sx = clipFlat.x / max(abs(clipFlat.w), 1.0e-5) * 0.5 + 0.5;
  return step(sx, uWipe);
}

vec4 sampleMaps(vec2 coord, float pick) {
  return mix(texture2D(uMaps, coord), texture2D(uMapsBefore, coord), pick);
}

float safeHeight(vec2 coord, float pick) {
  float h01 = sampleMaps(coord, pick).r;
  if (!(h01 == h01)) h01 = 0.0;
  float relief = uRelief > 0.05 ? uRelief : 1.0;
  float h = (uPivot + (h01 - uPivot) * relief) * uHeightScale;
  return (h == h) ? h : 0.0;
}

// World: u+ → +X, v+ → −Z (PlaneGeometry after rotateX). Must match AimCursor.heightfieldNormal.
void main() {
  vUv = uv;
  float pick = comparePick(position);
  vComparePick = pick;
  float h = safeHeight(uv, pick);
  float texel = max(uTexel, 1.0e-4);
  float tray = uTraySize > 0.5 ? uTraySize : 8.0;

  float hL = safeHeight(uv + vec2(-texel, 0.0), pick);
  float hR = safeHeight(uv + vec2(texel, 0.0), pick);
  float hVp = safeHeight(uv + vec2(0.0, texel), pick);
  float hVm = safeHeight(uv + vec2(0.0, -texel), pick);
  float dx = texel * tray;
  vNormalW = safeNormalize(vec3(hL - hR, 2.0 * dx, hVp - hVm), vec3(0.0, 1.0, 0.0));

  vec3 pos = position;
  pos.y = h;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  vViewDir = cameraPosition - vWorldPos;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

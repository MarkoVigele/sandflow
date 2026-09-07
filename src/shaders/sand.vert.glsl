uniform sampler2D uMaps;
uniform float uHeightScale;
uniform float uTexel;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;

vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len2 = dot(v, v);
  if (!(len2 > 1.0e-12)) return fallback;
  vec3 n = v * inversesqrt(len2);
  if (!(n.x == n.x && n.y == n.y && n.z == n.z)) return fallback;
  return n;
}

float safeHeight(vec2 coord) {
  float h = texture2D(uMaps, coord).r * uHeightScale;
  return (h == h) ? h : 0.0;
}

void main() {
  vUv = uv;
  float h = safeHeight(uv);
  float texel = max(uTexel, 1.0e-4);

  float hL = safeHeight(uv + vec2(-texel, 0.0));
  float hR = safeHeight(uv + vec2(texel, 0.0));
  float hD = safeHeight(uv + vec2(0.0, -texel));
  float hU = safeHeight(uv + vec2(0.0, texel));
  vNormalW = safeNormalize(vec3(hL - hR, 2.0 * texel * 16.0, hD - hU), vec3(0.0, 1.0, 0.0));

  vec3 pos = position;
  pos.y = h;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  vViewDir = cameraPosition - vWorldPos;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

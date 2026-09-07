uniform sampler2D uMaps;
uniform float uHeightScale;
uniform float uTexel;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;

#include <common>
#include <shadowmap_pars_vertex>

void main() {
  vUv = uv;
  vec4 sampleH = texture2D(uMaps, uv);
  float h = sampleH.r * uHeightScale;

  float hL = texture2D(uMaps, uv + vec2(-uTexel, 0.0)).r * uHeightScale;
  float hR = texture2D(uMaps, uv + vec2(uTexel, 0.0)).r * uHeightScale;
  float hD = texture2D(uMaps, uv + vec2(0.0, -uTexel)).r * uHeightScale;
  float hU = texture2D(uMaps, uv + vec2(0.0, uTexel)).r * uHeightScale;
  vec3 n = normalize(vec3(hL - hR, 2.0 * uTexel * 8.0, hD - hU));
  vNormalW = n;

  vec3 pos = position;
  pos.y = h;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  vViewDir = cameraPosition - vWorldPos;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;

  #include <shadowmap_vertex>
}

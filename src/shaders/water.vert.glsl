uniform sampler2D uMaps;
uniform float uHeightScale;
uniform float uTexel;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;
varying float vDepth;
varying float vFlow;

void main() {
  vUv = uv;
  vec4 sampleH = texture2D(uMaps, uv);
  float terrain = sampleH.r;
  float water = sampleH.g;
  vDepth = water;
  vFlow = sampleH.a;

  float texel = max(uTexel, 0.0015);
  float hL = texture2D(uMaps, uv + vec2(-texel, 0.0)).r + texture2D(uMaps, uv + vec2(-texel, 0.0)).g;
  float hR = texture2D(uMaps, uv + vec2(texel, 0.0)).r + texture2D(uMaps, uv + vec2(texel, 0.0)).g;
  float hD = texture2D(uMaps, uv + vec2(0.0, -texel)).r + texture2D(uMaps, uv + vec2(0.0, -texel)).g;
  float hU = texture2D(uMaps, uv + vec2(0.0, texel)).r + texture2D(uMaps, uv + vec2(0.0, texel)).g;
  vNormalW = normalize(vec3(hL - hR, 2.0 * texel * 6.5, hD - hU));

  float h = (terrain + max(water, 0.0) + 0.004) * uHeightScale;
  vec3 pos = position;
  pos.y = h;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  vViewDir = cameraPosition - vWorldPos;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

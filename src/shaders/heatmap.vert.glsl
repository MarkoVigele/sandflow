uniform sampler2D uMaps;
uniform float uHeightScale;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 maps = texture2D(uMaps, uv);
  float terrain = maps.r;
  if (!(terrain == terrain)) terrain = 0.0;
  float water = maps.g;
  if (!(water == water) || water < 0.0) water = 0.0;
  float h = (terrain + min(water, 0.08) * 0.12 + 0.008) * uHeightScale;
  vec3 pos = position;
  pos.y = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

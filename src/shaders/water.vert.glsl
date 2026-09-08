uniform sampler2D uMaps;
uniform float uHeightScale;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float vDepth;
varying float vFlow;

void main() {
  vUv = uv;
  vec4 sampleH = texture2D(uMaps, uv);
  float terrain = sampleH.r;
  float water = sampleH.g;
  if (!(terrain == terrain)) terrain = 0.0;
  if (!(water == water) || water < 0.0) water = 0.0;
  vDepth = water;
  float flow = sampleH.a;
  vFlow = (flow == flow && flow > 0.0) ? flow : 0.0;
  float sheet = 0.0;
  if (water > 0.0008) {
    // Lab film with readable depth: beds sit higher than thin veins.
    float body = min(water, 0.16);
    sheet = 0.0045 + body * 0.36 + min(vFlow, 0.22) * 0.012;
  }
  float h = (terrain + sheet) * uHeightScale;
  if (!(h == h)) h = 0.0;
  vec3 pos = position;
  pos.y = h;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  vViewDir = cameraPosition - vWorldPos;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

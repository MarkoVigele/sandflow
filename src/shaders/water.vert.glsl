uniform sampler2D uMaps;
uniform float uHeightScale;
uniform float uRelief;
uniform float uPivot;
uniform float uTexel;
uniform float uTime;
uniform float uQuality;
uniform float uWaveDisplace;
uniform float uWaveOctaves;
uniform float uWaveAmp;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vViewPos;
varying float vDepth;
varying float vFlow;
varying float vWave;

vec2 safeDir(vec2 g, vec2 fallback) {
  if (!(g.x == g.x && g.y == g.y)) return fallback;
  float len2 = dot(g, g);
  if (len2 < 1.0e-10) return fallback;
  return g * inversesqrt(len2);
}

float flowWave(vec2 uv, float water, float flow) {
  float ampScale = uWaveAmp > 0.0 ? uWaveAmp : 0.0;
  if (!(ampScale == ampScale)) ampScale = 1.0;
  if (uWaveDisplace <= 1.0e-6 || uQuality < 0.5 || water < 0.004 || ampScale <= 1.0e-5) return 0.0;
  float body = smoothstep(0.005, 0.05, water);
  float fl = clamp(flow, 0.0, 0.4);
  float stream = smoothstep(0.012, 0.10, fl);
  float amp = uWaveDisplace * ampScale * body * stream * (0.22 + fl * 3.2);
  if (amp < 1.0e-6) return 0.0;

  float texel = max(uTexel, 0.0015);
  vec4 sL = texture2D(uMaps, uv + vec2(-texel, 0.0));
  vec4 sR = texture2D(uMaps, uv + vec2(texel, 0.0));
  vec4 sVm = texture2D(uMaps, uv + vec2(0.0, -texel));
  vec4 sVp = texture2D(uMaps, uv + vec2(0.0, texel));
  vec2 dir = safeDir(
    vec2((sL.r + sL.g) - (sR.r + sR.g), (sVp.r + sVp.g) - (sVm.r + sVm.g)),
    vec2(0.72, 0.42)
  );
  vec2 dir2 = vec2(-dir.y, dir.x);

  float h = sin(dot(uv, dir) * 28.0 + uTime * 1.65 + flow * 3.4) * amp;
  if (uWaveOctaves > 1.5) {
    h += sin(dot(uv, dir2) * 46.0 - uTime * 2.12 + flow * 2.1) * amp * 0.46;
  }
  if (uWaveOctaves > 2.5) {
    h += sin(dot(uv, dir * 0.85 + dir2 * 0.55) * 71.0 + uTime * 2.85) * amp * 0.24;
  }
  if (uWaveOctaves > 3.5) {
    h += sin((uv.x * 1.4 - uv.y) * 108.0 + uTime * 3.9 + flow * 5.5) * amp * 0.13;
  }
  if (!(h == h)) return 0.0;
  return h;
}

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
  float wave = 0.0;
  if (water > 0.0008) {
    // Films stay a lab sheet; carved / ponded beds lift so pools read as volume.
    float film = min(water, 0.02);
    float pool = max(0.0, min(water, 0.24) - 0.02);
    float deep = smoothstep(0.022, 0.13, water);
    sheet = 0.0034 + film * 0.22 + pool * 0.44 + deep * 0.016 + min(vFlow, 0.18) * 0.008;
    wave = flowWave(uv, water, vFlow);
    sheet += wave;
  }
  vWave = wave;
  float h01 = terrain + sheet;
  float relief = uRelief > 0.05 ? uRelief : 1.0;
  float h = (uPivot + (h01 - uPivot) * relief) * uHeightScale;
  if (!(h == h)) h = 0.0;
  vec3 pos = position;
  pos.y = h;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  vViewDir = cameraPosition - vWorldPos;
  vViewPos = (viewMatrix * worldPosition).xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

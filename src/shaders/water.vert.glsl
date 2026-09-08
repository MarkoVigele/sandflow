uniform sampler2D uMaps;
uniform sampler2D uMapsBefore;
uniform float uCompare;
uniform float uWipe;
uniform float uHeightScale;
uniform float uRelief;
uniform float uPivot;
uniform float uTexel;
uniform float uTime;
uniform float uQuality;
uniform float uWaveDisplace;
uniform float uWaveOctaves;
uniform float uWaveAmp;
uniform float uSheetCap;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vViewPos;
varying float vDepth;
varying float vFlow;
varying float vWave;
varying float vComparePick;

// Hard ceiling in heightmap units. Relief × world must never grow a needle.
// 0.012 × 1.5 × 2.5 ≈ 4.5 cm on the tray — a coating, not a column.
const float SHEET_CAP_DEFAULT = 0.012;
const float POND_LIFT_START = 0.022;
const float POND_LIFT_FULL = 0.055;
const float POND_LIFT_CAP = 0.42;

vec2 safeDir(vec2 g, vec2 fallback) {
  if (!(g.x == g.x && g.y == g.y)) return fallback;
  float len2 = dot(g, g);
  if (len2 < 1.0e-10) return fallback;
  return g * inversesqrt(len2);
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

float wat(vec2 p) {
  float w = sampleMaps(p, vComparePick).g;
  return (w == w && w > 0.0) ? w : 0.0;
}

float ter(vec2 p, float fallback) {
  float t = sampleMaps(p, vComparePick).r;
  return t == t ? t : fallback;
}

// Wide blur + inlet flatten. Isolated pour/source/rain cells cannot cone.
float smoothWater(vec2 uv, float texel) {
  float t = texel;
  float t2 = texel * 2.35;
  float t3 = texel * 3.4;
  float c = wat(uv);
  float wL = wat(uv + vec2(-t, 0.0));
  float wR = wat(uv + vec2(t, 0.0));
  float wD = wat(uv + vec2(0.0, -t));
  float wU = wat(uv + vec2(0.0, t));
  float n1 = wL + wR + wD + wU;
  float n1d =
    wat(uv + vec2(-t, -t)) + wat(uv + vec2(t, -t)) +
    wat(uv + vec2(-t, t)) + wat(uv + vec2(t, t));
  float n2 =
    wat(uv + vec2(-t2, 0.0)) + wat(uv + vec2(t2, 0.0)) +
    wat(uv + vec2(0.0, -t2)) + wat(uv + vec2(0.0, t2));
  float n3 =
    wat(uv + vec2(-t3, 0.0)) + wat(uv + vec2(t3, 0.0)) +
    wat(uv + vec2(0.0, -t3)) + wat(uv + vec2(0.0, t3));
  float avg = (c * 4.0 + n1 * 2.2 + n1d * 1.3 + n2 * 0.8 + n3 * 0.35) / 22.15;
  float nMax = max(max(wL, wR), max(wD, wU));
  float isolated = smoothstep(nMax * 1.28 + 0.006, nMax * 1.7 + 0.02, c);
  float pad = mix(0.014, 0.0055, isolated);
  return min(avg, nMax + pad);
}

// Thin continuous coating for streams. Ponds use visualLift.
float sheetFromColumn(float column) {
  float w = max(column, 0.0);
  float cover = smoothstep(0.0006, 0.014, w);
  float body = smoothstep(0.008, 0.10, w);
  float cap = uSheetCap > 1.0e-5 ? uSheetCap : SHEET_CAP_DEFAULT;
  return min((0.0030 + body * 0.0065) * cover, cap);
}

// Streams stay a film. A still pond rises with the column so a dam can fill.
float visualLift(float column) {
  float film = sheetFromColumn(column);
  float w = max(column, 0.0);
  float pond = smoothstep(POND_LIFT_START, POND_LIFT_FULL, w);
  float rise = min(w, POND_LIFT_CAP);
  return mix(film, rise, pond);
}

// Flow-aligned Gerstner ripples. Still water stays flat. Cap is the sheet.
float flowWave(vec2 uv, float water, float flow, vec2 dir) {
  float ampScale = uWaveAmp > 0.0 ? uWaveAmp : 0.0;
  if (!(ampScale == ampScale)) ampScale = 1.0;
  if (uWaveDisplace <= 1.0e-6 || uQuality < 0.5 || water < 0.006 || ampScale <= 1.0e-5) return 0.0;
  float body = smoothstep(0.008, 0.055, water);
  float fl = clamp(flow, 0.0, 0.35);
  float stream = smoothstep(0.038, 0.15, fl);
  float amp = uWaveDisplace * ampScale * body * stream * (0.18 + fl * 1.8);
  float cap = uSheetCap > 1.0e-5 ? uSheetCap : SHEET_CAP_DEFAULT;
  amp = min(amp, cap * 0.45);
  if (amp < 1.0e-6) return 0.0;

  vec2 dir2 = vec2(-dir.y, dir.x);
  float spd = 0.85 + fl * 2.1;
  float h = sin(dot(uv, dir) * 10.5 + uTime * spd + flow * 1.5) * amp;
  if (uWaveOctaves > 1.5) {
    h += sin(dot(uv, dir2) * 17.5 - uTime * (spd * 1.15) + flow * 1.1) * amp * 0.36;
  }
  if (uWaveOctaves > 2.5) {
    h += sin(dot(uv, dir * 0.78 + dir2 * 0.4) * 25.0 + uTime * (spd * 1.45)) * amp * 0.16;
  }
  if (uWaveOctaves > 3.5) {
    h += sin(dot(uv, dir * 0.32 - dir2 * 0.92) * 33.0 + uTime * (spd * 1.7) + flow * 2.0) * amp * 0.07;
  }
  if (!(h == h)) return 0.0;
  return clamp(h, -amp, amp);
}

void main() {
  vUv = uv;
  vComparePick = comparePick(position);
  float texel = max(uTexel, 0.0015);
  vec4 sampleH = sampleMaps(uv, vComparePick);
  float terrain = sampleH.r;
  if (!(terrain == terrain)) terrain = 0.0;

  float wSmooth = smoothWater(uv, texel);
  vDepth = wSmooth;

  float flow = sampleH.a;
  vFlow = (flow == flow && flow > 0.0) ? flow : 0.0;

  // Streams: thin sheet. Ponds: hydrostatic column. Dry verts tuck under cliffs
  // so the mesh cannot climb a dam face (the needle regression).
  float cap = uSheetCap > 1.0e-5 ? uSheetCap : SHEET_CAP_DEFAULT;
  float lift = visualLift(wSmooth);
  float wave = 0.0;
  vec2 dir = safeDir(
    vec2(
      (ter(uv + vec2(-texel, 0.0), terrain) + wat(uv + vec2(-texel, 0.0))) -
        (ter(uv + vec2(texel, 0.0), terrain) + wat(uv + vec2(texel, 0.0))),
      (ter(uv + vec2(0.0, texel), terrain) + wat(uv + vec2(0.0, texel))) -
        (ter(uv + vec2(0.0, -texel), terrain) + wat(uv + vec2(0.0, -texel)))
    ),
    vec2(0.72, 0.42)
  );
  wave = flowWave(uv, wSmooth, vFlow, dir);
  float pond = smoothstep(POND_LIFT_START, POND_LIFT_FULL, wSmooth);
  lift = max(lift + wave * (1.0 - pond * 0.35), 0.0);
  vWave = wave;

  float h01 = terrain + min(lift, POND_LIFT_CAP + cap);
  if (wSmooth < 0.0008) {
    float tuck = 1.0e9;
    float found = 0.0;
    float r1 = max(texel * 2.0, 0.012);
    float r2 = max(texel * 6.0, 0.03);
    float r3 = 0.05;
    vec2 o;
    float ww;
    o = uv + vec2(r1, 0.0); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(-r1, 0.0); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(0.0, r1); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(0.0, -r1); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(r2, 0.0); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(-r2, 0.0); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(0.0, r2); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(0.0, -r2); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(r3, 0.0); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(-r3, 0.0); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(0.0, r3); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(0.0, -r3); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(r2, r2); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(-r2, r2); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(r2, -r2); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    o = uv + vec2(-r2, -r2); ww = wat(o); if (ww > 0.008) { found = 1.0; tuck = min(tuck, ter(o, terrain) + visualLift(ww)); }
    if (found > 0.5 && tuck < terrain) h01 = tuck;
  }
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

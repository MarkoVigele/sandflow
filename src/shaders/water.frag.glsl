uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uTexel;
uniform float uHeightScale;
uniform float uRelief;
uniform float uPivot;
uniform float uTraySize;
uniform float uQuality;
uniform float uWaveOctaves;
uniform float uBeerStrength;
uniform float uFresnelScale;
uniform float uFresnelCap;
uniform float uFoamDetail;
uniform float uSpecPower;
uniform float uSpecCap;
uniform float uShoreFoam;
uniform float uSheetCap;
uniform sampler2D uMaps;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vViewPos;
varying float vDepth;
varying float vFlow;
varying float vWave;

const float SHEET_CAP_DEFAULT = 0.012;

vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len2 = dot(v, v);
  if (!(len2 > 1.0e-12)) return fallback;
  vec3 n = v * inversesqrt(len2);
  if (!(n.x == n.x && n.y == n.y && n.z == n.z)) return fallback;
  return n;
}

vec2 safeDir(vec2 g, vec2 fallback) {
  if (!(g.x == g.x && g.y == g.y)) return fallback;
  float len2 = dot(g, g);
  if (len2 < 1.0e-10) return fallback;
  return g * inversesqrt(len2);
}

float wat(vec2 p) {
  float w = texture2D(uMaps, p).g;
  return (w == w && w > 0.0) ? w : 0.0;
}

float ter(vec2 p, float fallback) {
  float t = texture2D(uMaps, p).r;
  return t == t ? t : fallback;
}

float sheetFromColumn(float column) {
  float w = max(column, 0.0);
  float cover = smoothstep(0.0006, 0.014, w);
  float body = smoothstep(0.008, 0.10, w);
  float cap = uSheetCap > 1.0e-5 ? uSheetCap : SHEET_CAP_DEFAULT;
  return min((0.0030 + body * 0.0065) * cover, cap);
}

float displaceY(float h01, float relief) {
  return (uPivot + (h01 - uPivot) * relief) * uHeightScale;
}

float schlick(float ndv, float scale) {
  float x = 1.0 - clamp(ndv, 0.0, 1.0);
  float x2 = x * x;
  return (0.02 + 0.98 * x2 * x2 * x) * scale;
}

void main() {
  float rawW = wat(vUv);
  float col = vDepth > 0.0 ? vDepth : rawW;
  if (rawW < 0.0007 && col < 0.0007) discard;

  float depth = clamp(col * 12.5, 0.0, 1.0);
  float flow = clamp(vFlow, 0.0, 1.0);
  if (!(flow == flow)) flow = 0.0;
  float stream = smoothstep(0.038, 0.15, flow);
  float turbid = clamp(flow * 1.1, 0.0, 0.45);
  float foam = 0.0;

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  float texel = max(uTexel, 0.0015);
  float tray = uTraySize > 0.5 ? uTraySize : 8.0;
  float beer = uBeerStrength > 0.05 ? uBeerStrength : 1.0;
  float fresScale = uFresnelScale > 0.05 ? uFresnelScale : 1.0;
  float fresCap = uFresnelCap > 0.05 ? uFresnelCap : 0.34;
  float foamDet = clamp(uFoamDetail, 0.0, 1.0);
  float relief = uRelief > 0.05 ? uRelief : 1.0;

  float tC = ter(vUv, 0.0);
  float tL = ter(vUv + vec2(-texel, 0.0), tC);
  float tR = ter(vUv + vec2(texel, 0.0), tC);
  float tVm = ter(vUv + vec2(0.0, -texel), tC);
  float tVp = ter(vUv + vec2(0.0, texel), tC);
  float wL = wat(vUv + vec2(-texel, 0.0));
  float wR = wat(vUv + vec2(texel, 0.0));
  float wVm = wat(vUv + vec2(0.0, -texel));
  float wVp = wat(vUv + vec2(0.0, texel));

  // Normals from the same thin sheet the vertices use — never raw SWE depth.
  float hL = displaceY(tL + sheetFromColumn(wL), relief);
  float hR = displaceY(tR + sheetFromColumn(wR), relief);
  float hVp = displaceY(tVp + sheetFromColumn(wVp), relief);
  float hVm = displaceY(tVm + sheetFromColumn(wVm), relief);

  float dx = texel * tray;
  vec2 grad = vec2(hL - hR, hVp - hVm);
  if (!(grad.x == grad.x && grad.y == grad.y)) grad = vec2(0.0);
  float gLen = length(grad);
  grad *= min(1.0, 0.028 / max(gLen, 1.0e-6));
  grad *= smoothstep(0.0009, 0.018, col);
  grad *= mix(0.10, 1.0, stream);

  vec2 fdir = safeDir(vec2((tL + wL) - (tR + wR), (tVp + wVp) - (tVm + wVm)), vec2(0.72, 0.42));
  vec2 fdir2 = vec2(-fdir.y, fdir.x);
  float spd = clamp(flow * 2.2, 0.0, 1.0);
  float flAmp = (0.28 + depth * 0.42) * stream * (0.2 + flow * 1.35);
  float dAlong = cos(dot(vUv, fdir) * 12.0 + uTime * (0.95 + spd * 1.4) + flow * 1.6) * 0.010 * flAmp;
  float dCross = 0.0;
  if (uWaveOctaves > 1.5) {
    dCross = cos(dot(vUv, fdir2) * 19.0 - uTime * 1.45) * 0.0045 * flAmp;
  }
  if (uWaveOctaves > 2.5) {
    dAlong += cos(dot(vUv, fdir * 0.8 + fdir2 * 0.35) * 27.0 + uTime * 1.9) * 0.0024 * flAmp;
  }
  if (uWaveOctaves > 3.5) {
    dAlong += cos(dot(vUv, fdir * 0.3 - fdir2 * 0.85) * 36.0 + uTime * 2.3) * 0.0012 * flAmp;
  }
  dAlong += vWave * 1.05 * stream;

  vec3 N = safeNormalize(
    vec3(grad.x + dAlong * fdir.x + dCross * fdir2.x, 2.0 * dx, grad.y + dAlong * fdir.y + dCross * fdir2.y),
    vec3(0.0, 1.0, 0.0)
  );
  N = safeNormalize(mix(vec3(0.0, 1.0, 0.0), N, mix(0.14, 1.0, stream)), vec3(0.0, 1.0, 0.0));

  vec3 dpdx = dFdx(vWorldPos);
  vec3 dpdy = dFdy(vWorldPos);
  vec3 geoCross = cross(dpdx, dpdy);
  float geoArea = length(geoCross);
  vec3 geoN = geoArea > 1.0e-6 ? safeNormalize(geoCross, vec3(0.0, 1.0, 0.0)) : vec3(0.0, 1.0, 0.0);
  float geoUp = abs(geoN.y);
  if (geoArea > 4.0e-4 && geoUp < 0.28) discard;

  vec3 ssCross = cross(dFdx(vViewPos), dFdy(vViewPos));
  float ssArea = length(ssCross);
  vec3 ssN = ssArea > 1.0e-8 ? safeNormalize(ssCross, vec3(0.0, 0.0, 1.0)) : vec3(0.0, 0.0, 1.0);
  float ssFacing = clamp(abs(ssN.z), 0.0, 1.0);
  float ndv = max(dot(N, V), 0.0);
  float waveF = schlick(ndv, fresScale);
  float ssF = schlick(ssFacing, fresScale);
  float fresnel = mix(waveF, ssF, uQuality > 0.5 ? 0.18 : 0.08);
  fresnel *= mix(0.38, 0.72, depth);
  fresnel = min(fresnel, fresCap);

  // Optical depth from the SWE column (color), not the vertex spike.
  float optical = min(col, 0.22) / max(ndv, 0.16);
  if (uQuality > 0.5) optical = mix(optical, min(col, 0.22) / max(ssFacing, 0.16), 0.22);
  float beerDeep = beer * mix(0.68, 1.42, smoothstep(0.012, 0.14, col));
  vec3 sigma = vec3(2.15, 1.26, 1.06) * beerDeep;
  vec3 trans = exp(-sigma * optical);
  if (!(trans.x == trans.x)) trans = vec3(0.72, 0.78, 0.80);

  vec3 shallow = vec3(0.64, 0.58, 0.46);
  vec3 scatter = vec3(0.42, 0.36, 0.28);
  vec3 silt = vec3(0.52, 0.46, 0.34);
  vec3 foamC = vec3(0.93, 0.94, 0.92);
  vec3 wetSand = vec3(0.34, 0.26, 0.18);
  vec3 body = mix(scatter, shallow, trans);
  vec3 tint = mix(vec3(1.0), vec3(0.56, 0.48, 0.40), smoothstep(0.02, 0.16, col) * 0.72);
  vec3 base = mix(body, silt, turbid * 0.12) * tint;

  float edge = abs(wL - rawW) + abs(wR - rawW) + abs(wVm - rawW) + abs(wVp - rawW);
  float dryN = step(wL, 0.0009) + step(wR, 0.0009) + step(wVm, 0.0009) + step(wVp, 0.0009);
  if (uQuality > 1.5 && foamDet > 0.5) {
    float wLL = wat(vUv + vec2(-texel * 2.0, 0.0));
    float wRR = wat(vUv + vec2(texel * 2.0, 0.0));
    float wDD = wat(vUv + vec2(0.0, -texel * 2.0));
    float wUU = wat(vUv + vec2(0.0, texel * 2.0));
    dryN += 0.55 * (step(wLL, 0.0009) + step(wRR, 0.0009) + step(wDD, 0.0009) + step(wUU, 0.0009));
    edge += 0.45 * (abs(wLL - rawW) + abs(wRR - rawW) + abs(wDD - rawW) + abs(wUU - rawW));
  }

  float thin = 1.0 - smoothstep(0.01, 0.058, col);
  float upFacing = smoothstep(0.62, 0.88, geoUp);
  float contact = smoothstep(0.55, 2.6, dryN) * thin * upFacing;
  float bedJump = abs(tL - tR) + abs(tVm - tVp);
  float drop = smoothstep(0.014, 0.055, edge) * smoothstep(0.055, 0.14, flow);
  float obstacle = smoothstep(0.016, 0.055, bedJump) * smoothstep(0.055, 0.14, flow);
  foam = max(drop, obstacle) * mix(0.42, 0.85, foamDet);
  float shoreAmt = uShoreFoam > 0.01 ? uShoreFoam : 0.4;
  foam += contact * smoothstep(0.045, 0.14, flow) * mix(0.28, 0.82, foamDet) * shoreAmt;
  if (foamDet > 0.35) {
    float lace = sin(dot(vUv, vec2(22.0, 18.0)) + uTime * 1.55 + flow * 3.2);
    if (uQuality > 2.5) {
      lace = mix(lace, sin(dot(vUv, vec2(31.0, -24.0)) - uTime * 1.9), 0.28);
    }
    foam *= mix(0.72, 1.08, lace * 0.5 + 0.5);
  }
  foam = clamp(foam, 0.0, 0.82);

  base = mix(base, wetSand, contact * (1.0 - foam) * 0.18);
  base = mix(base, foamC, foam * mix(0.48, 0.72, foamDet));

  vec3 L = safeNormalize(uSunDir, vec3(0.35, 0.88, 0.28));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float specPow = uSpecPower > 4.0 ? uSpecPower : 22.0;
  float spec = pow(max(dot(N, H), 0.0), mix(specPow * 0.55, specPow * 0.9, 1.0 - foam));
  spec *= mix(0.05, 0.12, depth) * (1.0 - foam * 0.7);
  float specCap = uSpecCap > 0.01 ? uSpecCap : 0.12;
  spec = min(spec, specCap);
  float ndl = max(dot(N, L), 0.0);

  vec3 sky = vec3(0.76, 0.81, 0.86);
  float fresAmt = mix(0.36, 0.50, clamp(uQuality * 0.22, 0.0, 1.0));
  vec3 color = base * (0.80 + ndl * 0.16) + sky * fresnel * fresAmt + uSunColor * spec * 0.30;
  float hi = uQuality < 1.5 ? 0.78 : 0.86;
  color = clamp(color, vec3(0.10), vec3(hi));

  float absorbAlpha = 1.0 - clamp((trans.x + trans.y + trans.z) * 0.333, 0.0, 1.0);
  float lip = smoothstep(0.0007, 0.016, max(rawW, col));
  float alpha = mix(0.12, 0.38, depth) + absorbAlpha * 0.10 + foam * 0.10 + fresnel * 0.18;
  if (geoArea > 4.0e-4) alpha *= mix(0.35, 1.0, smoothstep(0.28, 0.52, geoUp));
  alpha *= lip;
  alpha = clamp(alpha, 0.08, 0.48);

  gl_FragColor = vec4(color, alpha);
}

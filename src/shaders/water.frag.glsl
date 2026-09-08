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
uniform float uFoamDetail;
uniform float uSpecPower;
uniform sampler2D uMaps;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vViewPos;
varying float vDepth;
varying float vFlow;
varying float vWave;

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

float waterAwareHeight(vec4 s, float centerWater) {
  float w = s.g;
  float wet = step(0.0008, w);
  return s.r + mix(centerWater, w, wet);
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
  if (!(vDepth == vDepth) || vDepth < 0.0009) discard;

  float depth = clamp(vDepth * 11.0, 0.0, 1.0);
  float flow = clamp(vFlow, 0.0, 1.0);
  if (!(flow == flow)) flow = 0.0;
  float turbid = clamp(flow * 2.6 + depth * 0.2, 0.0, 0.88);
  float foam = smoothstep(0.028, 0.14, flow) * mix(0.92, 0.38, depth);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  float texel = max(uTexel, 0.0015);
  float tray = uTraySize > 0.5 ? uTraySize : 8.0;
  float beer = uBeerStrength > 0.05 ? uBeerStrength : 1.0;
  float fresScale = uFresnelScale > 0.05 ? uFresnelScale : 1.0;
  float foamDet = clamp(uFoamDetail, 0.0, 1.0);

  vec4 sL = texture2D(uMaps, vUv + vec2(-texel, 0.0));
  vec4 sR = texture2D(uMaps, vUv + vec2(texel, 0.0));
  vec4 sVm = texture2D(uMaps, vUv + vec2(0.0, -texel));
  vec4 sVp = texture2D(uMaps, vUv + vec2(0.0, texel));

  float relief = uRelief > 0.05 ? uRelief : 1.0;
  float hL = displaceY(waterAwareHeight(sL, vDepth), relief);
  float hR = displaceY(waterAwareHeight(sR, vDepth), relief);
  float hVp = displaceY(waterAwareHeight(sVp, vDepth), relief);
  float hVm = displaceY(waterAwareHeight(sVm, vDepth), relief);

  float dx = texel * tray;
  vec2 grad = vec2(hL - hR, hVp - hVm);
  if (!(grad.x == grad.x && grad.y == grad.y)) grad = vec2(0.0);
  grad *= smoothstep(0.0009, 0.014, vDepth);

  vec2 fdir = safeDir(
    vec2((sL.r + sL.g) - (sR.r + sR.g), (sVp.r + sVp.g) - (sVm.r + sVm.g)),
    vec2(0.72, 0.42)
  );
  vec2 fdir2 = vec2(-fdir.y, fdir.x);
  float flAmp = (0.35 + depth * 0.65) * (0.45 + flow * 1.4);
  float rip = sin(dot(vUv, fdir) * 22.0 + uTime * 1.55 + flow * 4.2) * 0.012 * flAmp;
  if (uWaveOctaves > 1.5) {
    rip += sin(dot(vUv, fdir2) * 37.0 - uTime * 1.85) * 0.007 * flAmp;
  }
  if (uWaveOctaves > 2.5) {
    rip += sin(dot(vUv, fdir * 0.7 + fdir2 * 0.7) * 58.0 + uTime * 2.45) * 0.004 * flAmp;
  }
  if (uWaveOctaves > 3.5) {
    rip += sin((vUv.x * 1.6 - vUv.y) * 96.0 + uTime * 3.6 + flow * 6.0) * 0.0024 * flAmp;
  }
  rip += vWave * 0.55;

  vec3 N = safeNormalize(vec3(grad.x + rip, 2.0 * dx, grad.y + rip * 0.7), vec3(0.0, 1.0, 0.0));

  vec3 dpdx = dFdx(vWorldPos);
  vec3 dpdy = dFdy(vWorldPos);
  vec3 geoCross = cross(dpdx, dpdy);
  float geoArea = length(geoCross);
  vec3 geoN = geoArea > 1.0e-6 ? safeNormalize(geoCross, vec3(0.0, 1.0, 0.0)) : vec3(0.0, 1.0, 0.0);
  float geoUp = abs(geoN.y);
  if (geoArea > 4.0e-4 && geoUp < 0.14) discard;

  // Screen-space fresnel from the projected mesh (view-space geometric normal).
  vec3 ssCross = cross(dFdx(vViewPos), dFdy(vViewPos));
  float ssArea = length(ssCross);
  vec3 ssN = ssArea > 1.0e-8 ? safeNormalize(ssCross, vec3(0.0, 0.0, 1.0)) : vec3(0.0, 0.0, 1.0);
  float ssFacing = clamp(abs(ssN.z), 0.0, 1.0);
  float ndv = max(dot(N, V), 0.0);
  float waveF = schlick(ndv, fresScale);
  float ssF = schlick(ssFacing, fresScale);
  float fresnel = mix(waveF, ssF, uQuality > 0.5 ? 0.48 : 0.22);
  fresnel *= mix(0.55, 1.0, depth);

  // Beer's law: longer optical path in deep / glancing water, red absorbed first.
  float optical = vDepth / max(ndv, 0.12);
  if (uQuality > 0.5) optical = mix(optical, vDepth / max(ssFacing, 0.12), 0.35);
  vec3 sigma = vec3(4.6, 1.25, 0.88) * beer;
  vec3 trans = exp(-sigma * optical);
  if (!(trans.x == trans.x)) trans = vec3(0.45, 0.62, 0.66);

  vec3 shallow = vec3(0.62, 0.68, 0.60);
  vec3 scatter = vec3(0.055, 0.145, 0.155);
  vec3 silt = vec3(0.56, 0.50, 0.38);
  vec3 foamC = vec3(0.90, 0.92, 0.88);
  vec3 wetSand = vec3(0.40, 0.32, 0.22);
  vec3 body = mix(scatter, shallow, trans);
  vec3 base = mix(body, silt, turbid * mix(0.28, 0.18, depth));

  float edge =
    abs(sL.g - vDepth) + abs(sR.g - vDepth) + abs(sVm.g - vDepth) + abs(sVp.g - vDepth);
  float dryN =
    step(sL.g, 0.0009) + step(sR.g, 0.0009) + step(sVm.g, 0.0009) + step(sVp.g, 0.0009);
  if (uQuality > 1.5 && foamDet > 0.5) {
    vec4 sLL = texture2D(uMaps, vUv + vec2(-texel * 2.0, 0.0));
    vec4 sRR = texture2D(uMaps, vUv + vec2(texel * 2.0, 0.0));
    vec4 sDD = texture2D(uMaps, vUv + vec2(0.0, -texel * 2.0));
    vec4 sUU = texture2D(uMaps, vUv + vec2(0.0, texel * 2.0));
    dryN += 0.55 * (
      step(sLL.g, 0.0009) + step(sRR.g, 0.0009) + step(sDD.g, 0.0009) + step(sUU.g, 0.0009)
    );
    edge += 0.45 * (
      abs(sLL.g - vDepth) + abs(sRR.g - vDepth) + abs(sDD.g - vDepth) + abs(sUU.g - vDepth)
    );
  }

  float thin = 1.0 - smoothstep(0.01, 0.058, vDepth);
  float contact = smoothstep(0.55, 2.6, dryN) * thin;
  float contactFoam = contact * (0.42 + flow * 0.58) * (0.35 + foamDet * 0.65);
  if (foamDet > 0.35) {
    float lace = sin(dot(vUv, vec2(46.0, 39.0)) + uTime * 3.05 + flow * 8.0);
    if (uQuality > 2.5) {
      lace = mix(lace, sin(dot(vUv, vec2(78.0, -51.0)) - uTime * 4.2), 0.45);
    }
    contactFoam *= mix(0.72, 1.18, lace * 0.5 + 0.5);
  }

  foam = clamp(foam + smoothstep(0.012, 0.05, edge) * (0.22 + flow * 0.45), 0.0, 1.0);
  foam = clamp(foam + contactFoam, 0.0, 1.0);

  // Wet-sand lip: thin contact water picks up stained sand, then foam sits on top.
  base = mix(base, wetSand, contact * (1.0 - foam) * mix(0.18, 0.34, foamDet));
  base = mix(base, foamC, foam * mix(0.62, 0.86, foamDet));

  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float specPow = uSpecPower > 4.0 ? uSpecPower : 22.0;
  float spec = pow(max(dot(N, H), 0.0), mix(specPow * 0.55, specPow, 1.0 - foam));
  spec *= mix(0.06, 0.15, depth) * (1.0 - foam * 0.7);
  spec = min(spec, uQuality > 2.5 ? 0.16 : 0.13);
  float ndl = max(dot(N, L), 0.0);

  vec3 color = base * (0.58 + ndl * 0.42) + uSunColor * (spec + fresnel * 0.72);
  color = mix(color, vec3(0.48, 0.50, 0.47), 0.06);
  color = clamp(color, vec3(0.04), vec3(0.84));

  float absorbAlpha = 1.0 - clamp((trans.x + trans.y + trans.z) * 0.333, 0.0, 1.0);
  float alpha = mix(0.26, 0.50, depth) + absorbAlpha * mix(0.10, 0.22, beer * 0.5);
  alpha += turbid * 0.05 + foam * 0.15 + fresnel * 0.22;
  if (geoArea > 4.0e-4) alpha *= mix(0.45, 1.0, smoothstep(0.14, 0.40, geoUp));
  float aMax = uQuality > 2.5 ? 0.74 : 0.64;
  alpha = clamp(alpha, 0.17, aMax);

  gl_FragColor = vec4(color, alpha);
}

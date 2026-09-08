uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uTexel;
uniform float uHeightScale;
uniform float uTraySize;
uniform sampler2D uMaps;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float vDepth;
varying float vFlow;

vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len2 = dot(v, v);
  if (!(len2 > 1.0e-12)) return fallback;
  vec3 n = v * inversesqrt(len2);
  if (!(n.x == n.x && n.y == n.y && n.z == n.z)) return fallback;
  return n;
}

float waterAwareHeight(vec4 s, float centerWater) {
  float w = s.g;
  float wet = step(0.0008, w);
  return s.r + mix(centerWater, w, wet);
}

void main() {
  if (!(vDepth == vDepth) || vDepth < 0.0009) discard;

  float depth = clamp(vDepth * 11.0, 0.0, 1.0);
  float flow = clamp(vFlow, 0.0, 1.0);
  if (!(flow == flow)) flow = 0.0;
  float turbid = clamp(flow * 2.6 + depth * 0.2, 0.0, 0.88);
  float foam = smoothstep(0.028, 0.14, flow) * mix(0.92, 0.38, depth);

  vec3 clearC = vec3(0.26, 0.40, 0.39);
  vec3 shallow = vec3(0.56, 0.58, 0.52);
  vec3 deep = vec3(0.16, 0.28, 0.30);
  vec3 silt = vec3(0.54, 0.47, 0.36);
  vec3 foamC = vec3(0.88, 0.90, 0.86);
  vec3 body = mix(shallow, mix(clearC, deep, depth), clamp(depth * 1.15, 0.0, 1.0));
  vec3 base = mix(body, silt, turbid * 0.42);
  base = mix(base, foamC, foam * 0.78);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  float texel = max(uTexel, 0.0015);
  float tray = uTraySize > 0.5 ? uTraySize : 8.0;

  vec4 sL = texture2D(uMaps, vUv + vec2(-texel, 0.0));
  vec4 sR = texture2D(uMaps, vUv + vec2(texel, 0.0));
  vec4 sVm = texture2D(uMaps, vUv + vec2(0.0, -texel));
  vec4 sVp = texture2D(uMaps, vUv + vec2(0.0, texel));

  float hL = waterAwareHeight(sL, vDepth) * uHeightScale;
  float hR = waterAwareHeight(sR, vDepth) * uHeightScale;
  float hVp = waterAwareHeight(sVp, vDepth) * uHeightScale;
  float hVm = waterAwareHeight(sVm, vDepth) * uHeightScale;

  float edge =
    abs(sL.g - vDepth) + abs(sR.g - vDepth) + abs(sVm.g - vDepth) + abs(sVp.g - vDepth);
  foam = clamp(foam + smoothstep(0.012, 0.05, edge) * (0.22 + flow * 0.45), 0.0, 1.0);
  base = mix(base, foamC, foam * 0.55);

  float dx = texel * tray;
  vec2 grad = vec2(hL - hR, hVp - hVm);
  if (!(grad.x == grad.x && grad.y == grad.y)) grad = vec2(0.0);
  grad *= smoothstep(0.0009, 0.014, vDepth);

  float rip =
    sin((vUv.x + vUv.y) * 22.0 + uTime * 1.55 + flow * 4.2) * 0.012 +
    sin((vUv.x * 1.7 - vUv.y) * 13.0 - uTime * 1.15) * 0.007;
  rip *= (0.35 + depth * 0.65) * (0.45 + flow * 1.4);

  vec3 N = safeNormalize(vec3(grad.x + rip, 2.0 * dx, grad.y + rip * 0.7), vec3(0.0, 1.0, 0.0));

  vec3 dpdx = dFdx(vWorldPos);
  vec3 dpdy = dFdy(vWorldPos);
  vec3 geoCross = cross(dpdx, dpdy);
  float geoArea = length(geoCross);
  vec3 geoN = geoArea > 1.0e-6 ? safeNormalize(geoCross, vec3(0.0, 1.0, 0.0)) : vec3(0.0, 1.0, 0.0);
  float geoUp = abs(geoN.y);
  if (geoArea > 4.0e-4 && geoUp < 0.14) discard;

  float ndv = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - ndv, 5.0) * mix(0.06, 0.16, depth);

  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float spec = pow(max(dot(N, H), 0.0), mix(14.0, 28.0, 1.0 - foam)) * mix(0.07, 0.16, depth);
  spec = min(spec, 0.14);
  float ndl = max(dot(N, L), 0.0);

  vec3 color = base * (0.62 + ndl * 0.38) + uSunColor * (spec + fresnel);
  color = mix(color, vec3(0.50, 0.52, 0.48), 0.08);
  color = clamp(color, vec3(0.05), vec3(0.86));

  float alpha = mix(0.30, 0.68, depth) + turbid * 0.08 + foam * 0.12 + fresnel;
  if (geoArea > 4.0e-4) alpha *= mix(0.45, 1.0, smoothstep(0.14, 0.40, geoUp));
  alpha = clamp(alpha, 0.2, 0.78);

  gl_FragColor = vec4(color, alpha);
}

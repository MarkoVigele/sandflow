uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uTexel;
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
  if (!(vDepth == vDepth) || vDepth < 0.0008) discard;

  float depth = clamp(vDepth * 18.0, 0.0, 1.0);
  float flow = clamp(vFlow, 0.0, 1.0);
  if (!(flow == flow)) flow = 0.0;
  float turbid = clamp(flow * 2.4 + depth * 0.16, 0.0, 1.0);

  vec3 clearC = vec3(0.34, 0.44, 0.43);
  vec3 shallow = vec3(0.52, 0.56, 0.51);
  vec3 silt = vec3(0.50, 0.47, 0.40);
  vec3 base = mix(mix(shallow, clearC, depth), silt, turbid * 0.22);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  float texel = max(uTexel, 0.0015);

  vec4 sL = texture2D(uMaps, vUv + vec2(-texel, 0.0));
  vec4 sR = texture2D(uMaps, vUv + vec2(texel, 0.0));
  vec4 sD = texture2D(uMaps, vUv + vec2(0.0, -texel));
  vec4 sU = texture2D(uMaps, vUv + vec2(0.0, texel));

  float hL = waterAwareHeight(sL, vDepth);
  float hR = waterAwareHeight(sR, vDepth);
  float hD = waterAwareHeight(sD, vDepth);
  float hU = waterAwareHeight(sU, vDepth);

  vec2 grad = vec2(hL - hR, hD - hU);
  if (!(grad.x == grad.x && grad.y == grad.y)) grad = vec2(0.0);
  grad *= 0.35 * smoothstep(0.0008, 0.014, vDepth);

  float rip =
    sin((vUv.x + vUv.y) * 22.0 + uTime * 1.6 + flow * 4.0) * 0.012 +
    sin((vUv.x * 1.6 - vUv.y) * 13.0 - uTime * 1.1) * 0.008;
  rip *= depth * (1.0 - turbid * 0.4);

  vec3 N = safeNormalize(vec3(grad.x + rip, 0.55, grad.y + rip * 0.7), vec3(0.0, 1.0, 0.0));

  vec3 geoN = safeNormalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)), vec3(0.0, 1.0, 0.0));
  float geoUp = abs(geoN.y);
  if (geoUp < 0.42) discard;

  float ndv = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - ndv, 5.0) * 0.10 * depth;

  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float spec = pow(max(dot(N, H), 0.0), 22.0) * 0.12 * depth;
  spec = min(spec, 0.14);

  vec3 color = base + uSunColor * (spec + fresnel);
  color = mix(color, vec3(0.52, 0.54, 0.50), 0.18);
  color = clamp(color, vec3(0.0), vec3(0.78));

  float alpha = mix(0.14, 0.48, depth) + turbid * 0.04 + fresnel;
  alpha *= smoothstep(0.42, 0.72, geoUp);
  alpha = clamp(alpha, 0.10, 0.58);

  gl_FragColor = vec4(color, alpha);
}

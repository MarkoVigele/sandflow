uniform sampler2D uMaps;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uReceiveShadow;
uniform float uGrain;
uniform float uHeatMode;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;

vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len2 = dot(v, v);
  if (!(len2 > 1.0e-12)) return fallback;
  vec3 n = v * inversesqrt(len2);
  if (!(n.x == n.x && n.y == n.y && n.z == n.z)) return fallback;
  return n;
}

void main() {
  vec4 maps = texture2D(uMaps, vUv);
  float wet = clamp(maps.b, 0.0, 1.0);
  float water = maps.g;
  if (!(wet == wet)) wet = 0.0;
  if (!(water == water) || water < 0.0) water = 0.0;

  vec2 tile = vUv * (3.4 + uGrain * 2.0);
  vec2 d = vec2(0.0018, 0.0014);
  vec3 albedo =
    (texture2D(uAlbedo, tile).rgb +
     texture2D(uAlbedo, tile + d).rgb +
     texture2D(uAlbedo, tile - d).rgb) / 3.0;
  vec3 nTex = texture2D(uNormal, tile).rgb * 2.0 - 1.0;
  float roughTex = texture2D(uRough, tile).r;
  if (!(albedo.x == albedo.x)) albedo = vec3(0.70, 0.58, 0.40);
  if (!(nTex.x == nTex.x)) nTex = vec3(0.0, 0.0, 1.0);
  if (!(roughTex == roughTex)) roughTex = 0.85;

  albedo = mix(vec3(0.72, 0.60, 0.42), albedo, 0.52);

  vec3 N = safeNormalize(vNormalW + vec3(nTex.x, 0.0, nTex.y) * 0.07, vec3(0.0, 1.0, 0.0));

  float dark = mix(1.0, 0.54, wet);
  albedo *= dark;
  albedo = mix(albedo, albedo * vec3(0.78, 0.70, 0.58), wet * 0.38);
  albedo = mix(albedo, albedo * vec3(0.88, 0.86, 0.80), smoothstep(0.003, 0.04, water) * 0.16);

  float roughness = mix(mix(0.93, 0.84, uGrain), 0.36, wet * 0.82);
  roughness = mix(roughness, roughTex, 0.14);
  roughness = clamp(roughness, 0.30, 0.96);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float wrap = clamp((dot(N, L) + 0.22) / 1.22, 0.0, 1.0);

  float shadow = mix(1.0, 0.78 + wrap * 0.22, step(0.5, uReceiveShadow));
  float specPow = mix(6.0, 22.0, 1.0 - roughness);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.012, 0.09, wet);
  spec = min(spec, 0.09);

  vec3 color = albedo * (uAmbient + uSunColor * wrap * shadow) + uSunColor * spec * shadow;
  float underWater = smoothstep(0.003, 0.04, water);
  color = mix(color, color * vec3(0.88, 0.86, 0.80), underWater * 0.2);

  if (uHeatMode > 0.5) {
    float flow = maps.a;
    if (!(flow == flow) || flow < 0.0) flow = 0.0;
    float t = uHeatMode < 1.5 ? clamp(flow * 9.0, 0.0, 1.0) : clamp(water * 16.0, 0.0, 1.0);
    vec3 heat = uHeatMode < 1.5
      ? mix(vec3(0.55, 0.28, 0.10), vec3(0.92, 0.78, 0.36), t)
      : mix(vec3(0.28, 0.36, 0.30), vec3(0.62, 0.68, 0.52), t);
    color = mix(color, heat, smoothstep(0.02, 0.18, t) * 0.62);
  }

  color = clamp(color, vec3(0.0), vec3(1.0));

  gl_FragColor = vec4(color, 1.0);
}

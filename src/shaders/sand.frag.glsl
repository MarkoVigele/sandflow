uniform sampler2D uMaps;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uReceiveShadow;
uniform float uGrain;

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

  vec2 tile = vUv * (5.2 + uGrain * 3.4);
  vec3 albedo = texture2D(uAlbedo, tile).rgb;
  vec3 nTex = texture2D(uNormal, tile).rgb * 2.0 - 1.0;
  float roughTex = texture2D(uRough, tile).r;
  if (!(albedo.x == albedo.x)) albedo = vec3(0.70, 0.58, 0.40);
  if (!(nTex.x == nTex.x)) nTex = vec3(0.0, 0.0, 1.0);
  if (!(roughTex == roughTex)) roughTex = 0.85;

  albedo = mix(vec3(0.71, 0.59, 0.41), albedo, 0.72);

  vec3 N = safeNormalize(vNormalW + vec3(nTex.x, 0.0, nTex.y) * 0.14, vec3(0.0, 1.0, 0.0));

  float dark = mix(1.0, 0.52, wet);
  albedo *= dark;
  albedo = mix(albedo, albedo * vec3(0.78, 0.74, 0.66), wet * 0.35);
  albedo = mix(albedo, albedo * vec3(0.86, 0.88, 0.84), smoothstep(0.002, 0.03, water) * 0.18);

  float roughness = mix(mix(0.92, 0.82, uGrain), 0.38, wet * 0.85);
  roughness = mix(roughness, roughTex, 0.16);
  roughness = clamp(roughness, 0.28, 0.96);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float wrap = clamp((dot(N, L) + 0.22) / 1.22, 0.0, 1.0);

  float shadow = mix(1.0, 0.78 + wrap * 0.22, step(0.5, uReceiveShadow));
  float specPow = mix(6.0, 28.0, 1.0 - roughness);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.02, 0.16, wet);
  spec = min(spec, 0.18);

  vec3 color = albedo * (uAmbient + uSunColor * wrap * shadow) + uSunColor * spec * shadow;
  float underWater = smoothstep(0.003, 0.04, water);
  color = mix(color, color * vec3(0.90, 0.91, 0.88), underWater * 0.22);
  color = clamp(color, vec3(0.0), vec3(1.0));

  gl_FragColor = vec4(color, 1.0);
}

uniform sampler2D uMaps;
uniform sampler2D uAlbedo;
uniform sampler2D uAlbedoWet;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uReceiveShadow;
uniform float uGrain;
uniform float uUvScale;
uniform float uHeatMode;
uniform float uHeightScale;
uniform float uTexel;
uniform float uTraySize;

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

float heightAt(vec2 uv) {
  float h = texture2D(uMaps, uv).r * uHeightScale;
  return (h == h) ? h : 0.0;
}

float heightfieldAO(vec2 uv, float h0, float texel) {
  float acc = 0.0;
  acc += max(heightAt(uv + vec2(-texel, 0.0)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(texel, 0.0)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(0.0, -texel)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(0.0, texel)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(-texel, -texel)) - h0, 0.0) * 0.65;
  acc += max(heightAt(uv + vec2(texel, texel)) - h0, 0.0) * 0.65;
  return clamp(1.0 - acc * 1.45, 0.52, 1.0);
}

float heightfieldContact(vec2 uv, float h0, vec3 L, float texel, float tray) {
  vec2 dirUv = vec2(L.x, -L.z);
  float len = length(dirUv);
  if (len < 1.0e-4) return 1.0;
  dirUv *= 1.0 / len;
  float stepUv = texel * 1.65;
  float stepWorld = stepUv * tray;
  float shadow = 1.0;
  float y = h0;
  for (int i = 1; i <= 6; i++) {
    y += L.y * stepWorld;
    float hs = heightAt(uv + dirUv * stepUv * float(i));
    float occ = (hs - y) / max(stepWorld * 2.4, 1.0e-3);
    shadow *= 1.0 - clamp(occ, 0.0, 1.0) * 0.32;
  }
  return clamp(shadow, 0.38, 1.0);
}

void main() {
  vec4 maps = texture2D(uMaps, vUv);
  float wet = clamp(maps.b, 0.0, 1.0);
  float water = maps.g;
  if (!(wet == wet)) wet = 0.0;
  if (!(water == water) || water < 0.0) water = 0.0;

  float uvScale = uUvScale > 0.2 ? uUvScale : (2.05 + uGrain * 1.2);
  vec2 tile = vUv * uvScale;
  // Second, rotated sample hides JPEG tile edges without a second normal fetch.
  vec2 tileB = tile.yx * 0.73 + vec2(0.19, 0.33);
  vec3 dryA = texture2D(uAlbedo, tile).rgb;
  vec3 dryB = texture2D(uAlbedo, tileB).rgb;
  vec3 wetA = texture2D(uAlbedoWet, tile).rgb;
  vec3 wetB = texture2D(uAlbedoWet, tileB).rgb;
  vec3 dryAlb = mix(dryA, dryB, 0.22);
  vec3 wetAlb = mix(wetA, wetB, 0.22);
  vec3 nTex = texture2D(uNormal, tile).rgb * 2.0 - 1.0;
  vec2 roughPair = texture2D(uRough, tile).rg;
  if (!(dryAlb.x == dryAlb.x)) dryAlb = vec3(0.70, 0.58, 0.40);
  if (!(wetAlb.x == wetAlb.x)) wetAlb = dryAlb * vec3(0.50, 0.44, 0.36);
  if (!(nTex.x == nTex.x)) nTex = vec3(0.0, 0.0, 1.0);
  if (!(roughPair.x == roughPair.x)) roughPair = vec2(0.86, 0.30);

  // Keep dry grain in wet patches; the wet photo is a tint, not a second stamp.
  float wetMask = smoothstep(0.035, 0.58, wet);
  vec3 moistened = dryAlb * vec3(0.64, 0.58, 0.50);
  vec3 wetCol = mix(moistened, wetAlb, 0.52);
  vec3 albedo = mix(dryAlb, wetCol, wetMask);

  vec3 N = safeNormalize(vNormalW + vec3(nTex.x, 0.0, nTex.y) * 0.07, vec3(0.0, 1.0, 0.0));

  albedo = mix(albedo, albedo * vec3(0.92, 0.90, 0.84), smoothstep(0.003, 0.04, water) * 0.1);

  float roughTex = mix(roughPair.x, roughPair.y, wet);
  float roughness = mix(mix(0.90, 0.82, uGrain), 0.30, wet * 0.78);
  roughness = mix(roughness, roughTex, 0.58);
  roughness = clamp(roughness, 0.22, 0.96);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float ndl = max(dot(N, L), 0.0);
  float wrap = mix(ndl, clamp((dot(N, L) + 0.12) / 1.12, 0.0, 1.0), 0.4);

  float texel = max(uTexel, 1.0e-4);
  float tray = uTraySize > 0.5 ? uTraySize : 8.0;
  float h0 = heightAt(vUv);
  float ao = heightfieldAO(vUv, h0, texel);
  float contact = heightfieldContact(vUv, h0, L, texel, tray);
  float slopeShade = mix(0.72, 1.0, clamp(N.y, 0.0, 1.0));
  float gpuShadow = mix(1.0, 0.82 + wrap * 0.18, step(0.5, uReceiveShadow));
  float shade = ao * contact * slopeShade * gpuShadow;

  float specPow = mix(6.0, 22.0, 1.0 - roughness);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.012, 0.09, wet);
  spec = min(spec, 0.09);

  vec3 color = albedo * (uAmbient * ao + uSunColor * wrap * shade) + uSunColor * spec * shade;
  float underWater = smoothstep(0.003, 0.04, water);
  color = mix(color, color * vec3(0.88, 0.86, 0.80), underWater * 0.2);

  if (uHeatMode > 0.5) {
    float flow = maps.a;
    if (!(flow == flow) || flow < 0.0) flow = 0.0;
    float t = uHeatMode < 1.5
      ? clamp(max(flow * 22.0, wet * 0.9), 0.0, 1.0)
      : clamp(max(water * 32.0, wet * 0.95), 0.0, 1.0);
    vec3 heat = uHeatMode < 1.5
      ? mix(vec3(0.42, 0.16, 0.04), vec3(0.95, 0.72, 0.22), t)
      : mix(vec3(0.16, 0.28, 0.24), vec3(0.55, 0.72, 0.58), t);
    color = mix(color, heat, mix(0.28, 0.82, smoothstep(0.0, 0.22, t)));
  }

  color = clamp(color, vec3(0.0), vec3(1.0));

  gl_FragColor = vec4(color, 1.0);
}

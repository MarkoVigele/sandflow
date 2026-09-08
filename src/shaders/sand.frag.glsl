uniform sampler2D uMaps;
uniform sampler2D uAlbedo;
uniform sampler2D uAlbedoWet;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform sampler2D uHard;
uniform sampler2D uTrail;
uniform sampler2D uConcrete;
uniform float uTrailAmt;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform vec3 uAmbient;
uniform float uReceiveShadow;
uniform float uGrain;
uniform float uUvScale;
uniform float uHeatMode;
uniform float uHeightScale;
uniform float uRelief;
uniform float uPivot;
uniform float uTexel;
uniform float uTraySize;
uniform float uAoSteps;
uniform float uLookGrain;
uniform float uHeightMicro;

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
  float h01 = texture2D(uMaps, uv).r;
  if (!(h01 == h01)) h01 = 0.0;
  float relief = uRelief > 0.05 ? uRelief : 1.0;
  float h = (uPivot + (h01 - uPivot) * relief) * uHeightScale;
  return (h == h) ? h : 0.0;
}

// 4-tap always; diagonals + ridge axis only when the quality budget allows.
float heightfieldAO(vec2 uv, float h0, float texel, float steps) {
  float acc = 0.0;
  acc += max(heightAt(uv + vec2(-texel, 0.0)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(texel, 0.0)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(0.0, -texel)) - h0, 0.0);
  acc += max(heightAt(uv + vec2(0.0, texel)) - h0, 0.0);
  if (steps > 2.5) {
    acc += max(heightAt(uv + vec2(-texel, -texel)) - h0, 0.0) * 0.65;
    acc += max(heightAt(uv + vec2(texel, texel)) - h0, 0.0) * 0.65;
    acc += max(heightAt(uv + vec2(-texel, texel)) - h0, 0.0) * 0.65;
    acc += max(heightAt(uv + vec2(texel, -texel)) - h0, 0.0) * 0.65;
  }
  if (steps > 5.5) {
    float hL = heightAt(uv + vec2(-texel, 0.0));
    float hR = heightAt(uv + vec2(texel, 0.0));
    float hVm = heightAt(uv + vec2(0.0, -texel));
    float hVp = heightAt(uv + vec2(0.0, texel));
    vec2 ridge = vec2(hR - hL, hVp - hVm);
    float rlen = length(ridge);
    if (rlen > 1.0e-5) {
      ridge *= texel * 1.35 / rlen;
      acc += max(heightAt(uv + ridge) - h0, 0.0) * 0.85;
      acc += max(heightAt(uv - ridge) - h0, 0.0) * 0.85;
    }
  }
  return clamp(1.0 - acc * 1.85, 0.52, 1.0);
}

float heightfieldContact(vec2 uv, float h0, vec3 L, float texel, float tray, float steps) {
  if (steps < 0.5) return 1.0;
  vec2 dirUv = vec2(L.x, -L.z);
  float len = length(dirUv);
  if (len < 1.0e-4) return 1.0;
  dirUv *= 1.0 / len;
  float stepUv = texel * 1.65;
  float stepWorld = stepUv * tray;
  float shadow = 1.0;
  float y = h0;
  int n = int(clamp(steps, 1.0, 8.0) + 0.5);
  for (int i = 1; i <= 8; i++) {
    if (i > n) break;
    y += L.y * stepWorld;
    float hs = heightAt(uv + dirUv * stepUv * float(i));
    float occ = (hs - y) / max(stepWorld * 2.4, 1.0e-3);
    shadow *= 1.0 - clamp(occ, 0.0, 1.0) * 0.28;
  }
  return clamp(shadow, 0.55, 1.0);
}

void main() {
  vec4 maps = texture2D(uMaps, vUv);
  float wet = clamp(maps.b, 0.0, 1.0);
  float water = maps.g;
  if (!(wet == wet)) wet = 0.0;
  if (!(water == water) || water < 0.0) water = 0.0;

  float uvScale = uUvScale > 0.2 ? uUvScale : (1.95 + uGrain * 0.95);
  vec2 tile = vUv * uvScale;
  // ~60° second sample + hash mix hides JPEG blocks without a second normal fetch.
  vec2 tileB = vec2(0.5 * tile.x - 0.8660254 * tile.y, 0.8660254 * tile.x + 0.5 * tile.y) * 0.84
    + vec2(0.17, 0.31);
  vec3 dryA = texture2D(uAlbedo, tile).rgb;
  vec3 dryB = texture2D(uAlbedo, tileB).rgb;
  vec3 wetA = texture2D(uAlbedoWet, tile).rgb;
  vec3 wetB = texture2D(uAlbedoWet, tileB).rgb;
  float stamp = fract(sin(dot(floor(vUv * 16.0), vec2(12.9898, 78.233))) * 43758.5453);
  float mixB = mix(0.12, 0.26, stamp);
  vec3 dryAlb = mix(dryA, dryB, mixB);
  vec3 wetAlb = mix(wetA, wetB, mixB);
  vec3 nTex = texture2D(uNormal, tile).rgb * 2.0 - 1.0;
  vec2 roughPair = texture2D(uRough, tile).rg;
  if (!(dryAlb.x == dryAlb.x)) dryAlb = vec3(0.70, 0.58, 0.40);
  if (!(wetAlb.x == wetAlb.x)) wetAlb = dryAlb * vec3(0.50, 0.44, 0.36);
  if (!(nTex.x == nTex.x)) nTex = vec3(0.0, 0.0, 1.0);
  if (!(roughPair.x == roughPair.x)) roughPair = vec2(0.86, 0.30);

  // Sharp wet/dry at the waterline; residual moisture inland stays a softer bank.
  float wetBank = smoothstep(0.02, 0.16, wet);
  float wetShore = smoothstep(0.0006, 0.022, water);
  float wetSharp = smoothstep(0.006, 0.045, wet);
  float wetMask = max(wetShore, mix(wetBank, wetSharp, wetShore));
  vec3 moistened = dryAlb * vec3(0.34, 0.28, 0.22);
  vec3 wetCol = mix(moistened, wetAlb, 0.18);
  vec3 albedo = mix(dryAlb, wetCol, wetMask);

  float hard = texture2D(uHard, vUv).r;
  if (!(hard == hard) || hard < 0.0) hard = 0.0;
  float hardMask = smoothstep(0.20, 0.68, hard);
  float concMask = smoothstep(0.82, 0.94, hard);
  float stoneMask = hardMask * (1.0 - concMask);
  if (concMask > 0.001) {
    vec3 concA = texture2D(uConcrete, tile * 0.82).rgb;
    vec3 concB = texture2D(uConcrete, tileB * 0.82).rgb;
    vec3 conc = mix(concA, concB, 0.26);
    if (!(conc.x == conc.x)) conc = vec3(0.54, 0.53, 0.50);
    vec3 concWet = conc * vec3(0.70, 0.72, 0.74);
    conc = mix(conc, concWet, wetMask * 0.55);
    albedo = mix(albedo, conc, concMask);
  } else if (stoneMask > 0.001) {
    albedo = mix(albedo, albedo * vec3(0.70, 0.66, 0.60), stoneMask * 0.35);
  }

  float lookG = clamp(uLookGrain, 0.0, 1.0);
  float luma = dot(dryAlb, vec3(0.2126, 0.7152, 0.0722));
  if (!(luma == luma)) luma = 0.5;
  float micro = 1.0 + (luma - 0.5) * lookG * 0.22;
  albedo *= mix(1.0, micro, 1.0 - hardMask * 0.65);

  float texel = max(uTexel, 1.0e-4);
  float tray = uTraySize > 0.5 ? uTraySize : 8.0;
  float h0 = heightAt(vUv);

  float nAmt = mix(0.10, 0.20, lookG);
  vec3 N = safeNormalize(vNormalW + vec3(nTex.x, 0.0, nTex.y) * nAmt, vec3(0.0, 1.0, 0.0));
  float gdx = dFdx(luma);
  float gdy = dFdy(luma);
  N = safeNormalize(N + vec3(-gdx, 0.0, -gdy) * (0.35 * lookG), vec3(0.0, 1.0, 0.0));
  float hMicro = uHeightMicro;
  if (!(hMicro == hMicro) || hMicro < 0.0) hMicro = 0.0;
  if (hMicro > 0.001) {
    float hx = clamp(dFdx(h0), -0.06, 0.06);
    float hz = clamp(dFdy(h0), -0.06, 0.06);
    N = safeNormalize(N + vec3(-hx, 0.0, -hz) * (hMicro * 2.4), N);
  }

  albedo = mix(albedo, albedo * vec3(0.92, 0.90, 0.84), smoothstep(0.003, 0.04, water) * 0.1);

  float roughTex = mix(roughPair.x, roughPair.y, wet);
  float roughness = mix(mix(0.90, 0.82, uGrain), 0.30, wet * 0.78);
  roughness = mix(roughness, roughTex, 0.58);
  roughness = mix(roughness, mix(0.64, 0.40, wetMask), concMask);
  roughness += (0.48 - luma) * lookG * 0.12;
  roughness = clamp(roughness, 0.22, 0.96);

  vec3 V = safeNormalize(vViewDir, vec3(0.0, 1.0, 0.0));
  vec3 L = safeNormalize(uSunDir, vec3(0.4, 0.8, 0.3));
  vec3 Fdir = safeNormalize(uFillDir, vec3(-0.35, 0.55, -0.28));
  vec3 H = safeNormalize(V + L, vec3(0.0, 1.0, 0.0));
  float ndl = max(dot(N, L), 0.0);
  float wrap = mix(ndl, clamp((dot(N, L) + 0.22) / 1.22, 0.0, 1.0), 0.42);
  float fillN = max(dot(N, Fdir), 0.0);
  float fillWrap = mix(fillN, clamp((dot(N, Fdir) + 0.45) / 1.45, 0.0, 1.0), 0.55);
  float ao = heightfieldAO(vUv, h0, texel, uAoSteps);
  float contact = heightfieldContact(vUv, h0, L, texel, tray, uAoSteps);
  float slopeShade = mix(0.72, 1.0, clamp(N.y, 0.0, 1.0));
  float gpuShadow = mix(1.0, 0.86 + wrap * 0.14, step(0.5, uReceiveShadow));
  float shade = ao * contact * slopeShade * gpuShadow;

  float specPow = mix(5.0, 16.0, 1.0 - roughness);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.008, 0.055, wet);
  spec = min(spec, 0.055);

  vec3 fillC = uFillColor;
  if (!(fillC.x == fillC.x)) fillC = vec3(0.18, 0.20, 0.22);
  vec3 color = albedo * (uAmbient * ao + uSunColor * wrap * shade + fillC * fillWrap * ao)
    + uSunColor * spec * shade;
  float underWater = smoothstep(0.002, 0.055, water);
  color = mix(color, color * vec3(0.74, 0.64, 0.50), underWater * 0.42);

  float trail = texture2D(uTrail, vUv).r;
  if (!(trail == trail)) trail = 0.0;
  float tAmt = clamp(uTrailAmt, 0.0, 1.0);
  float cut = clamp(-trail, 0.0, 1.0);
  float fill = clamp(trail, 0.0, 1.0);
  color *= mix(1.0, 0.90, cut * tAmt * 0.82);
  color += vec3(0.042, 0.028, 0.012) * fill * tAmt;

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

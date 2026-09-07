uniform sampler2D uMaps;
uniform sampler2D uAlbedo;
uniform sampler2D uWetAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform sampler2D uHeight;
uniform sampler2D uEnv;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uReceiveShadow;
uniform float uGrain;
uniform float uEnvAmt;
uniform float uTime;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;

vec2 equirect(vec3 dir) {
  float u = atan(dir.z, dir.x) * 0.15915494 + 0.5;
  float v = asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5;
  return vec2(u, v);
}

void main() {
  vec4 maps = texture2D(uMaps, vUv);
  float wet = clamp(maps.b, 0.0, 1.0);
  float water = maps.g;
  float flow = maps.a;

  vec2 tile = vUv * (9.0 + uGrain * 10.0);
  vec3 dryAlb = texture2D(uAlbedo, tile).rgb;
  vec3 wetAlb = texture2D(uWetAlbedo, tile).rgb;
  vec3 nTex = texture2D(uNormal, tile).rgb * 2.0 - 1.0;
  vec3 roughPack = texture2D(uRough, tile).rgb;
  float hL = texture2D(uHeight, tile + vec2(-0.002, 0.0)).r;
  float hR = texture2D(uHeight, tile + vec2(0.002, 0.0)).r;
  float hD = texture2D(uHeight, tile + vec2(0.0, -0.002)).r;
  float hU = texture2D(uHeight, tile + vec2(0.0, 0.002)).r;
  vec3 nH = normalize(vec3(hL - hR, 0.18, hD - hU));

  vec3 albedo = mix(dryAlb, wetAlb, wet);
  float wetEdge = smoothstep(0.12, 0.38, wet) * (1.0 - smoothstep(0.42, 0.82, wet));
  albedo *= 1.0 - wetEdge * 0.1;
  albedo = mix(albedo, albedo * vec3(0.78, 0.74, 0.64), wet * 0.28);

  vec3 N = normalize(vNormalW + vec3(nTex.x, 0.0, nTex.y) * 0.38 + nH * 0.16);
  float roughness = mix(roughPack.r, roughPack.g, wet * 0.94);
  roughness = mix(mix(0.93, 0.76, uGrain), roughness, 0.72);
  roughness = mix(roughness, 0.22, wet * 0.78);
  roughness = clamp(roughness, 0.08, 0.98);

  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float NdotL = clamp((dot(N, L) + 0.2) / 1.2, 0.0, 1.0);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  float shadow = mix(1.0, 0.7 + NdotL * 0.3, step(0.5, uReceiveShadow));
  float F0 = mix(0.035, 0.085, wet);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
  float specPow = mix(10.0, 96.0, 1.0 - roughness);
  float spec = pow(NdotH, specPow) * fresnel * mix(0.04, 0.55, wet);

  vec3 R = reflect(-V, N);
  vec3 env = texture2D(uEnv, equirect(R)).rgb;
  float envAmt = uEnvAmt * mix(0.06, 0.28, wet * wet) * (1.0 - roughness);

  vec3 color = albedo * (uAmbient + uSunColor * NdotL * shadow) + uSunColor * spec * shadow + env * envAmt;

  float underWater = smoothstep(0.002, 0.028, water);
  vec3 aqua = vec3(0.8, 0.9, 0.88);
  color = mix(color, color * aqua, underWater * 0.38);
  float caust = sin((vUv.x * 42.0 + vUv.y * 18.0) + uTime * 1.6 + flow * 6.0);
  caust *= sin((vUv.x * 17.0 - vUv.y * 31.0) - uTime * 1.1);
  color += uSunColor * max(caust, 0.0) * underWater * 0.045 * (0.35 + flow * 2.0);

  gl_FragColor = vec4(color, 1.0);
}

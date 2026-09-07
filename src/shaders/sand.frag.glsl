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

#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

void main() {
  vec4 maps = texture2D(uMaps, vUv);
  float wet = clamp(maps.b, 0.0, 1.0);
  float water = maps.g;

  vec2 tile = vUv * (10.0 + uGrain * 8.0);
  vec3 albedo = texture2D(uAlbedo, tile).rgb;
  vec3 nTex = texture2D(uNormal, tile).rgb * 2.0 - 1.0;
  float roughTex = texture2D(uRough, tile).r;

  vec3 N = normalize(vNormalW);
  N = normalize(N + vec3(nTex.x, 0.0, nTex.y) * 0.35);

  float dark = mix(1.0, 0.42, wet);
  albedo *= dark;
  albedo = mix(albedo, albedo * vec3(0.72, 0.68, 0.58), wet * 0.45);

  float roughness = mix(mix(0.94, 0.78, uGrain), 0.26, wet * 0.92);
  roughness = mix(roughness, roughTex, 0.25);

  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float ndotl = max(dot(N, L), 0.0);
  float wrap = clamp((dot(N, L) + 0.18) / 1.18, 0.0, 1.0);

  float shadow = 1.0;
  if (uReceiveShadow > 0.5) {
    shadow = mix(0.45, 1.0, getShadowMask());
  }

  float specPow = mix(8.0, 64.0, 1.0 - roughness);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.03, 0.38, wet);
  spec *= shadow;

  vec3 diffuse = albedo * (uAmbient + uSunColor * wrap * shadow);
  vec3 color = diffuse + uSunColor * spec;

  float underWater = smoothstep(0.002, 0.03, water);
  color = mix(color, color * vec3(0.82, 0.88, 0.86), underWater * 0.35);

  gl_FragColor = vec4(color, 1.0);
}

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uTime;
uniform float uEnvAmt;
uniform sampler2D uMaps;
uniform sampler2D uEnv;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vNormalW;
varying float vDepth;
varying float vFlow;

vec2 equirect(vec3 dir) {
  float u = atan(dir.z, dir.x) * 0.15915494 + 0.5;
  float v = asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5;
  return vec2(u, v);
}

void main() {
  if (vDepth < 0.0018) discard;

  float depth = clamp(vDepth * 13.0, 0.0, 1.0);
  float turbid = clamp(vFlow * 4.2 + depth * 0.22, 0.0, 1.0);

  vec3 clearC = vec3(0.32, 0.56, 0.62);
  vec3 shallow = vec3(0.58, 0.74, 0.7);
  vec3 muddy = vec3(0.5, 0.42, 0.28);
  vec3 base = mix(mix(shallow, clearC, depth), muddy, turbid * 0.48);

  vec3 V = normalize(vViewDir);
  float rip =
    sin((vUv.x + vUv.y) * 64.0 + uTime * 2.8 + vFlow * 10.0) * 0.35 +
    sin((vUv.x * 1.7 - vUv.y) * 38.0 - uTime * 1.9) * 0.2;
  vec3 N = normalize(vNormalW + vec3(rip * 0.08, 0.0, rip * 0.05));

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.2);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float spec = pow(max(dot(N, H), 0.0), 92.0) * 0.72;

  vec3 R = reflect(-V, N);
  vec3 env = texture2D(uEnv, equirect(R)).rgb;

  float shore = smoothstep(0.0018, 0.01, vDepth) * (1.0 - smoothstep(0.012, 0.05, vDepth));
  float foam = shore * 0.55 + smoothstep(0.09, 0.24, vFlow) * 0.22;
  vec3 foamC = vec3(0.86, 0.88, 0.84);

  vec3 color = base * (0.72 + uAmbient * 0.9) + uSunColor * (spec + fresnel * 0.2);
  color += env * uEnvAmt * (0.12 + fresnel * 0.35);
  color = mix(color, foamC, foam * 0.55);
  color += rip * 0.025 * uSunColor;

  float alpha = mix(0.22, 0.64, depth) + turbid * 0.12 + fresnel * 0.26 + foam * 0.1;
  alpha = clamp(alpha, 0.16, 0.8);

  gl_FragColor = vec4(color, alpha);
}

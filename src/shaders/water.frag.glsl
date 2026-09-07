uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform sampler2D uMaps;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float vDepth;
varying float vFlow;

void main() {
  if (vDepth < 0.0018) discard;

  float depth = clamp(vDepth * 14.0, 0.0, 1.0);
  float turbid = clamp(vFlow * 4.5 + depth * 0.25, 0.0, 1.0);

  vec3 clearC = vec3(0.22, 0.48, 0.58);
  vec3 shallow = vec3(0.38, 0.62, 0.64);
  vec3 muddy = vec3(0.42, 0.36, 0.24);
  vec3 base = mix(mix(shallow, clearC, depth), muddy, turbid * 0.55);

  vec3 V = normalize(vViewDir);
  float hL = texture2D(uMaps, vUv + vec2(-0.003, 0.0)).r + texture2D(uMaps, vUv + vec2(-0.003, 0.0)).g;
  float hR = texture2D(uMaps, vUv + vec2(0.003, 0.0)).r + texture2D(uMaps, vUv + vec2(0.003, 0.0)).g;
  float hD = texture2D(uMaps, vUv + vec2(0.0, -0.003)).r + texture2D(uMaps, vUv + vec2(0.0, -0.003)).g;
  float hU = texture2D(uMaps, vUv + vec2(0.0, 0.003)).r + texture2D(uMaps, vUv + vec2(0.0, 0.003)).g;
  vec3 N = normalize(vec3(hL - hR, 0.12, hD - hU));

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float spec = pow(max(dot(N, H), 0.0), 80.0) * 0.65;

  float ripple = sin((vUv.x + vUv.y) * 70.0 + uTime * 3.2 + vFlow * 8.0) * 0.03;
  vec3 color = base + uSunColor * (spec + fresnel * 0.18 + ripple);

  float alpha = mix(0.18, 0.62, depth) + turbid * 0.12 + fresnel * 0.22;
  alpha = clamp(alpha, 0.12, 0.78);

  gl_FragColor = vec4(color, alpha);
}

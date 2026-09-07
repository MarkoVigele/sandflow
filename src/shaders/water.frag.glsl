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
  if (vDepth < 0.00065) discard;

  float depth = clamp(vDepth * 22.0, 0.0, 1.0);
  float turbid = clamp(vFlow * 5.2 + depth * 0.22, 0.0, 1.0);

  vec3 clearC = vec3(0.20, 0.50, 0.60);
  vec3 shallow = vec3(0.42, 0.66, 0.68);
  vec3 muddy = vec3(0.44, 0.37, 0.24);
  vec3 base = mix(mix(shallow, clearC, depth), muddy, turbid * 0.58);

  vec3 V = normalize(vViewDir);
  vec4 sL = texture2D(uMaps, vUv + vec2(-0.0024, 0.0));
  vec4 sR = texture2D(uMaps, vUv + vec2(0.0024, 0.0));
  vec4 sD = texture2D(uMaps, vUv + vec2(0.0, -0.0024));
  vec4 sU = texture2D(uMaps, vUv + vec2(0.0, 0.0024));
  float hL = sL.r + sL.g;
  float hR = sR.r + sR.g;
  float hD = sD.r + sD.g;
  float hU = sU.r + sU.g;
  vec3 N = normalize(vec3(hL - hR, 0.1, hD - hU));

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float spec = pow(max(dot(N, H), 0.0), 72.0) * 0.7;

  float ripple = sin((vUv.x + vUv.y) * 80.0 + uTime * 3.4 + vFlow * 10.0) * 0.028;
  vec3 color = base + uSunColor * (spec + fresnel * 0.2 + ripple);

  float alpha = mix(0.26, 0.7, depth) + turbid * 0.1 + fresnel * 0.18;
  alpha = clamp(alpha, 0.2, 0.82);

  gl_FragColor = vec4(color, alpha);
}

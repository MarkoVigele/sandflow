uniform sampler2D uMaps;
uniform float uMode;

varying vec2 vUv;

vec3 rampFlow(float t) {
  vec3 a = vec3(0.18, 0.12, 0.08);
  vec3 b = vec3(0.62, 0.38, 0.14);
  vec3 c = vec3(0.86, 0.72, 0.38);
  return mix(mix(a, b, clamp(t * 1.6, 0.0, 1.0)), c, smoothstep(0.35, 1.0, t));
}

vec3 rampDepth(float t) {
  vec3 a = vec3(0.22, 0.24, 0.18);
  vec3 b = vec3(0.36, 0.46, 0.38);
  vec3 c = vec3(0.58, 0.62, 0.50);
  return mix(mix(a, b, clamp(t * 1.5, 0.0, 1.0)), c, smoothstep(0.4, 1.0, t));
}

void main() {
  vec4 maps = texture2D(uMaps, vUv);
  float flow = maps.a;
  float depth = maps.g;
  if (!(flow == flow) || flow < 0.0) flow = 0.0;
  if (!(depth == depth) || depth < 0.0) depth = 0.0;

  float t = 0.0;
  vec3 col = vec3(0.0);
  if (uMode < 1.5) {
    t = clamp(flow * 7.5, 0.0, 1.0);
    col = rampFlow(t);
  } else {
    t = clamp(depth * 14.0, 0.0, 1.0);
    col = rampDepth(t);
  }

  float alpha = smoothstep(0.04, 0.22, t) * 0.42;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}

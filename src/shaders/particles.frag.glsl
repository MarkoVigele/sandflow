varying float vAlive;

void main() {
  if (vAlive < 0.5) discard;
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Soft foam speck: bright core, thin lace ring — no blue flash.
  float core = smoothstep(1.0, 0.08, r2);
  float ring = smoothstep(0.22, 0.04, abs(r2 - 0.42));
  float a = (core * 0.16 + ring * 0.10);
  vec3 col = mix(vec3(0.78, 0.74, 0.66), vec3(0.93, 0.94, 0.90), core);
  gl_FragColor = vec4(col, a);
}

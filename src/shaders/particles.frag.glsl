varying float vAlive;

void main() {
  if (vAlive < 0.5) discard;
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = smoothstep(1.0, 0.22, r2) * 0.12;
  vec3 col = vec3(0.82, 0.79, 0.72);
  gl_FragColor = vec4(col, a);
}

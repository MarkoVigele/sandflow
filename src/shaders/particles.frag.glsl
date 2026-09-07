varying float vKind;
varying float vSeed;
varying float vFlow;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;

  float core = smoothstep(1.0, 0.12, d);
  float rim = smoothstep(1.0, 0.55, d) * (1.0 - smoothstep(0.55, 0.05, d));

  vec3 splash = vec3(0.78, 0.88, 0.9);
  vec3 sediment = vec3(0.72, 0.58, 0.38);
  vec3 color = mix(sediment, splash, vKind);
  color += vec3(0.18) * rim * vKind;
  color = mix(color, color * vec3(0.86, 0.78, 0.58), (1.0 - vKind) * 0.25);

  float alpha = mix(0.42, 0.62, vKind) * core;
  alpha *= 0.55 + clamp(vFlow * 3.0, 0.0, 0.45);
  alpha *= 0.75 + fract(vSeed * 17.13) * 0.25;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.78));
}

varying float vAlive;
varying float vKind;
varying float vLife;

void main() {
  if (vAlive < 0.5) discard;
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float life = clamp(vLife, 0.0, 1.0);

  if (vKind > 1.5) {
    // Bedload grain: small warm speck sitting in the sheet.
    float core = smoothstep(1.0, 0.12, r2);
    float a = core * 0.42 * mix(0.45, 1.0, life);
    vec3 col = mix(vec3(0.52, 0.44, 0.28), vec3(0.86, 0.76, 0.52), core);
    gl_FragColor = vec4(col, a);
    return;
  }

  if (vKind > 0.5) {
    // Transient white bubble: bright core, thin highlight — no blue flash.
    float core = smoothstep(1.0, 0.05, r2);
    float ring = smoothstep(0.18, 0.03, abs(r2 - 0.38));
    float fade = mix(0.35, 1.0, life);
    float a = (core * 0.28 + ring * 0.16) * fade;
    vec3 col = mix(vec3(0.86, 0.88, 0.86), vec3(0.97, 0.98, 0.96), core);
    gl_FragColor = vec4(col, a);
    return;
  }

  // Soft foam speck: bright core, thin lace ring — no blue flash.
  float core = smoothstep(1.0, 0.08, r2);
  float ring = smoothstep(0.22, 0.04, abs(r2 - 0.42));
  float a = (core * 0.16 + ring * 0.10);
  vec3 col = mix(vec3(0.78, 0.74, 0.66), vec3(0.93, 0.94, 0.90), core);
  gl_FragColor = vec4(col, a);
}

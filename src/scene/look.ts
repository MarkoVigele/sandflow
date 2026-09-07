import * as THREE from "three";

/** Shared photoreal-lab look. Shaders and lights stay in lockstep. */
export const LOOK = {
  sunDir: new THREE.Vector3(0.44, 0.86, 0.26).normalize(),
  sunColor: new THREE.Color(1.0, 0.9, 0.74),
  ambient: new THREE.Color(0.19, 0.175, 0.155),
  fillColor: new THREE.Color(0.52, 0.6, 0.7),
  hemiSky: 0xb8c6d4,
  hemiGround: 0x5a4a36,
  bg: 0x16130f,
  fogNear: 16,
  fogFar: 32,
  sunIntensity: 1.28,
  fillIntensity: 0.32,
  hemiIntensity: 0.42,
  exposure: 1.08,
  envIntensity: 0.48,
} as const;

export function applyLookUniforms(mat: THREE.ShaderMaterial): void {
  const u = mat.uniforms;
  if (u.uSunDir) u.uSunDir.value.copy(LOOK.sunDir);
  if (u.uSunColor) u.uSunColor.value.copy(LOOK.sunColor);
  if (u.uAmbient) u.uAmbient.value.copy(LOOK.ambient);
}

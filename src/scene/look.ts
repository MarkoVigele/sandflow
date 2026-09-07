import * as THREE from "three";

/** Shared photoreal-lab look. Shaders and lights stay in lockstep. */
export const LOOK = {
  sunDir: new THREE.Vector3(0.44, 0.86, 0.26).normalize(),
  sunColor: new THREE.Color(1.0, 0.92, 0.76),
  ambient: new THREE.Color(0.24, 0.22, 0.19),
  fillColor: new THREE.Color(0.58, 0.64, 0.72),
  hemiSky: 0xc4d2de,
  hemiGround: 0x6a5640,
  bg: 0x18140f,
  fogNear: 18,
  fogFar: 36,
  sunIntensity: 1.55,
  fillIntensity: 0.4,
  hemiIntensity: 0.55,
  exposure: 1.18,
  envIntensity: 0.55,
} as const;

export function applyLookUniforms(mat: THREE.ShaderMaterial): void {
  const u = mat.uniforms;
  if (u.uSunDir) u.uSunDir.value.copy(LOOK.sunDir);
  if (u.uSunColor) u.uSunColor.value.copy(LOOK.sunColor);
  if (u.uAmbient) u.uAmbient.value.copy(LOOK.ambient);
}

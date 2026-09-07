import { aimCursorVisible, aimRadiusWorld, type AimCursorState } from "./AimCursor";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const base: AimCursorState = {
  tool: "pour",
  cameraMode: false,
  brushRadius: 0.06,
  pourRate: 1.4,
  traySize: 8,
  active: false,
};

assert(aimCursorVisible(base), "aim should show while using a tool");
assert(!aimCursorVisible({ cameraMode: true }), "aim hidden in camera mode");

const pour = aimRadiusWorld(base);
assert(pour >= 0.3 && pour <= 0.52, `pour radius readable, got ${pour}`);

const brush = aimRadiusWorld({ ...base, tool: "pile" });
assert(Math.abs(brush - 0.06 * 8) < 1e-6, `brush matches world radius, got ${brush}`);

const source = aimRadiusWorld({ ...base, tool: "source" });
assert(source === 0.34, `source placement ring, got ${source}`);

console.log("aim-cursor smoke ok");

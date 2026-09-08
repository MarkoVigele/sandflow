import type { SimSnapshot } from "../sim/SimClient";

const LIMIT = 18;

function cloneSnap(s: SimSnapshot): SimSnapshot {
  return {
    size: s.size,
    terrain: s.terrain.slice(),
    water: s.water.slice(),
    wetness: s.wetness.slice(),
    sediment: s.sediment.slice(),
    cohesion: s.cohesion.slice(),
    hardmask: (s.hardmask ?? new Float32Array(s.size * s.size)).slice(),
    sources: s.sources.map((x) => ({ ...x })),
    erodedSand: s.erodedSand,
  };
}

export class History {
  private undoStack: SimSnapshot[] = [];
  private redoStack: SimSnapshot[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  flags(): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: this.canUndo, canRedo: this.canRedo };
  }

  push(current: SimSnapshot): void {
    this.undoStack.push(cloneSnap(current));
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(current: SimSnapshot): SimSnapshot | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneSnap(current));
    return prev;
  }

  redo(current: SimSnapshot): SimSnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneSnap(current));
    return next;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

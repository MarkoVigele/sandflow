import {
  DEFAULT_PARAMS,
  defaultQuality,
  type QualityId,
  type SimParams,
  type ToolId,
} from "./types";

export interface UiState {
  tool: ToolId;
  playing: boolean;
  speed: number;
  quality: QualityId;
  autoQuality: boolean;
  params: SimParams;
  brushRadius: number;
  brushStrength: number;
  pourRate: number;
  selectedSourceId: string | null;
  advancedOpen: boolean;
  statsOpen: boolean;
  galleryOpen: boolean;
  aboutOpen: boolean;
  cameraMode: boolean;
  texturePrompt: string;
  presetId: string;
}

export const initialUiState = (): UiState => ({
  tool: "pour",
  playing: true,
  speed: 1,
  quality: defaultQuality(),
  autoQuality: true,
  params: { ...DEFAULT_PARAMS },
  brushRadius: 0.06,
  brushStrength: 1,
  pourRate: 1.4,
  selectedSourceId: null,
  advancedOpen: false,
  statsOpen: false,
  galleryOpen: false,
  aboutOpen: false,
  cameraMode: false,
  texturePrompt: "feiner Quarzsand, warm, trocken",
  presetId: "flat",
});

type Listener = () => void;

export class Store {
  state: UiState;
  private listeners = new Set<Listener>();

  constructor(state: UiState = initialUiState()) {
    this.state = state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  patch(partial: Partial<UiState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l();
  }

  setParams(partial: Partial<SimParams>): void {
    this.patch({ params: { ...this.state.params, ...partial } });
  }
}

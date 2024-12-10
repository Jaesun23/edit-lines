import { createHash } from "crypto";

interface EditState {
  path: string;
  edits: [number, number, string, string][];
  timestamp: number;
}

export class StateManager {
  private states: Map<string, EditState>;
  private readonly TTL: number;

  constructor() {
    this.states = new Map();

    // Read TTL from environment variable or use default (1 minute)
    const envTTL = process.env.MCP_EDIT_STATE_TTL;
    this.TTL = envTTL ? parseInt(envTTL, 10) : 60 * 1000;

    // Validate TTL is a positive number
    if (isNaN(this.TTL) || this.TTL <= 0) {
      throw new Error("MCP_EDIT_STATE_TTL must be a positive number when set");
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, state] of this.states.entries()) {
      if (now - state.timestamp > this.TTL) {
        this.states.delete(id);
      }
    }
  }

  private generateStateId(
    path: string,
    edits: [number, number, string, string][]
  ): string {
    const content = JSON.stringify({ path, edits });
    return createHash("sha256").update(content).digest("hex").slice(0, 8);
  }

  saveState(path: string, edits: [number, number, string, string][]): string {
    this.cleanup();
    const stateId = this.generateStateId(path, edits);
    this.states.set(stateId, {
      path,
      edits,
      timestamp: Date.now()
    });
    return stateId;
  }

  deleteState(stateId: string): void {
    this.cleanup();
    this.states.delete(stateId);
  }

  getState(stateId: string): EditState | undefined {
    this.cleanup();
    const state = this.states.get(stateId);
    if (state && Date.now() - state.timestamp <= this.TTL) {
      return state;
    }
    this.states.delete(stateId);
    return undefined;
  }

  // Added for testing purposes
  getTTL(): number {
    return this.TTL;
  }
}

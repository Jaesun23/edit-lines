// utils/stateManager.ts
import { createHash } from "crypto";
import { EditOperation } from "../types/editTypes.js";

interface EditState {
  path: string;
  edits: EditOperation[];
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

  private generateStateId(path: string, edits: EditOperation[]): string {
    // Sort edits by line numbers to ensure consistent hashing
    const sortedEdits = [...edits].sort((a, b) => {
      // 안전한 비교: startLine과 endLine이 없을 경우 기본값(0) 사용
      const aStartLine = a.startLine ?? a.lineNumber ?? 0;
      const bStartLine = b.startLine ?? b.lineNumber ?? 0;

      if (aStartLine === bStartLine) {
        const aEndLine = a.endLine ?? a.lineNumber ?? aStartLine;
        const bEndLine = b.endLine ?? b.lineNumber ?? bStartLine;
        return aEndLine - bEndLine;
      }
      return aStartLine - bStartLine;
    });

    // Create a deterministic string representation
    const content = JSON.stringify({
      path,
      edits: sortedEdits.map((edit) => ({
        ...edit,
        strMatch: edit.strMatch?.trim(),
        regexMatch: edit.regexMatch?.trim()
      }))
    });

    return createHash("sha256").update(content).digest("hex").slice(0, 8);
  }

  /**
   * Save edit state and return a state ID
   * @param path File path
   * @param edits Array of edit operations (can be array-style or object-style)
   * @returns State ID for later retrieval
   */
  saveState(
    path: string,
    edits: EditOperation[] | [number, number, string, string?][]
  ): string {
    this.cleanup();

    // Convert array-style edits to object style if needed
    const normalizedEdits: EditOperation[] = edits.map((edit) => {
      if (Array.isArray(edit)) {
        return {
          startLine: edit[0],
          endLine: edit[1],
          content: edit[2],
          strMatch: edit[3]?.trim()
        };
      }
      return {
        ...edit,
        strMatch: edit.strMatch?.trim(),
        regexMatch: edit.regexMatch?.trim()
      };
    });

    const stateId = this.generateStateId(path, normalizedEdits);

    this.states.set(stateId, {
      path,
      edits: normalizedEdits,
      timestamp: Date.now()
    });

    return stateId;
  }

  /**
   * Retrieve edit state by ID
   * @param stateId State ID from saveState
   * @returns Edit state if found and not expired, undefined otherwise
   */
  getState(stateId: string): EditState | undefined {
    this.cleanup();
    const state = this.states.get(stateId);

    if (state && Date.now() - state.timestamp <= this.TTL) {
      return state;
    }

    this.states.delete(stateId);
    return undefined;
  }

  /**
   * Delete a state by ID
   * @param stateId State ID to delete
   */
  deleteState(stateId: string): void {
    this.cleanup();
    this.states.delete(stateId);
  }

  /**
   * Get the current TTL setting (for testing)
   */
  getTTL(): number {
    return this.TTL;
  }

  /**
   * Get the number of active states (for testing)
   */
  getActiveStateCount(): number {
    this.cleanup();
    return this.states.size;
  }

  /**
   * Check if a state exists and is valid
   * @param stateId State ID to check
   * @returns boolean indicating if state exists and is valid
   */
  isStateValid(stateId: string): boolean {
    const state = this.getState(stateId);
    return state !== undefined;
  }

  /**
   * Clear all states (mainly for testing)
   */
  clearAllStates(): void {
    this.states.clear();
  }
}

import { StateManager } from "../utils/stateManager.js";

describe("StateManager", () => {
  const originalEnv = process.env;
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
    process.env = { ...originalEnv };
    delete process.env.MCP_EDIT_STATE_TTL;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("saveState", () => {
    it("should generate a consistent state ID for the same inputs", () => {
      const path = "/test/file.txt";
      const edits: [number, number, string][] = [[1, 2, "test content"]];

      const stateId1 = stateManager.saveState(path, edits);
      const stateId2 = stateManager.saveState(path, edits);

      expect(stateId1).toBe(stateId2);
    });

    it("should generate different state IDs for different inputs", () => {
      const path = "/test/file.txt";
      const edits1: [number, number, string][] = [[1, 2, "test content"]];
      const edits2: [number, number, string][] = [[1, 2, "different content"]];

      const stateId1 = stateManager.saveState(path, edits1);
      const stateId2 = stateManager.saveState(path, edits2);

      expect(stateId1).not.toBe(stateId2);
    });
  });

  describe("getState", () => {
    it("should return undefined for non-existent state ID", () => {
      const state = stateManager.getState("nonexistent");
      expect(state).toBeUndefined();
    });

    it("should return the correct state for valid state ID", () => {
      const path = "/test/file.txt";
      const edits: [number, number, string][] = [[1, 2, "test content"]];

      const stateId = stateManager.saveState(path, edits);
      const state = stateManager.getState(stateId);

      expect(state).toBeDefined();
      expect(state?.path).toBe(path);
      expect(state?.edits).toEqual(edits);
      expect(state?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("should handle multiple states independently", () => {
      const path1 = "/test/file1.txt";
      const path2 = "/test/file2.txt";
      const edits1: [number, number, string][] = [[1, 2, "content 1"]];
      const edits2: [number, number, string][] = [[3, 4, "content 2"]];

      const stateId1 = stateManager.saveState(path1, edits1);
      const stateId2 = stateManager.saveState(path2, edits2);

      const state1 = stateManager.getState(stateId1);
      const state2 = stateManager.getState(stateId2);

      expect(state1?.path).toBe(path1);
      expect(state1?.edits).toEqual(edits1);
      expect(state2?.path).toBe(path2);
      expect(state2?.edits).toEqual(edits2);
    });
  });

  describe("deleteState", () => {
    it("should remove the state with the given ID", () => {
      const path = "/test/file.txt";
      const edits: [number, number, string][] = [[1, 2, "test content"]];

      const stateId = stateManager.saveState(path, edits);
      expect(stateManager.getState(stateId)).toBeDefined();

      stateManager.deleteState(stateId);
      expect(stateManager.getState(stateId)).toBeUndefined();
    });

    it("should only remove the specified state", () => {
      const path1 = "/test/file1.txt";
      const path2 = "/test/file2.txt";
      const edits1: [number, number, string][] = [[1, 2, "content 1"]];
      const edits2: [number, number, string][] = [[3, 4, "content 2"]];

      const stateId1 = stateManager.saveState(path1, edits1);
      const stateId2 = stateManager.saveState(path2, edits2);

      stateManager.deleteState(stateId1);

      expect(stateManager.getState(stateId1)).toBeUndefined();
      expect(stateManager.getState(stateId2)).toBeDefined();
    });
  });

  describe("TTL functionality", () => {
    it("should expire states after TTL", async () => {
      // Replace the actual TTL with a shorter one for testing
      Object.defineProperty(stateManager, "TTL", { value: 50 });

      const path = "/test/file.txt";
      const edits: [number, number, string][] = [[1, 2, "test content"]];

      const stateId = stateManager.saveState(path, edits);
      expect(stateManager.getState(stateId)).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(stateManager.getState(stateId)).toBeUndefined();
    });

    it("should cleanup expired states during operations", async () => {
      Object.defineProperty(stateManager, "TTL", { value: 50 });

      const path1 = "/test/file1.txt";
      const path2 = "/test/file2.txt";
      const edits: [number, number, string][] = [[1, 2, "test content"]];

      // Save first state
      const stateId1 = stateManager.saveState(path1, edits);

      // Wait for some time
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Save second state
      const stateId2 = stateManager.saveState(path2, edits);

      // Wait for first state to expire
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Getting state2 should trigger cleanup of state1
      expect(stateManager.getState(stateId2)).toBeDefined();
      expect(stateManager.getState(stateId1)).toBeUndefined();
    });
  });

  describe("TTL Configuration", () => {
    it("should use default TTL (60000ms) when no environment variable is set", () => {
      const manager = new StateManager();
      expect(manager.getTTL()).toBe(60000);
    });

    it("should use custom TTL when MCP_EDIT_STATE_TTL is set", () => {
      process.env.MCP_EDIT_STATE_TTL = "30000";
      const manager = new StateManager();
      expect(manager.getTTL()).toBe(30000);
    });

    it("should throw error for invalid TTL value", () => {
      process.env.MCP_EDIT_STATE_TTL = "invalid";
      expect(() => new StateManager()).toThrow(
        "MCP_EDIT_STATE_TTL must be a positive number when set"
      );
    });

    it("should throw error for negative TTL value", () => {
      process.env.MCP_EDIT_STATE_TTL = "-1000";
      expect(() => new StateManager()).toThrow(
        "MCP_EDIT_STATE_TTL must be a positive number when set"
      );
    });

    it("should throw error for zero TTL value", () => {
      process.env.MCP_EDIT_STATE_TTL = "0";
      expect(() => new StateManager()).toThrow(
        "MCP_EDIT_STATE_TTL must be a positive number when set"
      );
    });

    it("should respect custom TTL for state expiration", async () => {
      // Set a very short TTL (100ms)
      process.env.MCP_EDIT_STATE_TTL = "100";
      const manager = new StateManager();

      // Save a state
      const stateId = manager.saveState("/test/path", [[1, 1, "test"]]);

      // Verify state exists initially
      expect(manager.getState(stateId)).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify state is expired
      expect(manager.getState(stateId)).toBeUndefined();
    });

    it("should keep state when within TTL period", async () => {
      // Set TTL to 200ms
      process.env.MCP_EDIT_STATE_TTL = "200";
      const manager = new StateManager();

      // Save a state
      const stateId = manager.saveState("/test/path", [[1, 1, "test"]]);

      // Wait for half the TTL
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify state still exists
      expect(manager.getState(stateId)).toBeDefined();
    });
  });
});

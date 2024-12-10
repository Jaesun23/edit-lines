import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { approveEdit } from "../utils/approveEdit.js";
import { StateManager } from "../utils/stateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("approveEdit", () => {
  let stateManager: StateManager;
  let tempPath: string;
  const content = "line 1\nline 2\nline 3\n";

  // Helper to create a temporary file for testing
  async function createTempFile(content: string): Promise<string> {
    const tempPath = join(__dirname, "fixtures", `temp-${Date.now()}.txt`);
    await fs.writeFile(tempPath, content);
    return tempPath;
  }

  beforeEach(async () => {
    stateManager = new StateManager();
    tempPath = await createTempFile(content);
  });

  // Clean up temp files after each test
  afterEach(async () => {
    const files = await fs.readdir(join(__dirname, "fixtures"));
    for (const file of files) {
      if (file.startsWith("temp-")) {
        await fs.unlink(join(__dirname, "fixtures", file));
      }
    }
  });

  it("should successfully apply valid edit", async () => {
    // Save a state for a simple edit
    const edits: [number, number, string][] = [[2, 2, "modified line"]];
    const stateId = stateManager.saveState(tempPath, edits);

    // Approve the edit
    const result = await approveEdit(stateId, stateManager);

    // Verify the file was modified
    const newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe("line 1\nmodified line\nline 3\n");
    expect(result).toContain("-line 2");
    expect(result).toContain("+modified line");

    // Verify state was consumed
    expect(stateManager.getState(stateId)).toBeUndefined();
  });

  it("should handle non-existent state ID", async () => {
    await expect(approveEdit("non-existent-id", stateManager)).rejects.toThrow(
      "Invalid or expired state ID"
    );

    // Verify file wasn't modified
    const newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should handle expired state", async () => {
    // Set short TTL for testing
    Object.defineProperty(stateManager, "TTL", { value: 50 });

    // Save a state
    const edits: [number, number, string][] = [[2, 2, "modified line"]];
    const stateId = stateManager.saveState(tempPath, edits);

    // Wait for state to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Try to approve expired state
    await expect(approveEdit(stateId, stateManager)).rejects.toThrow(
      "Invalid or expired state ID"
    );

    // Verify file wasn't modified
    const newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should preserve state if edit fails", async () => {
    // Save a state with invalid line numbers
    const edits: [number, number, string][] = [[999, 999, "invalid line"]];
    const stateId = stateManager.saveState(tempPath, edits);

    // Try to approve edit that will fail
    await expect(approveEdit(stateId, stateManager)).rejects.toThrow();

    // Verify state still exists
    expect(stateManager.getState(stateId)).toBeDefined();

    // Verify file wasn't modified
    const newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should handle multiple approvals in sequence", async () => {
    // Save multiple states
    const edits1: [number, number, string][] = [[1, 1, "first edit"]];
    const edits2: [number, number, string][] = [[3, 3, "second edit"]];

    const stateId1 = stateManager.saveState(tempPath, edits1);
    const stateId2 = stateManager.saveState(tempPath, edits2);

    // Approve first edit
    await approveEdit(stateId1, stateManager);

    // Verify first edit
    let newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe("first edit\nline 2\nline 3\n");

    // Approve second edit
    await approveEdit(stateId2, stateManager);

    // Verify both edits
    newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe("first edit\nline 2\nsecond edit\n");

    // Verify both states were consumed
    expect(stateManager.getState(stateId1)).toBeUndefined();
    expect(stateManager.getState(stateId2)).toBeUndefined();
  });

  it("should clean up state even if file is unchanged", async () => {
    // Save a state that makes no changes
    const edits: [number, number, string][] = [[2, 2, "line 2"]];
    const stateId = stateManager.saveState(tempPath, edits);

    // Approve the edit
    await approveEdit(stateId, stateManager);

    // Verify file content is the same
    const newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toBe(content);

    // Verify state was still consumed
    expect(stateManager.getState(stateId)).toBeUndefined();
  });
});

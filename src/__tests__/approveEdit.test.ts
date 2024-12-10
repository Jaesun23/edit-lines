import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { approveEdit } from "../utils/approveEdit.js";
import { StateManager } from "../utils/stateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("approveEdit", () => {
  let stateManager: StateManager;
  let tempFilePath: string;
  let content: string;

  // Helper to create a temporary file for testing
  async function createTempFile(fileContent: string): Promise<string> {
    const path = join(FIXTURES_DIR, `temp-${Date.now()}.txt`);
    await fs.writeFile(path, fileContent);
    return path;
  }

  // Helper to clean up all temp files
  async function cleanupTempFiles() {
    try {
      const files = await fs.readdir(FIXTURES_DIR);
      await Promise.all(
        files
          .filter((file) => file.startsWith("temp-"))
          .map((file) =>
            fs.unlink(join(FIXTURES_DIR, file)).catch((error) => {
              console.error(`Failed to delete ${file}:`, error);
            })
          )
      );
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }

  beforeEach(async () => {
    // Clean up any leftover temp files before each test
    await cleanupTempFiles();

    stateManager = new StateManager();
    content = "line 1\nline 2\nline 3\n";
    tempFilePath = await createTempFile(content);
  });

  afterEach(async () => {
    // Clean up all temp files after each test
    await cleanupTempFiles();
  });

  it("should successfully apply valid edit", async () => {
    // Save a state for a simple edit
    const edits: [number, number, string][] = [[2, 2, "modified line"]];
    const stateId = stateManager.saveState(tempFilePath, edits);

    // Approve the edit
    const result = await approveEdit(stateId, stateManager);

    // Verify the file was modified
    const newContent = await fs.readFile(tempFilePath, "utf-8");
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
    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should preserve state if edit fails", async () => {
    // Save a state with invalid line numbers
    const edits: [number, number, string][] = [[999, 999, "invalid line"]];
    const stateId = stateManager.saveState(tempFilePath, edits);

    // Try to approve edit that will fail
    await expect(approveEdit(stateId, stateManager)).rejects.toThrow();

    // Verify state still exists
    expect(stateManager.getState(stateId)).toBeDefined();

    // Verify file wasn't modified
    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should handle multiple approvals in sequence", async () => {
    // Save multiple states
    const edits1: [number, number, string][] = [[1, 1, "first edit"]];
    const edits2: [number, number, string][] = [[3, 3, "second edit"]];

    const stateId1 = stateManager.saveState(tempFilePath, edits1);
    const stateId2 = stateManager.saveState(tempFilePath, edits2);

    // Approve first edit
    await approveEdit(stateId1, stateManager);

    // Verify first edit
    let newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("first edit\nline 2\nline 3\n");

    // Approve second edit
    await approveEdit(stateId2, stateManager);

    // Verify both edits
    newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("first edit\nline 2\nsecond edit\n");

    // Verify both states were consumed
    expect(stateManager.getState(stateId1)).toBeUndefined();
    expect(stateManager.getState(stateId2)).toBeUndefined();
  });

  it("should clean up state even if file is unchanged", async () => {
    // Save a state that makes no changes
    const edits: [number, number, string][] = [[2, 2, "line 2"]];
    const stateId = stateManager.saveState(tempFilePath, edits);

    // Approve the edit
    await approveEdit(stateId, stateManager);

    // Verify file content is the same
    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);

    // Verify state was still consumed
    expect(stateManager.getState(stateId)).toBeUndefined();
  });
});

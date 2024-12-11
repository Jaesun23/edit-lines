import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { EditOperation } from "../types/editTypes.js";
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
    const path = join(
      FIXTURES_DIR,
      `temp-${Date.now()}-${Math.round(1000000 * Math.random())}.txt`
    );
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
      // to ensure the file is created after the cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }

  beforeEach(async () => {
    stateManager = new StateManager();
    content = "line 1\nline 2\nline 3\nline 4\nline 5\n";
    tempFilePath = await createTempFile(content);
  });

  afterEach(async () => {
    await cleanupTempFiles();
  });

  it("should successfully apply valid edit", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 2,
        endLine: 2,
        content: "modified line"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    const result = await approveEdit(stateId, stateManager);

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("line 1\nmodified line\nline 3\nline 4\nline 5\n");
    expect(result).toContain("-line 2");
    expect(result).toContain("+modified line");
    expect(stateManager.getState(stateId)).toBeUndefined();
  });

  it("should apply edit with string match", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 2,
        endLine: 2,
        content: "new",
        strMatch: "line 2"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    await approveEdit(stateId, stateManager);

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("line 1\nnew\nline 3\nline 4\nline 5\n");
  });

  it("should apply edit with regex match", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 2,
        endLine: 2,
        content: "new line ${num}",
        regexMatch: "line (?<num>\\d+)"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    await approveEdit(stateId, stateManager);

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("line 1\nnew line 2\nline 3\nline 4\nline 5\n");
  });

  it("should handle non-existent state ID", async () => {
    await expect(approveEdit("non-existent-id", stateManager)).rejects.toThrow(
      "Invalid or expired state ID"
    );

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should preserve state if edit fails", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 999,
        endLine: 999,
        content: "invalid line"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    await expect(approveEdit(stateId, stateManager)).rejects.toThrow();

    expect(stateManager.getState(stateId)).toBeDefined();
    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should preserve state if string match fails", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 2,
        endLine: 2,
        content: "new content",
        strMatch: "non-existent content"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    await expect(approveEdit(stateId, stateManager)).rejects.toThrow();

    expect(stateManager.getState(stateId)).toBeDefined();
    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should preserve state if regex match fails", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 2,
        endLine: 2,
        content: "new content",
        regexMatch: "non-existent-\\d+"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    await expect(approveEdit(stateId, stateManager)).rejects.toThrow();

    expect(stateManager.getState(stateId)).toBeDefined();
    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
  });

  it("should handle multiple approvals in sequence", async () => {
    const edits1: EditOperation[] = [
      {
        startLine: 1,
        endLine: 1,
        content: "first edit"
      }
    ];
    const edits2: EditOperation[] = [
      {
        startLine: 3,
        endLine: 3,
        content: "second edit"
      }
    ];

    const stateId1 = stateManager.saveState(tempFilePath, edits1);
    const stateId2 = stateManager.saveState(tempFilePath, edits2);

    await approveEdit(stateId1, stateManager);

    let newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("first edit\nline 2\nline 3\nline 4\nline 5\n");

    await approveEdit(stateId2, stateManager);

    newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(
      "first edit\nline 2\nsecond edit\nline 4\nline 5\n"
    );

    expect(stateManager.getState(stateId1)).toBeUndefined();
    expect(stateManager.getState(stateId2)).toBeUndefined();
  });

  it("should clean up state even if file is unchanged", async () => {
    const edits: EditOperation[] = [
      {
        startLine: 2,
        endLine: 2,
        content: "line 2"
      }
    ];
    const stateId = stateManager.saveState(tempFilePath, edits);

    await approveEdit(stateId, stateManager);

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content);
    expect(stateManager.getState(stateId)).toBeUndefined();
  });
});

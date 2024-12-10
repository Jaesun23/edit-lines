import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { editFile } from "../utils/fileEditor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "fixtures");

describe("fileEditor", () => {
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
    // Create a new temp file before each test
    content = "line 1\nline 2\nline 3\n    line 4\n    line 5\n";
    tempFilePath = await createTempFile(content);
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTempFiles();
  });

  it("should handle single line replacements", async () => {
    const result = await editFile({
      p: tempFilePath,
      e: [[2, 2, "replaced line"]]
    });

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(
      "line 1\nreplaced line\nline 3\n    line 4\n    line 5\n"
    );
    expect(result).toContain("-line 2");
    expect(result).toContain("+replaced line");
  });

  it("should handle multiple line replacements", async () => {
    const result = await editFile({
      p: tempFilePath,
      e: [[2, 4, "new line 1\nnew line 2"]]
    });

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe("line 1\nnew line 1\nnew line 2\n    line 5\n");
  });

  it("should process edits in reverse line order", async () => {
    const result = await editFile({
      p: tempFilePath,
      e: [
        [1, 1, "first line"],
        [4, 4, "fourth line"]
      ]
    });

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(
      "first line\nline 2\nline 3\nfourth line\n    line 5\n"
    );
  });

  it("should throw error for overlapping ranges", async () => {
    await expect(
      editFile({
        p: tempFilePath,
        e: [
          [1, 2, "overlap 1"],
          [2, 3, "overlap 2"]
        ]
      })
    ).rejects.toThrow("Line 2 is affected by multiple edits");
  });

  describe("line range validation", () => {
    it("should allow equal start and end line numbers", async () => {
      const result = await editFile({
        p: tempFilePath,
        e: [[2, 2, "same line"]]
      });

      const newContent = await fs.readFile(tempFilePath, "utf-8");
      expect(newContent).toBe(
        "line 1\nsame line\nline 3\n    line 4\n    line 5\n"
      );
    });

    it("should throw error when start line is greater than end line", async () => {
      await expect(
        editFile({
          p: tempFilePath,
          e: [[3, 2, "invalid range"]]
        })
      ).rejects.toThrow(
        "Invalid range: start line 3 is greater than end line 2"
      );
    });

    it("should throw error for zero line numbers", async () => {
      await expect(
        editFile({
          p: tempFilePath,
          e: [[0, 1, "invalid"]]
        })
      ).rejects.toThrow("Line numbers must be positive integers");

      await expect(
        editFile({
          p: tempFilePath,
          e: [[1, 0, "invalid"]]
        })
      ).rejects.toThrow("Line numbers must be positive integers");
    });

    it("should throw error for negative line numbers", async () => {
      await expect(
        editFile({
          p: tempFilePath,
          e: [[-1, 1, "invalid"]]
        })
      ).rejects.toThrow("Line numbers must be positive integers");

      await expect(
        editFile({
          p: tempFilePath,
          e: [[1, -1, "invalid"]]
        })
      ).rejects.toThrow("Line numbers must be positive integers");
    });
  });

  describe("search parameter functionality", () => {
    it("should preserve indentation when using search parameter", async () => {
      const result = await editFile({
        p: tempFilePath,
        e: [[5, 5, "new content", "line 5"]]
      });

      const newContent = await fs.readFile(tempFilePath, "utf-8");
      expect(newContent).toBe(
        "line 1\nline 2\nline 3\n    line 4\n    new content\n"
      );
      expect(result).toContain("-    line 5");
      expect(result).toContain("+    new content");
    });

    it("should replace line when search parameter is not found", async () => {
      const result = await editFile({
        p: tempFilePath,
        e: [[5, 5, "new content", "line 6"]]
      });

      const newContent = await fs.readFile(tempFilePath, "utf-8");
      expect(newContent).toBe(
        "line 1\nline 2\nline 3\n    line 4\nnew content\n"
      );
      expect(result).toContain("-    line 5");
      expect(result).toContain("+new content");
    });

    it("should handle multiple line edits with search parameter", async () => {
      const result = await editFile({
        p: tempFilePath,
        e: [
          [2, 2, "new line 2", "line 2"],
          [4, 4, "new line 4", "line 4"]
        ]
      });

      const newContent = await fs.readFile(tempFilePath, "utf-8");
      expect(newContent).toBe(
        "line 1\nnew line 2\nline 3\n    new line 4\n    line 5\n"
      );
    });

    it("should work with dry run mode", async () => {
      const result = await editFile(
        {
          p: tempFilePath,
          e: [[5, 5, "new content", "line 5"]]
        },
        true
      );

      const newContent = await fs.readFile(tempFilePath, "utf-8");
      expect(newContent).not.toContain("new content"); // File should be unchanged
      expect(result).toContain("-    line 5");
      expect(result).toContain("+    new content");
    });
  });

  it("should handle dry run without modifying file", async () => {
    const result = await editFile(
      {
        p: tempFilePath,
        e: [[2, 2, "replaced line"]]
      },
      true
    );

    const newContent = await fs.readFile(tempFilePath, "utf-8");
    expect(newContent).toBe(content); // File should be unchanged
    expect(result).toContain("diff"); // But diff should be generated
  });

  it("should handle complex React component replacement", async () => {
    const content = `<Grid item xs={3}>
            <KPICard
              title="Fleet Utilization"
              value={Math.round(report.data.asset_metrics.summary.avg_utilization_rate)}
              color="error"
              isLoading={isLoading}
            />
          </Grid>`;
    const tempPath = await createTempFile(content);

    const result = await editFile({
      p: tempPath,
      e: [
        [
          2,
          7,
          `            <CustomTab
              label="Driver Performance"
              tabcolor={TAB_COLORS.driver}
              active={currentTabIndex}
              activeBorderBottomColor={getTabColor(currentTabIndex)}
            />`
        ]
      ]
    });

    const newContent = await fs.readFile(tempPath, "utf-8");
    expect(newContent).toContain("CustomTab");
    expect(newContent).toContain("Driver Performance");
    expect(newContent).not.toContain("KPICard");
  });
});

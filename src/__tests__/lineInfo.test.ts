import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getLineInfo } from "../lineInfo.js";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to test file
const testFilePath = join(__dirname, "fixtures", "sample.txt");

describe("lineInfo", () => {
  it("should return correct line information", async () => {
    const result = await getLineInfo(testFilePath, [2, 4], 1);

    expect(result).toContain("Line 2:");
    expect(result).toContain("> 2: line 2");
    expect(result).toContain(" 1: line 1");
    expect(result).toContain(" 3: line 3");
    expect(result).toContain("Line 4:");
    expect(result).toContain("> 4: line 4");
  });

  it("should handle invalid line numbers", async () => {
    const result = await getLineInfo(testFilePath, [0, 6], 0);

    expect(result).toContain("Invalid line number");
    expect(result).toContain("file has 5 lines");
  });

  it("should handle zero context lines", async () => {
    const result = await getLineInfo(testFilePath, [2], 0);

    expect(result).toContain("Line 2:");
    expect(result).toContain("> 2: line 2");
    expect(result.split("\n").length).toBe(3); // Line number, content, empty line
  });

  it("should handle files with empty lines", async () => {
    const result = await getLineInfo(testFilePath, [5], 0);

    expect(result).toContain("Line 5:");
    expect(result).toContain("> 5: line 5");
  });
});

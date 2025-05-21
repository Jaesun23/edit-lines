import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getLineInfo } from "../utils/lineInfo.js";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to test file
const testFilePath = join(__dirname, "fixtures", "sample.txt");

describe("lineInfo", () => {
  it("should return correct line information", async () => {
    const result = await getLineInfo(testFilePath, [2, 4], 1);

    expect(result).toContain("Line 2:");
    expect(result).toContain("> 2: Line 2");
    expect(result).toContain(" 1: Line 1");
    expect(result).toContain(" 3: Line 3");
    expect(result).toContain("Line 4:");
    expect(result).toContain("> 4: Line 4");
  });

  it("should handle invalid line numbers", async () => {
    const result = await getLineInfo(testFilePath, [0, 6], 0);

    expect(result).toContain("Invalid line number");
    expect(result).toContain("file has 5 lines");
  });

  it("should handle zero context lines", async () => {
    const result = await getLineInfo(testFilePath, [2], 0);

    expect(result).toContain("Line 2:");
    expect(result).toContain("> 2: Line 2");
    expect(result).not.toContain("Line 1");
    expect(result).not.toContain("Line 3");
  });

  it("should handle files with empty lines", async () => {
    const result = await getLineInfo(testFilePath, [5], 0);

    expect(result).toContain("Line 5:");
    expect(result).toContain("> 5: Line 5");
  });
});

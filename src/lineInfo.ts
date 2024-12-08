import fs from "fs/promises";
import { normalizeLineEndings } from "./utils.js";

export async function getLineInfo(
  filePath: string,
  lineNumbers: number[],
  context: number = 0
): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = normalizeLineEndings(content).split("\n");
  const result: string[] = [];

  const uniqueLineNumbers = [...new Set(lineNumbers)].sort((a, b) => a - b);

  for (const lineNum of uniqueLineNumbers) {
    const lineIndex = lineNum - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      result.push(
        `Line ${lineNum}: Invalid line number (file has ${lines.length} lines)`
      );
      continue;
    }

    const startLine = Math.max(0, lineIndex - context);
    const endLine = Math.min(lines.length - 1, lineIndex + context);

    result.push(`Line ${lineNum}:`);
    for (let i = startLine; i <= endLine; i++) {
      const prefix = i === lineIndex ? ">" : " ";
      result.push(`${prefix} ${i + 1}: ${lines[i]}`);
    }
    result.push("");
  }

  return result.join("\n");
}

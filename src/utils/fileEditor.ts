// fileEditor.ts
import fs from "fs/promises";
import { createTwoFilesPatch } from "diff";
import { normalizeLineEndings } from "./utils.js";

// Types
interface LineRange {
  start: number;
  end: number;
  content: string;
  search: string;
}

interface FileSnapshot {
  lines: string[];
  originalContent: string;
}

class FileEditor {
  private snapshot: FileSnapshot;
  private edits: LineRange[];

  constructor(content: string) {
    const normalized = normalizeLineEndings(content);
    this.snapshot = {
      lines: normalized.split("\n"),
      originalContent: normalized
    };
    this.edits = [];
  }

  private validateRange(range: LineRange): void {
    const totalLines = this.snapshot.lines.length;

    if (range.start < 1 || range.end < 1) {
      throw new Error("Line numbers must be positive integers");
    }

    if (range.start > range.end) {
      throw new Error(
        `Invalid range: start line ${range.start} is greater than end line ${range.end}`
      );
    }

    if (range.start > totalLines || range.end > totalLines) {
      throw new Error(
        `Invalid line range: file has ${totalLines} lines but range is ${range.start}-${range.end}`
      );
    }
  }

  private validateEdits(): void {
    // First validate each individual edit
    this.edits.forEach((edit) => this.validateRange(edit));

    // Then check for overlaps using a line occupation map
    const lineOccupation = new Array(this.snapshot.lines.length + 1).fill(
      false
    );

    for (const edit of this.edits) {
      for (let line = edit.start; line <= edit.end; line++) {
        if (lineOccupation[line]) {
          throw new Error(`Line ${line} is affected by multiple edits`);
        }
        lineOccupation[line] = true;
      }
    }
  }

  addEdit(range: LineRange): void {
    this.edits.push(range);
  }

  applyEdits(): string {
    // Validate all edits before applying any changes
    this.validateEdits();

    // Sort edits by start line in descending order
    this.edits.sort((a, b) => b.start - a.start);

    // Create a new array of lines for the modified content
    let modifiedLines = [...this.snapshot.lines];

    // Apply each edit
    for (const edit of this.edits) {
      const startIndex = edit.start - 1;
      const endIndex = edit.end - 1;
      let newLines = normalizeLineEndings(edit.content).split("\n");

      // If search string is provided, attempt to replace it in each line
      if (edit.search) {
        for (let i = startIndex; i <= endIndex; i++) {
          const currentLine = modifiedLines[i];
          if (currentLine.includes(edit.search)) {
            newLines = [currentLine.replace(edit.search, edit.content)];
            break;
          }
        }
      }

      // Replace the lines
      modifiedLines.splice(startIndex, endIndex - startIndex + 1, ...newLines);
    }

    return modifiedLines.join("\n");
  }

  createDiff(modifiedContent: string, filepath: string): string {
    return createTwoFilesPatch(
      filepath,
      filepath,
      this.snapshot.originalContent,
      modifiedContent,
      "original",
      "modified"
    );
  }
}

export async function editFile(
  options: { p: string; e: [number, number, string, string?][] },
  dryRun = false
): Promise<string> {
  // Read file content
  const content = await fs.readFile(options.p, "utf-8");

  // Create editor instance
  const editor = new FileEditor(content);

  // Add all edits
  for (const [start, end, newContent, search] of options.e) {
    editor.addEdit({ start, end, content: newContent, search: search ?? "" });
  }

  // Apply edits and get modified content
  const modifiedContent = editor.applyEdits();

  // Create diff
  const diff = editor.createDiff(modifiedContent, options.p);

  // Write changes if not dry run
  if (!dryRun) {
    await fs.writeFile(options.p, modifiedContent, "utf-8");
  }

  // Format and return diff
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  return `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;
}

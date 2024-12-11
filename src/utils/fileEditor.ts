// utils/fileEditor.ts
import fs from "fs/promises";
import { createTwoFilesPatch } from "diff";
import {
  EditOperation,
  EditOperationResult,
  MatchNotFoundError
} from "../types/editTypes.js";
import { normalizeLineEndings } from "./utils.js";

class FileEditor {
  private lines: string[];
  private originalContent: string;
  private edits: EditOperation[];
  private results: Map<number, EditOperationResult>;

  constructor(content: string) {
    this.originalContent = normalizeLineEndings(content);
    this.lines = this.originalContent.split("\n");
    this.edits = [];
    this.results = new Map();
  }

  addEdit(edit: EditOperation): void {
    this.validateRange(edit);
    this.edits.push(edit);
  }

  private validateRange(edit: EditOperation): void {
    if (edit.startLine > edit.endLine) {
      throw new Error(
        `Invalid range: start line ${edit.startLine} is greater than end line ${edit.endLine}`
      );
    }

    const totalLines = this.lines.length;
    if (edit.startLine < 1 || edit.endLine > totalLines) {
      throw new Error(
        `Invalid line range: file has ${totalLines} lines but range is ${edit.startLine}-${edit.endLine}`
      );
    }
  }

  private validateEdits(): void {
    // Create a map to track line usage
    const lineUsage = new Map<number, EditOperation>();

    for (const edit of this.edits) {
      for (let line = edit.startLine; line <= edit.endLine; line++) {
        const existingEdit = lineUsage.get(line);
        if (existingEdit) {
          throw new Error(
            `Line ${line} is affected by multiple edits (${JSON.stringify(existingEdit)} and ${JSON.stringify(edit)})`
          );
        }
        lineUsage.set(line, edit);
      }
    }
  }

  private applyMatchReplace(
    lineContent: string,
    edit: EditOperation,
    lineNumber: number
  ): string {
    // If no matching criteria specified, replace the entire line
    if (!edit.strMatch && !edit.regexMatch) {
      return edit.content;
    }

    if (edit.strMatch) {
      if (!lineContent.includes(edit.strMatch)) {
        throw new MatchNotFoundError(lineNumber, edit.strMatch, false);
      }
      return lineContent.replaceAll(edit.strMatch, edit.content);
    }

    if (edit.regexMatch) {
      try {
        const regex = new RegExp(edit.regexMatch, "g");
        if (!regex.test(lineContent)) {
          throw new MatchNotFoundError(lineNumber, edit.regexMatch, true);
        }
        // Reset lastIndex after test
        regex.lastIndex = 0;
        return lineContent.replace(regex, edit.content);
      } catch (error) {
        if (error instanceof MatchNotFoundError) {
          throw error;
        }
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(
          `Invalid regex pattern "${edit.regexMatch}": ${errorMessage}`
        );
      }
    }

    return lineContent; // Fallback, should never reach here
  }

  applyEdits(): string {
    this.validateEdits();

    // Sort edits in reverse order to handle line numbers correctly
    const sortedEdits = [...this.edits].sort(
      (a, b) => b.startLine - a.startLine
    );

    // Create a new array for modified lines
    const modifiedLines = [...this.lines];

    for (const edit of sortedEdits) {
      const startIdx = edit.startLine - 1;
      const endIdx = edit.endLine - 1;

      try {
        // For single-line edits with matching
        if (
          edit.startLine === edit.endLine &&
          (edit.strMatch || edit.regexMatch)
        ) {
          const lineContent = modifiedLines[startIdx];
          const newContent = this.applyMatchReplace(
            lineContent,
            edit,
            edit.startLine
          );
          modifiedLines[startIdx] = newContent;

          this.results.set(edit.startLine, {
            applied: true,
            lineContent: newContent
          });
        } else {
          // For multi-line edits or full line replacements
          const newContent = edit.content.split("\n");
          modifiedLines.splice(startIdx, endIdx - startIdx + 1, ...newContent);

          for (let i = edit.startLine; i <= edit.endLine; i++) {
            this.results.set(i, {
              applied: true,
              lineContent:
                i <= edit.startLine + newContent.length - 1
                  ? newContent[i - edit.startLine]
                  : ""
            });
          }
        }
      } catch (error) {
        // Record the error in results
        this.results.set(edit.startLine, {
          applied: false,
          lineContent: this.lines[startIdx],
          error: error instanceof Error ? error.message : "Unknown error"
        });
        throw error; // Re-throw to handle at higher level
      }
    }

    return modifiedLines.join("\n");
  }

  createDiff(modifiedContent: string, filepath: string): string {
    return createTwoFilesPatch(
      filepath,
      filepath,
      this.originalContent,
      modifiedContent,
      "original",
      "modified"
    );
  }

  getResults(): Map<number, EditOperationResult> {
    return this.results;
  }
}

export async function editFile(
  filepath: string,
  edits: EditOperation[],
  dryRun = false
): Promise<{ diff: string; results: Map<number, EditOperationResult> }> {
  // Read file content
  const content = await fs.readFile(filepath, "utf-8");

  // Create editor instance
  const editor = new FileEditor(content);

  // Add all edits
  for (const edit of edits) {
    editor.addEdit(edit);
  }

  try {
    // Apply edits and get modified content
    const modifiedContent = editor.applyEdits();

    // Create diff
    const diff = editor.createDiff(modifiedContent, filepath);

    // Write changes if not dry run
    if (!dryRun) {
      await fs.writeFile(filepath, modifiedContent, "utf-8");
    }

    // Return both diff and results
    return {
      diff,
      results: editor.getResults()
    };
  } catch (error) {
    if (error instanceof MatchNotFoundError) {
      throw error;
    }
    throw new Error(
      `Failed to apply edits: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

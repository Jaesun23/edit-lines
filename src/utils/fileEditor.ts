// utils/fileEditor.ts
import fs from "fs/promises";
import { createTwoFilesPatch } from "diff";
import {
  EditOperation,
  EditOperationResult,
  MatchNotFoundError
} from "../types/editTypes.js";
import { normalizeLineEndings } from "./utils.js";

interface LineMetadata {
  content: string;
  indentation: string;
  originalIndex: number;
}

class FileEditor {
  private lines: LineMetadata[];
  private originalContent: string;
  private edits: EditOperation[];
  private results: Map<number, EditOperationResult>;

  constructor(content: string) {
    this.originalContent = normalizeLineEndings(content);
    this.lines = this.originalContent.split("\n").map((line, index) => ({
      content: line.trimStart(),
      indentation: line.substring(0, line.length - line.trimStart().length),
      originalIndex: index
    }));
    this.edits = [];
    this.results = new Map();
  }

  addEdit(edit: EditOperation): void {
    this.validateRange(edit);

    // Normalize edit content
    if (edit.content) {
      edit.content = normalizeLineEndings(edit.content);
    }
    if (edit.strMatch) {
      edit.strMatch = normalizeLineEndings(edit.strMatch);
    }

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
    // Create a map to track line usage and overlapping regex patterns
    const lineUsage = new Map<number, Set<EditOperation>>();

    for (const edit of this.edits) {
      for (let line = edit.startLine; line <= edit.endLine; line++) {
        if (!lineUsage.has(line)) {
          lineUsage.set(line, new Set());
        }
        const lineEdits = lineUsage.get(line)!;

        // Check for overlapping regex patterns
        if (edit.regexMatch) {
          for (const existingEdit of lineEdits) {
            if (existingEdit.regexMatch) {
              const pattern1 = new RegExp(edit.regexMatch);
              const pattern2 = new RegExp(existingEdit.regexMatch);
              const lineContent = this.lines[line - 1].content;

              const match1 = lineContent.match(pattern1);
              const match2 = lineContent.match(pattern2);

              if (match1 && match2) {
                const start1 = match1.index!;
                const end1 = start1 + match1[0].length;
                const start2 = match2.index!;
                const end2 = start2 + match2[0].length;

                if (
                  (start1 <= start2 && end1 > start2) ||
                  (start2 <= start1 && end2 > start1)
                ) {
                  throw new Error(
                    `Overlapping regex patterns on line ${line}: "${edit.regexMatch}" and "${existingEdit.regexMatch}"`
                  );
                }
              }
            }
          }
        }

        // Check for multiple non-regex edits on same line
        if (!edit.regexMatch && lineEdits.size > 0) {
          const nonRegexEdits = Array.from(lineEdits).filter(
            (e) => !e.regexMatch
          );
          if (nonRegexEdits.length > 0) {
            throw new Error(
              `Line ${line} is affected by multiple non-regex edits`
            );
          }
        }

        lineEdits.add(edit);
      }
    }
  }

  private getIndentationLevel(content: string): number {
    const match = content.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private preserveIndentation(
    newContent: string,
    originalIndentation: string
  ): string {
    const lines = newContent.split("\n");
    const baseIndentLevel = this.getIndentationLevel(lines[0]);

    return lines
      .map((line, index) => {
        const lineIndentLevel = this.getIndentationLevel(line);
        const relativeIndent = " ".repeat(
          Math.max(0, lineIndentLevel - baseIndentLevel)
        );
        return originalIndentation + relativeIndent + line.trimLeft();
      })
      .join("\n");
  }

  private applyMatchReplace(
    lineMetadata: LineMetadata,
    edit: EditOperation,
    lineNumber: number
  ): string {
    const { content, indentation } = lineMetadata;

    // If no matching criteria specified, replace the entire line
    if (!edit.strMatch && !edit.regexMatch) {
      return this.preserveIndentation(edit.content, indentation);
    }

    if (edit.strMatch) {
      // Normalize both strings for comparison
      const normalizedContent = content.trim();
      const normalizedMatch = edit.strMatch.trim();

      if (!normalizedContent.includes(normalizedMatch)) {
        // Try flexible matching with normalized whitespace
        const flexMatch = normalizedContent.replace(/\s+/g, " ");
        const flexTarget = normalizedMatch.replace(/\s+/g, " ");

        if (!flexMatch.includes(flexTarget)) {
          throw new MatchNotFoundError(lineNumber, edit.strMatch, false);
        }

        // Use the flexible match for replacement to preserve original spacing around the match
        const replacementRegex = new RegExp(flexMatch.replace(/\s+/g, "\\s+"));
        const newContent = content.replace(replacementRegex, edit.content);
        return indentation + newContent.trimStart();
      }

      // Preserve indentation when replacing
      const newContent = content.replace(
        new RegExp(edit.strMatch.trim(), "g"),
        edit.content
      );
      return indentation + newContent.trimStart();
    }

    if (edit.regexMatch) {
      try {
        const regex = new RegExp(edit.regexMatch, "g");
        if (!regex.test(content)) {
          throw new MatchNotFoundError(lineNumber, edit.regexMatch, true);
        }

        // Reset lastIndex after test
        regex.lastIndex = 0;

        // Replace while preserving indentation
        const newContent = content.replace(regex, (match, ...args) => {
          // Handle named capture groups
          if (edit.content.includes("${")) {
            const groups = args[args.length - 1] || {};
            return edit.content.replace(
              /\${(\w+)}/g,
              (_, name) => groups[name] || ""
            );
          }
          return edit.content;
        });

        return indentation + newContent.trimLeft();
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

    return indentation + content; // Fallback, should never reach here
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
          const lineMetadata = modifiedLines[startIdx];
          const newContent = this.applyMatchReplace(
            lineMetadata,
            edit,
            edit.startLine
          );

          modifiedLines[startIdx] = {
            content: newContent.trimLeft(),
            indentation: newContent.substring(
              0,
              newContent.length - newContent.trimLeft().length
            ),
            originalIndex: lineMetadata.originalIndex
          };

          this.results.set(edit.startLine, {
            applied: true,
            lineContent: newContent
          });
        } else {
          // For multi-line edits or full line replacements
          const firstLineIndentation = modifiedLines[startIdx].indentation;
          const newContent = this.preserveIndentation(
            edit.content,
            firstLineIndentation
          );
          const newLines = newContent.split("\n").map((line, idx) => ({
            content: line.trimLeft(),
            indentation: line.substring(
              0,
              line.length - line.trimLeft().length
            ),
            originalIndex: modifiedLines[startIdx].originalIndex + idx
          }));

          modifiedLines.splice(startIdx, endIdx - startIdx + 1, ...newLines);

          for (let i = edit.startLine; i <= edit.endLine; i++) {
            this.results.set(i, {
              applied: true,
              lineContent:
                i <= edit.startLine + newLines.length - 1
                  ? newLines[i - edit.startLine].indentation +
                    newLines[i - edit.startLine].content
                  : ""
            });
          }
        }
      } catch (error) {
        // Record the error in results
        this.results.set(edit.startLine, {
          applied: false,
          lineContent:
            this.lines[startIdx].indentation + this.lines[startIdx].content,
          error: error instanceof Error ? error.message : "Unknown error"
        });
        throw error; // Re-throw to handle at higher level
      }
    }

    return modifiedLines
      .map((line) => line.indentation + line.content)
      .join("\n");
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

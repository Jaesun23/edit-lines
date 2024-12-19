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
      edit.content = this.normalizeEditContent(edit.content);
    }
    if (edit.strMatch) {
      edit.strMatch = normalizeLineEndings(edit.strMatch);
    }
    if (edit.regexMatch) {
      this.validateRegexPattern(edit.regexMatch);
    }

    this.edits.push(edit);
  }

  private normalizeEditContent(content: string): string {
    return normalizeLineEndings(content);
  }

  private validateRegexPattern(pattern: string): void {
    try {
      new RegExp(pattern);
    } catch (error) {
      throw new Error(
        `Invalid regex pattern "${pattern}": ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
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
              const pattern1 = new RegExp(edit.regexMatch, "gm");
              const pattern2 = new RegExp(existingEdit.regexMatch, "gm");
              const lineContent = this.getFullLine(line);

              const overlaps = this.checkRegexOverlap(
                lineContent,
                pattern1,
                pattern2
              );
              if (overlaps) {
                throw new Error(
                  `Overlapping regex patterns on line ${line}: "${edit.regexMatch}" and "${existingEdit.regexMatch}"`
                );
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

  private checkRegexOverlap(
    text: string,
    pattern1: RegExp,
    pattern2: RegExp
  ): boolean {
    const matches1 = Array.from(text.matchAll(pattern1));
    const matches2 = Array.from(text.matchAll(pattern2));

    for (const match1 of matches1) {
      const start1 = match1.index!;
      const end1 = start1 + match1[0].length;

      for (const match2 of matches2) {
        const start2 = match2.index!;
        const end2 = start2 + match2[0].length;

        if ((start1 <= start2 && end1 > start2) || (start2 <= start1 && end2 > start1)) {
          return true;
        }
      }
    }

    return false;
  }

  private getFullLine(lineNumber: number): string {
    const lineMetadata = this.lines[lineNumber - 1];
    return lineMetadata.indentation + lineMetadata.content;
  }

  private getIndentationLevel(content: string): number {
    const match = content.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private preserveIndentation(
    newContent: string,
    originalIndentation: string,
    baseIndentation: string = ""
  ): string {
    const lines = newContent.split("\n");
    const baseIndentLevel = this.getIndentationLevel(baseIndentation || lines[0]);

    return lines
      .map((line) => {
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
    const fullLine = indentation + content;

    // If no matching criteria specified, replace the entire line
    if (!edit.strMatch && !edit.regexMatch) {
      return this.preserveIndentation(edit.content, indentation);
    }

    if (edit.strMatch) {
      // For string matches, first try exact match with normalized line endings
      const normalizedLine = normalizeLineEndings(fullLine);
      const normalizedMatch = normalizeLineEndings(edit.strMatch);

      if (normalizedLine.includes(normalizedMatch)) {
        // For exact string matches, replace only the matched portion
        // while preserving surrounding content
        const startIndex = normalizedLine.indexOf(normalizedMatch);
        const prefix = fullLine.substring(0, startIndex);
        const suffix = fullLine.substring(startIndex + normalizedMatch.length);
        
        // If replacing just a portion (like "blue" with "green"), keep the line structure
        if (!edit.content.includes('\n') && !normalizedMatch.includes('\n')) {
          return prefix + edit.content + suffix;
        }
        
        // For multi-line replacements, handle indentation
        return this.preserveIndentation(edit.content, indentation);
      }

      // If exact match fails, try flexible whitespace matching
      const flexMatch = normalizedLine.replace(/\s+/g, " ").trim();
      const flexTarget = normalizedMatch.replace(/\s+/g, " ").trim();

      if (!flexMatch.includes(flexTarget)) {
        throw new MatchNotFoundError(lineNumber, edit.strMatch, false);
      }

      // Create a regex that matches the original string pattern with flexible whitespace
      const escapedPattern = flexTarget
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
        .replace(/\s+/g, "\\s+"); // Replace spaces with flexible whitespace pattern

      const replacementRegex = new RegExp(escapedPattern);
      
      // For flexible matches, preserve the original indentation structure
      return fullLine.replace(replacementRegex, (match) => {
        // If the replacement doesn't contain newlines, preserve surrounding content
        if (!edit.content.includes('\n')) {
          return edit.content;
        }
        return this.preserveIndentation(edit.content, indentation);
      });
    }

    if (edit.regexMatch) {
      try {
        const regex = new RegExp(edit.regexMatch, "g");
        if (!regex.test(fullLine)) {
          throw new MatchNotFoundError(lineNumber, edit.regexMatch, true);
        }

        // Reset lastIndex after test
        regex.lastIndex = 0;

        // Replace while preserving indentation
        return fullLine.replace(regex, (match, ...args) => {
          // Handle named capture groups
          if (edit.content.includes("${")) {
            const groups = args[args.length - 1] || {};
            let replaced = edit.content;
            
            // Replace all capture group references
            replaced = replaced.replace(
              /\${(\w+)}/g,
              (_, name) => groups[name] || ""
            );

            // For single-line replacements, maintain the line structure
            if (!replaced.includes('\n')) {
              return replaced;
            }

            return this.preserveIndentation(replaced, indentation);
          }

          // For single-line replacements without capture groups
          if (!edit.content.includes('\n')) {
            return edit.content;
          }

          return this.preserveIndentation(edit.content, indentation);
        });
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

    return fullLine; // Fallback, should never reach here
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

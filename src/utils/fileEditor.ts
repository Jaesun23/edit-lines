// utils/fileEditor.ts
import fs from "fs/promises";
import { createTwoFilesPatch } from "diff";
import {
  EditActionType,
  EditOperation,
  EditOperationResult,
  MatchNotFoundError
} from "../types/editTypes.js";
import { normalizeLineEndings } from "./utils.js";

interface LineMetadata {
  content: string;
  indentation: string;
  originalIndex: number;
  // isDeleted 플래그 등을 추가하여 delete_line 처리를 용이하게 할 수 있습니다.
  isDeleted?: boolean;
}

class FileEditor {
  private lines: LineMetadata[];
  private originalContent: string;
  // 수정: edits 타입은 그대로 유지하되, addEdit에서 action을 고려합니다.
  private editsToApply: EditOperation[];
  private results: Map<number, EditOperationResult>; // 결과는 originalIndex 기준

  constructor(content: string) {
    this.originalContent = normalizeLineEndings(content);
    this.lines = this.originalContent.split("\n").map((line, index) => ({
      content: line.trimStart(),
      indentation: line.substring(0, line.length - line.trimStart().length),
      originalIndex: index
    }));
    this.editsToApply = [];
    this.results = new Map();
  }

  // addEdit은 EditOperation을 받아서 내부적으로 처리 준비
  addEdit(edit: EditOperation): void {
    // 레거시 필드 처리: startLine, endLine, content 등
    if (this.hasLegacyFields(edit)) {
      const normalizedEdit = this.normalizeLegacyEdit(edit);
      if (normalizedEdit) {
        this.editsToApply.push(normalizedEdit);
        return;
      }
    }

    // 필수 필드 확인
    const lineNumber = edit.lineNumber ?? 0; // 기본값 제공
    if (!edit.action) {
      this.results.set(lineNumber, {
        lineNumber: lineNumber,
        status: "FAILED",
        message: "Action is required but not provided."
      });
      return;
    }

    // edit.lineNumber는 1부터 시작, 배열 인덱스는 0부터 시작
    if (lineNumber <= 0 || lineNumber > this.lines.length) {
      // insert_after는 마지막 줄 다음에 추가하는 것이 가능
      if (edit.action === "insert_after" && lineNumber === this.lines.length) {
        // 마지막 줄 다음 추가는 허용 (아래 정상 처리)
      }
      // insert_before는 첫 번째 줄 앞에 추가하는 것이 가능 (lineNumber=1)
      else if (edit.action === "insert_before" && lineNumber === 1) {
        // 첫 번째 줄 앞 추가는 허용 (아래 정상 처리)
      } else {
        this.results.set(lineNumber, {
          lineNumber: lineNumber,
          status: "FAILED",
          message: `Line number ${lineNumber} is out of range (1-${this.lines.length}).`
        });
        return; // 유효하지 않은 줄 번호면 더 이상 진행하지 않음
      }
    }

    if (edit.text) {
      // 존재하지 않는 라인의 indentation은 빈 문자열로 처리
      const indentation =
        lineNumber <= this.lines.length
          ? this.lines[lineNumber - 1]?.indentation || ""
          : "";
      edit.text = this.normalizeEditContent(edit.text, indentation);
    }

    // 기존 strMatch, regexMatch 유효성 검사는 유지
    if (edit.strMatch) {
      edit.strMatch = normalizeLineEndings(edit.strMatch);
    }
    if (edit.regexMatch) {
      this.validateRegexPattern(edit.regexMatch);
    }

    this.editsToApply.push(edit);
  }

  // 레거시 필드 확인
  private hasLegacyFields(edit: EditOperation): boolean {
    return "startLine" in edit || "endLine" in edit || "content" in edit;
  }

  // 레거시 EditOperation 처리
  private normalizeLegacyEdit(edit: EditOperation): EditOperation | null {
    // 레거시 필드 매핑
    if ("startLine" in edit) {
      const startLine = edit.startLine;

      if (!startLine) {
        const lineNumber = edit.lineNumber ?? 0;
        this.results.set(lineNumber, {
          lineNumber: lineNumber,
          status: "FAILED",
          message: "Invalid startLine."
        });
        return null;
      }

      const endLine = edit.endLine || startLine;
      const content = edit.content || "";

      // 레거시 필드 매핑
      if (startLine === endLine) {
        // 단일 줄 교체
        return {
          lineNumber: startLine,
          action: "replace_content_at_line",
          text: content,
          strMatch: edit.strMatch,
          regexMatch: edit.regexMatch
        };
      } else if (content) {
        // 범위 교체인 경우 - 범위의 첫 줄을 교체하고 나머지 줄은 삭제
        // 이후 더 개선된 매핑이 필요할 수 있음

        // 첫 번째 줄을 교체하는 작업에 추가
        const firstLineEdit: EditOperation = {
          lineNumber: startLine,
          action: "replace_content_at_line",
          text: content
        };
        this.editsToApply.push(firstLineEdit);

        // 나머지 줄은 삭제
        for (let i = startLine + 1; i <= endLine; i++) {
          const deleteEdit: EditOperation = {
            lineNumber: i,
            action: "delete_line"
          };
          this.editsToApply.push(deleteEdit);
        }

        // 이미 처리함
        return null;
      }
    }

    // 기타 레거시 필드 매핑
    // (필요한 경우 추가 매핑 로직)

    // 매핑할 수 없는 경우
    const lineNumber = edit.lineNumber ?? 0;
    this.results.set(lineNumber, {
      lineNumber: lineNumber,
      status: "FAILED",
      message: "Invalid legacy edit format. Cannot convert to new format."
    });
    return null;
  }

  private normalizeEditContent(
    content: string,
    baseIndentation: string
  ): string {
    // 여러 줄의 텍스트가 주어질 경우, 각 줄에 baseIndentation을 적용하거나
    // 첫 줄의 상대적 들여쓰기를 유지하도록 처리할 수 있습니다.
    if (!content) return "";

    const lines = content.split("\n");
    if (lines.length === 1) {
      return normalizeLineEndings(content);
    }

    // 여러 줄인 경우, 첫 줄을 제외한 모든 줄에 baseIndentation 적용
    return normalizeLineEndings(
      lines[0] +
        "\n" +
        lines
          .slice(1)
          .map((line) => baseIndentation + line)
          .join("\n")
    );
  }

  private validateRegexPattern(pattern: string): void {
    try {
      new RegExp(pattern);
    } catch (e: any) {
      throw new Error(`Invalid regex pattern: ${pattern}. ${e.message}`);
    }
  }

  applyEdits(): string {
    const modifiedLinesStruct: LineMetadata[] = JSON.parse(
      JSON.stringify(this.lines)
    ); // 깊은 복사
    let linesOffset = 0; // 줄 추가/삭제로 인한 오프셋

    // 작업 순서가 중요할 수 있으므로, lineNumber 기준으로 정렬 (특히 여러 edits가 한 줄에 영향을 줄 때)
    // 여기서는 단순화를 위해 입력 순서대로 처리. 복잡한 경우 정렬 및 병합 로직 필요.

    for (const edit of this.editsToApply) {
      // 필수 필드 확인 및 기본값 설정
      const targetOriginalIndex = (edit.lineNumber ?? 1) - 1; // 0-based index
      const action =
        edit.action ?? ("replace_content_at_line" as EditActionType);

      // 조건부 편집 (strMatch, regexMatch) 로직은 action과 통합되어야 함.
      // 여기서는 action 기반으로만 처리하는 것을 우선.
      // 만약 strMatch 등이 있다면, 해당 라인이 match하는지 먼저 확인해야 함.
      // if (edit.strMatch && modifiedLinesStruct[targetOriginalIndex + linesOffset].content !== edit.strMatch) continue;
      // if (edit.regexMatch && !new RegExp(edit.regexMatch).test(modifiedLinesStruct[targetOriginalIndex + linesOffset].content)) continue;

      const currentLineData = modifiedLinesStruct.find(
        (l) => l.originalIndex === targetOriginalIndex && !l.isDeleted
      );
      const currentIndexInModified = currentLineData
        ? modifiedLinesStruct.indexOf(currentLineData)
        : -1;

      switch (action) {
        case "insert_before":
          if (edit.text === undefined) {
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "FAILED",
              message: "Text is required for insert_before."
            });
            continue;
          }
          // 대상 줄이 삭제된 경우, 그 위치에 삽입
          let insertAtIndex: number;

          if ((edit.lineNumber ?? 0) === 1) {
            // 맨 앞에 삽입하는 경우
            insertAtIndex = 0;
          } else if (currentIndexInModified !== -1) {
            // 대상 줄이 존재하는 경우, 그 앞에 삽입
            insertAtIndex = currentIndexInModified;
          } else {
            // 대상 줄이 삭제된 경우 또는 존재하지 않는 경우
            // 적절한 위치를 찾아야 함 (원래 있었어야 할 위치의 앞)
            const nearestLine = modifiedLinesStruct.find(
              (l) => l.originalIndex > targetOriginalIndex && !l.isDeleted
            );
            if (nearestLine) {
              insertAtIndex = modifiedLinesStruct.indexOf(nearestLine);
            } else {
              // 더 큰 originalIndex가 없으면 맨 뒤에 추가
              insertAtIndex = modifiedLinesStruct.length;
            }
          }

          modifiedLinesStruct.splice(insertAtIndex, 0, {
            content: edit.text,
            indentation:
              currentLineData?.indentation ||
              modifiedLinesStruct[insertAtIndex > 0 ? insertAtIndex - 1 : 0]
                ?.indentation ||
              "", // 주변 줄의 들여쓰기 사용
            originalIndex: -1 // 새로 삽입된 줄 표시 (diff 생성시 originalIndex를 신경써야 함)
          });
          linesOffset++;
          this.results.set(edit.lineNumber ?? 0, {
            lineNumber: edit.lineNumber ?? 0,
            status: "APPLIED",
            message: `Inserted text before line.`
          });
          break;

        case "insert_after":
          if (edit.text === undefined) {
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "FAILED",
              message: "Text is required for insert_after."
            });
            continue;
          }

          let afterIndex: number;

          if ((edit.lineNumber ?? 0) > this.lines.length) {
            // 파일의 끝 이후에 삽입하는 경우 (라인이 없는 경우)
            afterIndex = modifiedLinesStruct.length;
          } else if (currentIndexInModified !== -1) {
            // 대상 줄이 존재하는 경우, 그 뒤에 삽입
            afterIndex = currentIndexInModified + 1;
          } else {
            // 대상 줄이 삭제된 경우
            // 적절한 위치를 찾아야 함 (원래 있었어야 할 위치의 뒤)
            const nearestLine = modifiedLinesStruct.find(
              (l) => l.originalIndex > targetOriginalIndex && !l.isDeleted
            );
            if (nearestLine) {
              afterIndex = modifiedLinesStruct.indexOf(nearestLine);
            } else {
              // 더 큰 originalIndex가 없으면 맨 뒤에 추가
              afterIndex = modifiedLinesStruct.length;
            }
          }

          modifiedLinesStruct.splice(afterIndex, 0, {
            content: edit.text,
            indentation:
              currentLineData?.indentation ||
              (afterIndex > 0
                ? modifiedLinesStruct[afterIndex - 1]?.indentation || ""
                : ""), // 주변 줄의 들여쓰기 사용
            originalIndex: -1
          });
          linesOffset++;
          this.results.set(edit.lineNumber ?? 0, {
            lineNumber: edit.lineNumber ?? 0,
            status: "APPLIED",
            message: `Inserted text after line.`
          });
          break;

        case "delete_line":
          if (currentIndexInModified !== -1) {
            modifiedLinesStruct[currentIndexInModified].isDeleted = true; // 삭제 표시
            // linesOffset--; // 실제 배열에서 제거할 때 오프셋 조정
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "APPLIED",
              message: `Line deleted.`
            });
          } else {
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "SKIPPED",
              message: `Line already deleted or not found.`
            });
          }
          break;

        case "replace_content_at_line":
          if (edit.text === undefined) {
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "FAILED",
              message: "Text is required for replace_content_at_line."
            });
            continue;
          }
          if (currentIndexInModified !== -1) {
            // 기존 FileEditor의 복잡한 매칭 및 교체 로직을 여기에 적용하거나,
            // 단순 줄 전체 교체로 가정합니다.
            // 여기서는 줄의 content 부분만 교체한다고 가정합니다.
            modifiedLinesStruct[currentIndexInModified].content = edit.text;
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "APPLIED",
              message: `Line content replaced.`
            });
          } else {
            this.results.set(edit.lineNumber ?? 0, {
              lineNumber: edit.lineNumber ?? 0,
              status: "SKIPPED",
              message: `Line for replacement not found or already deleted.`
            });
          }
          break;

        default:
          // 기존 복잡한 EditOperation 처리 로직 (strMatch, regexMatch, from, to 등 기반)
          // 이 부분은 기존 FileEditor의 applySpecificEdit과 유사하게 구현되어야 합니다.
          // 지금은 에러 처리 또는 무시.
          this.results.set(edit.lineNumber ?? 0, {
            lineNumber: edit.lineNumber ?? 0,
            status: "FAILED",
            message: `Unsupported action: ${edit.action}`
          });
          break;
      }
    }

    // isDeleted 플래그가 있는 항목들을 최종적으로 배열에서 제거
    const finalLines = modifiedLinesStruct.filter((line) => !line.isDeleted);

    return finalLines.map((line) => line.indentation + line.content).join("\n");
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

  // validateRange, applySpecificEdit 등 기존 private 메소드들은
  // 새로운 action 기반 로직에 맞게 수정되거나 통합되어야 합니다.
  // 지금은 생략합니다.
}

export async function editFile(
  filepath: string,
  edits: EditOperation[],
  dryRun = false
): Promise<{ diff: string; results: Map<number, EditOperationResult> }> {
  const content = await fs.readFile(filepath, "utf-8");
  const editor = new FileEditor(content);

  for (const edit of edits) {
    editor.addEdit(edit);
  }

  try {
    const modifiedContent = editor.applyEdits();
    const diff = editor.createDiff(modifiedContent, filepath);

    if (!dryRun) {
      await fs.writeFile(filepath, modifiedContent, "utf-8");
    }
    return {
      diff,
      results: editor.getResults()
    };
  } catch (error) {
    // MatchNotFoundError 외 다른 에러도 처리 필요
    if (error instanceof MatchNotFoundError) {
      // MatchNotFoundError는 특정 action (예: 조건부 교체)에서만 발생할 수 있음
      // editor.getResults()를 통해 어떤 edit이 실패했는지 확인 가능
    }
    console.error("Error during file editing:", error);
    throw error;
  }
}

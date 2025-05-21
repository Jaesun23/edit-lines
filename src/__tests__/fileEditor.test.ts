// MCP/edit-lines/src/__tests__/fileEditor.test.ts
import fs from "fs/promises";
// import { fileURLToPath } from 'url'; // ESM 환경에서 __dirname 대체
import { EditOperation } from "../types/editTypes.js"; // EditOperationResult 추가
import { editFile } from "../utils/fileEditor.js";
import { getFixturePath, resetFixtures } from "./utils.js"; // getFixturePath 같은 헬퍼 함수가 있다고 가정

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const testFilePath = path.join(__dirname, 'fixtures', 'sample.txt');
const testFilePath = getFixturePath("sample.txt"); // 헬퍼 함수 사용
const initialContent = `Line 1
Line 2
Line 3
Line 4
Line 5`;

describe("FileEditor - Action Based Edits", () => {
  beforeEach(async () => {
    // 각 테스트 전에 fixture 파일 초기화
    await fs.writeFile(testFilePath, initialContent, "utf-8");
  });

  afterAll(async () => {
    // 모든 테스트 후 fixture 파일 정리 (선택적)
    await resetFixtures();
  });

  // ... 기존 테스트들 ...

  describe("insert_before action", () => {
    it("should insert text before a specified line", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 3, action: "insert_before", text: "New line before 3" }
      ];
      const { diff, results } = await editFile(testFilePath, edits, true); // dryRun = true

      expect(results.get(3)?.status).toBe("APPLIED");
      expect(diff).toContain("+New line before 3");
      expect(diff).toContain(" Line 3");

      const modifiedContent = (await fs.readFile(testFilePath, "utf-8")).split(
        "\n"
      );
      // dryRun=true이므로 실제 파일 내용은 변경되지 않아야 함 (또는 applyEdits 직접 테스트 시 변경 확인)
      // 여기서는 editFile(..., dryRun=true)의 diff를 주로 검증
      // 만약 editFile(..., dryRun=false)를 테스트한다면 아래와 같이 파일 내용 검증
      // expect(modifiedContent[2]).toBe('New line before 3');
      // expect(modifiedContent[3]).toBe('Line 3');
    });

    it("should insert text at the beginning of the file", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 1, action: "insert_before", text: "File Header" }
      ];
      const { diff, results } = await editFile(testFilePath, edits, true);
      expect(results.get(1)?.status).toBe("APPLIED");
      expect(diff).toContain("+File Header");
      expect(diff).toContain(" Line 1");
    });
  });

  describe("insert_after action", () => {
    it("should insert text after a specified line", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 2, action: "insert_after", text: "New line after 2" }
      ];
      const { diff, results } = await editFile(testFilePath, edits, true);
      expect(results.get(2)?.status).toBe("APPLIED");
      expect(diff).toContain(" Line 2");
      expect(diff).toContain("+New line after 2");
    });

    it("should insert text at the end of the file", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 5, action: "insert_after", text: "File Footer" }
      ];
      const { diff, results } = await editFile(testFilePath, edits, true);
      expect(results.get(5)?.status).toBe("APPLIED");
      // 줄 끝에는 개행 여부에 따라 다른 출력이 생길 수 있으므로, 더 유연한 검증으로 변경
      expect(diff).toContain("-Line 5");
      expect(diff).toContain("+Line 5");
      expect(diff).toContain("+File Footer");
    });
  });

  describe("delete_line action", () => {
    it("should delete a specified line", async () => {
      const edits: EditOperation[] = [{ lineNumber: 3, action: "delete_line" }];
      const { diff, results } = await editFile(testFilePath, edits, true);
      expect(results.get(3)?.status).toBe("APPLIED");
      expect(diff).toContain("-Line 3");
    });

    it("should handle deletion of multiple lines", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 2, action: "delete_line" },
        { lineNumber: 4, action: "delete_line" } // 원본 기준 라인 번호
      ];
      const { diff, results } = await editFile(testFilePath, edits, true);
      // FileEditor 내부적으로 edits를 순차 처리하므로, 두 번째 edit의 lineNumber는
      // 첫 번째 삭제 후의 상태가 아닌 원본 기준이어야 함. FileEditor가 이를 처리.
      expect(results.get(2)?.status).toBe("APPLIED");
      expect(results.get(4)?.status).toBe("APPLIED");
      expect(diff).toContain("-Line 2");
      expect(diff).toContain("-Line 4");
    });
  });

  describe("replace_content_at_line action", () => {
    it("should replace content of a specified line", async () => {
      const edits: EditOperation[] = [
        {
          lineNumber: 2,
          action: "replace_content_at_line",
          text: "Replaced Line 2 Content"
        }
      ];
      const { diff, results } = await editFile(testFilePath, edits, true);
      expect(results.get(2)?.status).toBe("APPLIED");
      expect(diff).toContain("-Line 2");
      expect(diff).toContain("+Replaced Line 2 Content");
    });

    // 만약 기존 EditOperation 방식 (startLine, endLine, content)을 'replace_content_at_line'으로 매핑했거나,
    // 혹은 여전히 지원한다면 그에 대한 테스트도 필요합니다.
    // 아래는 기존 로직이 `action: 'replace_content_at_line'` 및 `text` 사용으로 변경되었다고 가정한 예시입니다.
    // 기존 `startLine`, `endLine`을 사용한 범위 교체는 `FileEditor`의 로직 복잡도에 따라
    // 별도의 `action` (예: `replace_range`)으로 정의하거나, `replace_content_at_line`이
    // `text`에 여러 줄을 포함할 수 있도록 구현해야 합니다.
    // 현재 `fileEditor.ts` 수정안은 `text`를 단일 라인으로 가정하고 있습니다.
  });

  describe("Error Handling and Edge Cases", () => {
    it("should fail if line number is out of range for insert_before (except first line)", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 0, action: "insert_before", text: "Invalid" }
      ];
      const { results } = await editFile(testFilePath, edits, true);
      expect(results.get(0)?.status).toBe("FAILED");
      expect(results.get(0)?.message).toContain("out of range");
    });

    it("should fail if line number is out of range for delete_line", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 100, action: "delete_line" }
      ];
      const { results } = await editFile(testFilePath, edits, true);
      expect(results.get(100)?.status).toBe("FAILED");
      expect(results.get(100)?.message).toContain("out of range");
    });

    it("should require text for insert/replace actions", async () => {
      let edits: EditOperation[] = [{ lineNumber: 1, action: "insert_before" }];
      let { results } = await editFile(testFilePath, edits, true);
      expect(results.get(1)?.status).toBe("FAILED");
      expect(results.get(1)?.message).toContain("Text is required");

      edits = [{ lineNumber: 1, action: "replace_content_at_line" }];
      ({ results } = await editFile(testFilePath, edits, true));
      expect(results.get(1)?.status).toBe("FAILED");
      expect(results.get(1)?.message).toContain("Text is required");
    });
  });

  // dryRun 테스트는 이미 있는 것을 활용하거나, 위 테스트들에 dryRun=false 시나리오 추가
  describe("Dry Run and Actual Write", () => {
    afterEach(async () => {
      await resetFixtures(); // 각 테스트 후 파일 상태 복원
    });

    it("should not modify file in dry run mode for new actions", async () => {
      const edits: EditOperation[] = [
        { lineNumber: 1, action: "insert_after", text: "Dry Run Test" }
      ];
      await editFile(testFilePath, edits, true); // dryRun = true
      const fileContentAfterDryRun = await fs.readFile(testFilePath, "utf-8");
      expect(fileContentAfterDryRun).toBe(initialContent);
    });

    it("should modify file when dry run is false for new actions", async () => {
      const insertText = "Modified by test!";
      const edits: EditOperation[] = [
        { lineNumber: 1, action: "insert_after", text: insertText }
      ];
      await editFile(testFilePath, edits, false); // dryRun = false
      const fileContentAfterWrite = await fs.readFile(testFilePath, "utf-8");
      expect(fileContentAfterWrite).toContain(insertText);
      expect(fileContentAfterWrite).not.toBe(initialContent);
    });
  });
});

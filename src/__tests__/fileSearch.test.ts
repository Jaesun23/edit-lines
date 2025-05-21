// MCP/edit-lines/src/__tests__/fileSearch.test.ts
import fs from "fs/promises";
import {
  SearchError,
  SearchErrorCode,
  SearchFileArgs
} from "../types/searchTypes.js";
// SearchResult 등 추가
import { searchAndReplaceFile } from "../utils/fileSearch.js"; // searchAndReplaceFile로 변경
import { getFixturePath } from "./utils.js";

// 테스트에 사용할 내용 정의 - fixtures/sample.txt에 기록됨
const testFilePath = getFixturePath("test-search.txt");
const initialContent = `Alpha Bravo Charlie
Delta Echo Foxtrot
Golf Hotel India
Alpha Bravo Charlie again
alpha bravo charlie lowercase`;

describe("searchAndReplaceFile", () => {
  beforeEach(async () => {
    // 각 테스트 전에 테스트 파일 초기화
    await fs.writeFile(testFilePath, initialContent, "utf-8");
  });

  afterAll(async () => {
    // 테스트 후 파일 정리
    await fs.unlink(testFilePath).catch(() => {});
  });

  describe("Search Functionality", () => {
    it("should find text matches (case-insensitive by default)", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "Alpha Bravo"
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.matches.length).toBe(3); // "Alpha Bravo", "Alpha Bravo", "alpha bravo"
      expect(result.replacementsCount).toBeUndefined();
    });

    it("should find text matches (case-sensitive)", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "Alpha Bravo",
        caseSensitive: true
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.matches.length).toBe(2); // "Alpha Bravo", "Alpha Bravo"
    });

    it("should find regex matches", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "^Golf.*India$",
        type: "regex"
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].content).toBe("Golf Hotel India");
    });

    it("should return empty matches if pattern not found", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "XYZ_NOT_FOUND"
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.matches.length).toBe(0);
    });
  });

  describe("Replace Functionality", () => {
    it("should replace text and return diff in dryRun mode", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "Bravo",
        replaceText: "Sierra",
        dryRun: true,
        caseSensitive: true
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.replacementsCount).toBe(1); // 첫 번째 줄의 Bravo만 교체
      expect(result.diff).toBeDefined();
      expect(result.diff).toContain("-Alpha Bravo Charlie");
      expect(result.diff).toContain("+Alpha Sierra Charlie");
      const fileContent = await fs.readFile(testFilePath, "utf-8");
      expect(fileContent).toBe(initialContent);
    });

    it("should replace text and modify file when dryRun is false", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "Echo",
        replaceText: "Uniform",
        dryRun: false
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.replacementsCount).toBe(1);
      expect(result.diff).toBeDefined();
      const fileContent = await fs.readFile(testFilePath, "utf-8");
      expect(fileContent).toContain("Delta Uniform Foxtrot");
      expect(fileContent).not.toContain("Delta Echo Foxtrot");
    });

    it("should replace using regex groups", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "(Alpha) (Bravo)",
        replaceText: "$2 $1",
        type: "regex",
        dryRun: false,
        caseSensitive: true,
        replaceAllInFile: true
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.replacementsCount).toBe(2);
      const fileContent = await fs.readFile(testFilePath, "utf-8");
      expect(fileContent).toContain("Bravo Alpha Charlie");
      expect(fileContent).toContain("Bravo Alpha Charlie again");
      expect(fileContent).toContain("alpha bravo charlie lowercase");
    });

    it("should handle replaceAllInFile false (replace only first match in file)", async () => {
      const args = {
        filepath: testFilePath,
        pattern: "Charlie",
        replaceText: "Zulu",
        replaceAllInFile: false,
        dryRun: false,
        caseSensitive: false
      } as SearchFileArgs;
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.replacementsCount).toBe(1);
      const fileContent = await fs.readFile(testFilePath, "utf-8");
      expect(fileContent.match(/Zulu/g)?.length || 0).toBe(1);
      expect(fileContent).toContain("Alpha Bravo Zulu");
      expect(fileContent).toContain("Alpha Bravo Charlie again");
    });

    // TODO: replaceAllInLine 테스트는 searchAndReplaceFile의 해당 로직 구현 후 추가
    // it('should handle replaceAllInLine correctly', async () => { ... });
  });

  describe("Error Handling for searchAndReplaceFile", () => {
    it("should throw SearchError if file is too large", async () => {
      // MAX_FILE_SIZE를 일시적으로 줄이거나 큰 파일을 생성해야 테스트 가능
      // 여기서는 개념만 설명
      const largeFilePath = getFixturePath("large_file.txt"); // 테스트용 대용량 파일
      await fs.writeFile(largeFilePath, "a".repeat(20 * 1024 * 1024)); // 20MB 파일 생성

      const args = { filepath: largeFilePath, pattern: "a" } as SearchFileArgs;
      // MAX_FILE_SIZE는 searchAndReplaceFile 내부에 정의되어 있으므로,
      // 해당 값을 테스트에서 접근 가능하게 만들거나, mock fs.stat으로 파일 크기를 조작해야 함.
      // 여기서는 searchAndReplaceFile이 SearchError를 던진다고 가정.
      await expect(searchAndReplaceFile(largeFilePath, args)).rejects.toThrow(
        SearchError
      );
      await expect(
        searchAndReplaceFile(largeFilePath, args)
      ).rejects.toHaveProperty("code", SearchErrorCode.FILE_TOO_LARGE);

      await fs.unlink(largeFilePath); // 테스트 후 파일 삭제
    });

    it("should handle file not found", async () => {
      const args = {
        filepath: "non_existent_file.txt",
        pattern: "a"
      } as SearchFileArgs;
      await expect(searchAndReplaceFile(args.filepath, args)).rejects.toThrow(
        /ENOENT: no such file or directory/
      );
    });
  });

  describe("Multiline Regex Search and Corrected Replacements", () => {
    const multilineContent = `First line
Golf Equipment and Apparel
Another Golf line
This is India
Not Golf related
Golf and India a long way apart`;

    beforeEach(async () => {
      await fs.writeFile(testFilePath, multilineContent, "utf-8");
    });

    it('should find lines starting with "Golf" and ending with "Apparel" using ^...$ regex with multiline', async () => {
      const args = {
        filepath: testFilePath,
        pattern: "^Golf.*Apparel$",
        type: "regex" as const,
        caseSensitive: false,
        contextLines: 0,
        replaceAllInLine: false,
        replaceAllInFile: true,
        dryRun: false
      };
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].match).toBe("Golf Equipment and Apparel");
    });

    it('should find all lines starting with "Golf" using ^Golf regex with multiline', async () => {
      const args = {
        filepath: testFilePath,
        pattern: "^Golf",
        type: "regex" as const,
        caseSensitive: false,
        contextLines: 0,
        replaceAllInLine: false,
        replaceAllInFile: true,
        dryRun: false
      };
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.matches.length).toBe(2); // "Golf Equipment..." and "Golf and India..."
      expect(result.matches.map((m) => m.match)).toContain(
        "Golf Equipment and Apparel"
      );
      expect(result.matches.map((m) => m.match)).toContain(
        "Golf and India a long way apart"
      );
    });

    it('should replace all case-insensitive matches of "golf" across multiple lines', async () => {
      const initialMixedCaseContent = `Golf is great.
golf is fun.
GOLF is challenging.
End of golf.`;
      await fs.writeFile(testFilePath, initialMixedCaseContent, "utf-8");

      const args = {
        filepath: testFilePath,
        pattern: "golf",
        replaceText: "SPORT",
        caseSensitive: false,
        type: "text" as const,
        dryRun: false,
        contextLines: 0,
        replaceAllInLine: false,
        replaceAllInFile: true
      };
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.replacementsCount).toBe(4); // 모든 golf, Golf, GOLF가 SPORT로 변경
      const content = await fs.readFile(testFilePath, "utf-8");
      expect(content).toBe(`SPORT is great.
SPORT is fun.
SPORT is challenging.
End of SPORT.`);
    });

    it("should replace pattern on all relevant lines, not just the first line of match", async () => {
      const contentWithPatternOnMultipleLines = `target pattern here
some other line
target pattern again
and another target pattern
last line`;
      await fs.writeFile(
        testFilePath,
        contentWithPatternOnMultipleLines,
        "utf-8"
      );
      const args = {
        filepath: testFilePath,
        pattern: "target pattern",
        replaceText: "REPLACED",
        type: "text" as const,
        caseSensitive: false,
        replaceAllInFile: true,
        dryRun: false,
        contextLines: 0,
        replaceAllInLine: false
      };
      const result = await searchAndReplaceFile(testFilePath, args);
      expect(result.replacementsCount).toBe(3);
      const newContent = await fs.readFile(testFilePath, "utf-8");
      expect(newContent).toBe(`REPLACED here
some other line
REPLACED again
and another REPLACED
last line`);
    });
  });
});

// utils/fileSearch.ts
import fs from "fs/promises";
import { performance } from "perf_hooks";
import { createTwoFilesPatch } from "diff"; // diff 라이브러리

import {
  SearchError,
  SearchErrorCode,
  SearchFileArgs,
  SearchMatch,
  SearchResult
} from "../types/searchTypes.js";
import { normalizeLineEndings } from "./utils.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const EXECUTION_TIMEOUT = 5000; // 5 seconds

function getPositionInfo(
  text: string,
  position: number
): { line: number; column: number } {
  const lines = text.slice(0, position).split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

function getContext(
  lines: string[],
  matchLineIdx: number,
  contextLines: number
): string {
  const start = Math.max(0, matchLineIdx - contextLines);
  const end = Math.min(lines.length - 1, matchLineIdx + contextLines);
  return lines.slice(start, end + 1).join("\n");
}

/**
 * 검색을 위한 정규식을 생성합니다.
 * @param patternStr 사용자가 입력한 검색 패턴 문자열
 * @param type 'text' 또는 'regex'
 * @param caseSensitive 대소문자 구분 여부
 * @param global 'g' 플래그 사용 여부 (주로 검색 시 true, 단일 매치 확인 시 false)
 * @param multiline 정규식에 m 플래그 사용 여부
 * @returns 생성된 RegExp 객체
 */
function createSearchRegexObject(
  patternStr: string,
  type: "text" | "regex",
  caseSensitive: boolean,
  global = true,
  multiline = false
): RegExp {
  let finalPattern = patternStr;
  if (type === "text") {
    // 'text' 검색 시에는 사용자가 입력한 문자열을 리터럴로 취급하기 위해 특수 문자를 이스케이프합니다.
    finalPattern = finalPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  // 'regex' 검색 시에는 사용자가 입력한 패턴을 그대로 사용합니다.

  let flags = global ? "g" : "";
  if (!caseSensitive) {
    flags += "i";
  }
  if (multiline) {
    flags += "m";
  }

  try {
    return new RegExp(finalPattern, flags);
  } catch (e: any) {
    // 잘못된 정규식 패턴일 경우 SearchError 발생
    throw new SearchError(
      `Invalid regex pattern provided: "${patternStr}". ${e.message}`,
      SearchErrorCode.UNKNOWN,
      { pattern: patternStr, type, caseSensitive, error: e.toString() }
    );
  }
}

/**
 * 주어진 내용에서 모든 일치 항목을 찾습니다.
 */
function findAllMatchesInContent(
  content: string,
  lines: string[],
  searchRegex: RegExp, // 이미 global 플래그 및 case-insensitivity 플래그가 설정된 정규식
  contextLinesCount: number
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let matchExecution: RegExpExecArray | null;

  // 정규식 실행 타임아웃 설정
  const timeoutHandle = setTimeout(() => {
    console.warn(
      `Regex execution for pattern "${searchRegex.source}" with flags "${searchRegex.flags}" might be too complex and timed out.`
    );
  }, EXECUTION_TIMEOUT);

  try {
    // 검색 방식에 따라 다른 접근 방식 사용
    // '^', '$' 기호가 포함된 정규식은 라인별로 처리해야 함
    const hasLineAnchors =
      searchRegex.source.includes("^") || searchRegex.source.includes("$");

    if (hasLineAnchors) {
      // 라인별 처리 (^, $ 앵커가 있는 정규식)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 라인별 정규식 다시 생성 (lastIndex 리셋을 위해)
        const lineRegex = new RegExp(searchRegex.source, searchRegex.flags);

        if (lineRegex.test(line)) {
          // 라인이 매칭되면 전체 콘텐츠에서의 위치 계산
          let lineStartIndex = 0;
          for (let j = 0; j < i; j++) {
            lineStartIndex += lines[j].length + 1; // +1 for newline
          }

          matches.push({
            line: i + 1, // 1-based
            column: 1, // 줄 시작부터 매치로 간주
            content: line,
            context: getContext(lines, i, contextLinesCount),
            match: line, // 줄 전체가 매치
            index: lineStartIndex
          });
        }
      }
    } else {
      // 전체 콘텐츠 검색 (일반 정규식 또는 텍스트 검색)
      searchRegex.lastIndex = 0; // 루프 전에 lastIndex 초기화
      while ((matchExecution = searchRegex.exec(content)) !== null) {
        const { line, column } = getPositionInfo(content, matchExecution.index);
        const lineIndex = line - 1;

        if (lineIndex >= 0 && lineIndex < lines.length) {
          matches.push({
            line,
            column,
            content: lines[lineIndex],
            context: getContext(lines, lineIndex, contextLinesCount),
            match: matchExecution[0],
            index: matchExecution.index
          });
        }

        // 무한 루프 방지
        if (
          searchRegex.global &&
          matchExecution.index === searchRegex.lastIndex
        ) {
          // 빈 문자열 매치 시 무한 루프 방지
          if (matchExecution[0].length === 0) {
            searchRegex.lastIndex++;
          }
        }
      }
    }
  } catch (e: any) {
    clearTimeout(timeoutHandle);
    throw new SearchError(
      `Error during regex match execution: ${e.message}`,
      SearchErrorCode.UNKNOWN,
      {
        source: searchRegex.source,
        flags: searchRegex.flags,
        error: e.toString()
      }
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
  return matches;
}

export async function searchAndReplaceFile(
  filepath: string,
  args: SearchFileArgs
): Promise<SearchResult> {
  const startTime = performance.now();

  try {
    let stats;
    try {
      stats = await fs.stat(filepath);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new Error(`ENOENT: no such file or directory, ${filepath}`);
      }
      throw new SearchError(
        `Error accessing file stats: ${e.message}`,
        SearchErrorCode.IO_ERROR,
        { path: filepath, originalError: e.toString() }
      );
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new SearchError(
        `File too large (max ${MAX_FILE_SIZE} bytes, is ${stats.size} bytes)`,
        SearchErrorCode.FILE_TOO_LARGE,
        { fileSize: stats.size }
      );
    }

    const originalContent = normalizeLineEndings(
      await fs.readFile(filepath, "utf-8")
    );
    const originalLines = originalContent.split("\n");

    const effectiveSearchType = args.type || "text";
    const effectiveCaseSensitive = args.caseSensitive || false;
    // 정규식에 ^ 또는 $가 포함되어 있으면 multiline을 true로 설정 (정규식 검색 시에만 해당)
    const autoMultiline =
      effectiveSearchType === "regex" &&
      (args.pattern.includes("^") || args.pattern.includes("$"));

    // 1. 검색 단계: 모든 일치 항목 찾기
    const searchRegexForMatching = createSearchRegexObject(
      args.pattern,
      effectiveSearchType,
      effectiveCaseSensitive,
      true,
      autoMultiline
    );
    const allFoundMatches = findAllMatchesInContent(
      originalContent,
      originalLines,
      searchRegexForMatching,
      args.contextLines || 0
    );

    let modifiedContent = originalContent;
    let replacementsCount = 0;
    let diffResult: string | undefined = undefined;

    // 2. 교체 단계 (replaceText가 제공된 경우)
    if (args.replaceText !== undefined) {
      if (allFoundMatches.length > 0) {
        // 교체할 매치가 있을 때만 진행
        // 대소문자 구분 없는 검색일 경우를 위해 실제 매치는 대소문자를 유지한 채 저장
        const caseSensitiveMatches = allFoundMatches.map((match) => {
          // 대소문자 구분 없는 검색인 경우, 원본 텍스트에서 실제 매치된 부분을 정확히 찾아야 함
          if (!effectiveCaseSensitive && effectiveSearchType === "text") {
            const content = originalContent.substring(
              match.index,
              match.index + match.match.length
            );
            return { ...match, match: content };
          }
          return match;
        });

        let tempContent = originalContent;
        // 교체는 뒤에서부터 해야 인덱스 꼬임 방지
        const matchesToReplace = [...caseSensitiveMatches].sort(
          (a, b) => b.index - a.index
        );

        // 수정: replaceAllInFile=false인 경우, 첫 번째 매치(인덱스가 가장 작은 매치)만 사용
        const actualMatchesToReplace = args.replaceAllInFile
          ? matchesToReplace
          : matchesToReplace.length > 0
            ? [
                matchesToReplace.reduce((prev, curr) =>
                  prev.index < curr.index ? prev : curr
                )
              ]
            : [];

        for (const match of actualMatchesToReplace) {
          // 교체될 텍스트 결정 (정규식 그룹 지원)
          let actualReplaceText = args.replaceText;
          if (effectiveSearchType === "regex") {
            // 그룹 캡처를 위해 non-global, 동일 패턴/옵션의 정규식을 현재 매치된 텍스트(match.match)에 적용
            const singleMatchRegex = createSearchRegexObject(
              args.pattern,
              "regex",
              effectiveCaseSensitive,
              false,
              autoMultiline
            );

            // 원본 내용에서 직접 exec으로 그룹 추출
            const originalMatchedText = originalContent.substring(
              match.index,
              match.index + match.match.length
            );
            const regexGroups = singleMatchRegex.exec(originalMatchedText);

            if (regexGroups) {
              actualReplaceText = args.replaceText.replace(
                /\$(\d+|\&|\`|\')/g,
                (placeholder, p1) => {
                  if (p1 === "&") return originalMatchedText; // $& - 전체 매치된 문자열
                  if (p1 === "`") return tempContent.substring(0, match.index); // $` - 매치된 부분의 앞부분
                  if (p1 === "'")
                    return tempContent.substring(
                      match.index + match.match.length
                    ); // $' - 매치된 부분의 뒷부분
                  const groupIndex = parseInt(p1, 10);
                  if (groupIndex >= 0 && groupIndex < regexGroups.length) {
                    // $0은 전체 매치, $1부터 실제 그룹
                    return regexGroups[groupIndex] || "";
                  }
                  return placeholder; // 매칭되는 그룹이 없으면 플레이스홀더 그대로 반환 (또는 빈 문자열)
                }
              );
            }
          }

          // 내용 교체
          tempContent =
            tempContent.substring(0, match.index) +
            actualReplaceText +
            tempContent.substring(match.index + match.match.length);
          replacementsCount++;
        }

        if (replacementsCount > 0) {
          modifiedContent = tempContent;
        }
      }

      if (!args.dryRun && replacementsCount > 0) {
        try {
          await fs.writeFile(filepath, modifiedContent, "utf-8");
        } catch (error: any) {
          throw new SearchError(
            `Failed to write replaced content to file: ${filepath}. ${error.message}`,
            SearchErrorCode.IO_ERROR,
            { path: filepath, originalError: error.toString() }
          );
        }
      }

      if (replacementsCount > 0) {
        diffResult = createTwoFilesPatch(
          filepath,
          filepath,
          originalContent,
          modifiedContent,
          "original",
          "modified"
        );
      }
    }

    const resultMessage =
      args.replaceText !== undefined
        ? `${replacementsCount} item(s) replaced.`
        : allFoundMatches.length > 0
          ? `${allFoundMatches.length} item(s) found.`
          : "No matches found.";

    const result: SearchResult = {
      filepath,
      matches: allFoundMatches,
      message: resultMessage
    };

    if (args.replaceText !== undefined) {
      result.replacementsCount = replacementsCount;
      if (diffResult) {
        result.diff = diffResult;
      }
    }

    const duration = performance.now() - startTime;
    if (duration > EXECUTION_TIMEOUT) {
      console.warn(
        `Search/Replace for "${args.pattern}" on "${filepath}" took ${duration}ms, exceeding timeout ${EXECUTION_TIMEOUT}ms.`
      );
    } else {
      console.log(
        `Search/Replace for "${args.pattern}" on "${filepath}" took ${duration}ms.`
      );
    }

    return result;
  } catch (error: any) {
    if (error instanceof SearchError) {
      throw error;
    }

    // 기타 예외를 SearchError로 변환
    if (error.code === "ENOENT") {
      throw new Error(
        `ENOENT: no such file or directory, no such file: ${filepath}`
      );
    }
    throw new SearchError(
      `Unexpected error: ${error.message}`,
      SearchErrorCode.UNKNOWN,
      error
    );
  }
}

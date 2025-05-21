// src/types/searchTypes.ts
import { z } from "zod";

export enum SearchErrorCode {
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  TIMEOUT = "TIMEOUT",
  IO_ERROR = "IO_ERROR",
  UNKNOWN = "UNKNOWN",
  // 추가: 교체 작업 관련 에러 코드
  REPLACE_ERROR = "REPLACE_ERROR"
}

export class SearchError extends Error {
  constructor(
    message: string,
    public code: SearchErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export const SearchFileArgsSchema = z.object({
  filepath: z.string().describe("검색 또는 교체할 파일 경로"),
  pattern: z.string().describe("검색할 텍스트 또는 정규식 패턴"),
  type: z
    .enum(["text", "regex"])
    .optional()
    .default("text")
    .describe("검색 패턴 타입 (기본값: text)"),
  caseSensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe("대소문자 구분 여부 (기본값: false)"),
  contextLines: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("함께 표시할 전후 줄 수 (기본값: 0)"),

  // 교체 기능 필드 추가
  replaceText: z
    .string()
    .optional()
    .describe("일치하는 내용을 교체할 새 텍스트 (이 값이 있으면 교체 모드)"),
  replaceAllInLine: z
    .boolean()
    .optional()
    .default(false)
    .describe("한 줄 내 모든 일치 항목 교체 여부 (false면 첫 항목만)"),
  replaceAllInFile: z
    .boolean()
    .optional()
    .default(true)
    .describe("파일 내 모든 일치 항목 교체 여부 (false면 첫 항목만)"), // 기본값은 true (파일 전체)
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("실제 저장 없이 변경사항 diff 또는 예상 결과만 반환")
  // stateId: z.string().optional(), // 필요시
});
export type SearchFileArgs = z.infer<typeof SearchFileArgsSchema>;

export const SearchMatchSchema = z.object({
  line: z.number().describe("일치 항목이 있는 줄 번호 (1부터 시작)"),
  column: z.number().describe("일치 항목 시작 열 (1부터 시작)"),
  content: z.string().describe("일치 항목이 있는 줄의 전체 내용"),
  context: z.string().describe("일치 항목 주변 문맥 (contextLines에 따라)"),
  match: z.string().describe("실제 일치한 텍스트 부분"),
  index: z.number().describe("파일 내 일치 항목의 시작 인덱스 (0부터 시작)")
});
export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const SearchResultSchema = z.object({
  filepath: z.string(),
  matches: z
    .array(SearchMatchSchema)
    .describe("검색 결과 목록 (교체 미수행 시 또는 dryRun 시)"),
  // 교체 작업 결과 필드 추가
  replacementsCount: z
    .number()
    .optional()
    .describe("수행된 교체 수 (교체 작업 시)"),
  diff: z.string().optional().describe("dryRun 시 또는 교체 후 변경 사항 diff"),
  // contentAfterReplace: z.string().optional(), // dryRun 시 교체 후 전체 내용 (주의: 매우 클 수 있음) - 성능상 제외 권장
  message: z
    .string()
    .optional()
    .describe('작업 결과 메시지 (예: "3개 항목 교체됨")')
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

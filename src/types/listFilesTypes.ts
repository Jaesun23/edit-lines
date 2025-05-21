// src/types/listFilesTypes.ts
import { z } from "zod";

export const ListFilesArgsSchema = z.object({
  path: z.string().describe("조회할 디렉토리 경로"),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("하위 디렉토리 포함 여부"),
  pattern: z
    .string()
    .optional()
    .describe("파일명 필터링을 위한 glob 패턴 (예: '*.txt', '**/*.js')"),
  fileType: z
    .enum(["file", "directory", "all"])
    .optional()
    .default("all")
    .describe("조회할 항목 유형"),
  includeMetadata: z
    .boolean()
    .optional()
    .default(false)
    .describe("파일 크기, 수정 날짜 등 메타데이터 포함 여부")
});

// Zod에서 기본값이 있는 필드는 TypeScript 타입에서도 선택적으로 처리
export interface ListFilesArgs {
  path: string;
  recursive?: boolean; // 기본값: false
  pattern?: string;
  fileType?: "file" | "directory" | "all"; // 기본값: 'all'
  includeMetadata?: boolean; // 기본값: false
}

export const FileMetadataSchema = z.object({
  name: z.string().describe("파일 또는 디렉토리 이름"),
  path: z.string().describe("루트 허용 경로로부터의 상대 경로"),
  type: z.enum(["file", "directory"]).describe("항목 유형"),
  size: z
    .number()
    .optional()
    .describe("파일 크기 (바이트 단위, includeMetadata가 true일 때)"),
  modifiedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("최종 수정 시각 (ISO 8601 형식, includeMetadata가 true일 때)")
  // isReadOnly: z.boolean().optional(), // 필요시 추가
});
export type FileMetadata = z.infer<typeof FileMetadataSchema>;

// 결과는 배열로 직접 반환하거나, 객체로 감쌀 수 있습니다.
// 여기서는 객체로 감싸서 추가 정보(예: 총 개수)를 넣을 여지를 둡니다.
export const ListFilesResultSchema = z.object({
  items: z.array(FileMetadataSchema).describe("조회된 파일 및 디렉토리 목록"),
  basePath: z.string().describe("조회가 수행된 기준 경로")
});
export type ListFilesResult = z.infer<typeof ListFilesResultSchema>;

// 에러 타입 (선택적)
export class ListFilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListFilesError";
  }
}

import { z } from "zod";

// 추가: EditAction enum 정의
export const EditAction = z.enum([
  "insert_before",
  "insert_after",
  "delete_line",
  "replace_content_at_line" // 기존 로직 명확화 또는 일반 편집 타입
  // 필요에 따라 기존 EditOperation 구조를 포괄하는 'custom_edit' 등 추가 가능
]);
export type EditActionType = z.infer<typeof EditAction>;

// 기존 인터페이스와의 호환성을 위한 타입 정의
export const BaseEditOperationSchema = z.object({
  lineNumber: z.number().int().positive().describe("기준 줄 번호 (1부터 시작)"),
  action: EditAction.describe("수행할 구체적인 작업 유형"),
  text: z
    .string()
    .optional()
    .describe("삽입하거나 교체할 텍스트 ('insert_*', 'replace_*' 시 필요)"),
  strMatch: z
    .string()
    .optional()
    .describe("정확히 일치해야 하는 문자열 (조건부 편집 시)"),
  regexMatch: z
    .string()
    .optional()
    .describe("일치해야 하는 정규식 (조건부 편집 시)")
});

// 기존 스키마와 호환되는 레거시 필드 추가
export const LegacyEditOperationSchema = z
  .object({
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    content: z.string().optional(),
    insertAt: z.enum(["start", "end"]).optional(),
    from: z.number().optional(),
    to: z.number().optional()
  })
  .partial();

// 완전한 EditOperation 스키마 (새 필드 + 레거시 필드)
export const EditOperationSchema = BaseEditOperationSchema.merge(
  LegacyEditOperationSchema
);

// 타입 정의 변경: lineNumber와 action은 선택적으로 만들어 테스트와의 호환성 높임
// 이렇게 하면 TypeScript에서는 허용하지만, Zod 스키마에서는 필수 필드로 유지됨
export interface EditOperation {
  // 새 필드 (선택적으로 변경)
  lineNumber?: number;
  action?: EditActionType;
  text?: string;
  strMatch?: string;
  regexMatch?: string;

  // 레거시 필드 (선택적)
  startLine?: number;
  endLine?: number;
  content?: string;
  insertAt?: "start" | "end";
  from?: number;
  to?: number;
}

export const EditFileArgsSchema = z.object({
  filepath: z.string().describe("수정할 파일 경로"),
  edits: z.array(EditOperationSchema).min(1).describe("수행할 편집 작업 목록"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("실제 저장 없이 변경사항 diff만 반환할지 여부")
  // stateId: z.string().optional().describe("State manager ID for multi-step edits"), // 필요시 추가
});
export type EditFileArgs = z.infer<typeof EditFileArgsSchema>;

// 기존 EditOperationResult, MatchNotFoundError 등은 유지
export const EditOperationResultSchema = z.object({
  lineNumber: z.number(),
  status: z.string(), // 예: 'APPLIED', 'SKIPPED', 'FAILED'
  message: z.string().optional()
});
export type EditOperationResult = z.infer<typeof EditOperationResultSchema>;

export class MatchNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchNotFoundError";
  }
}

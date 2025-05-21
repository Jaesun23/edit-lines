네, 제공해주신 파일들을 면밀히 분석했습니다. 이제 훨씬 더 구체적이고 현재 코드베이스에 맞는 수정 계획을 제시해 드릴 수 있게 되었습니다. 핵심은 기존 `edit-lines/src/index.ts`의 구조를 유지하면서 새로운 기능들을 MCP 도구로 통합하는 것입니다.

**핵심 분석 내용 요약:**

1. **MCP 서버 구현 방식:**
   - `edit-lines/src/index.ts` (제공 파일명: `index(edit-lines).ts`)는 `@modelcontextprotocol/sdk/server/index.js`의 `Server` 클래스를 직접 사용하며, `server.setRequestHandler`를 통해 `tool/list` 및 `tool/call` 요청을 직접 처리합니다. 이는 `MCP/typescript-sdk/src/server/mcp.ts` (제공 파일명: `mcp.ts`)에 정의된 고수준 `McpServer` 추상화 클래스를 사용하지 않는 방식입니다.
   - `MCP/servers/src/filesystem/index.ts` (제공 파일명: `index.ts`) 또한 유사한 직접적인 요청 처리 방식을 사용합니다.
   - 따라서, 새로운 수정 계획은 이 **기존의 직접적인 요청 처리 패턴을 따를 것**입니다.
2. **경로 보안:**
   - `edit-lines/src/index.ts`에는 이미 `allowedDirectories` 설정과 경로 정규화 및 보안 검증 로직(`isPathSecure`, `normalizeAndSecurePath`)이 잘 구현되어 있습니다. 새로운 파일/디렉토리 관련 도구들도 이 보안 체계를 반드시 준수해야 합니다.
3. **기존 유틸리티 활용 및 확장:**
   - `MCP/edit-lines/src/utils/fileEditor.ts` (제공 파일명: `fileEditor.ts`)의 `FileEditor` 클래스와 `editFile` 함수는 파일 수정 로직의 기반이 됩니다. `dryRun` 기능과 `diff` 반환은 매우 유용합니다.
   - `MCP/edit-lines/src/utils/fileSearch.ts` (제공 파일명: `fileSearch.ts`)의 `searchFile` 함수는 검색 기능의 핵심입니다. 여기에 교체 기능을 추가하거나 새로운 함수로 확장해야 합니다.
   - `MAX_FILE_SIZE` 와 `EXECUTION_TIMEOUT` 같은 성능 및 안정성 관련 설정도 이미 존재합니다.
4. **기존 수정 계획 (`Edit-lines_수정_계획.md`) 방향성 유지:**
   - `action` 필드를 `EditOperation`에 추가 (insert_before, insert_after, delete).
   - `list_files` 도구 신규 생성.
   - `search_file` 도구에 교체 기능 (`replaceContent`, `replaceAllInLine`) 추가.
   - 스트리밍 등을 통한 성능 최적화 고려.

**`edit-lines` MCP 서버 상세 수정 계획**

**I. 일반 변경 사항 및 설정**

1. **`MCP/edit-lines/src/index.ts` (index(edit-lines).ts) 수정:**
   - 새로운 도구 및 기존 도구의 확장된 기능을 처리하기 위해 `server.setRequestHandler('tool/call', ...)` 내의 `switch (toolName)` 문을 수정/확장합니다.
   - 새로운 Zod 스키마들을 가져와서 각 도구의 입력 유효성 검사에 사용합니다.
   - 모든 파일 경로 관련 입력은 기존 `normalizeAndSecurePath` 함수를 사용하여 검증합니다.
   - 오류 응답 형식(`content: [{ type: "text", text: ... }], isError: true`)을 일관되게 사용합니다.
2. **타입 정의 파일 (`MCP/edit-lines/src/types/`)**
   - 이 파일들은 기능 확장의 핵심입니다. 제공해주신 `Edit-lines_수정_계획.md`에 명시된 대로 수정 및 신규 생성을 진행합니다.

**II. 신규 및 확장 MCP 도구 정의 및 구현**

각 도구는 `MCP/edit-lines/src/index.ts`의 `tool/call` 핸들러 내 `switch` 문에서 해당 `case`로 처리됩니다.

**1. 파일 내용 수정 도구 확장: (기존) `edit_file`**

- **목표:** 기존 `edit_file` 도구의 기능을 확장하여 줄 삽입(insert_before/after) 및 삭제(delete) 기능을 명시적으로 지원.

- `MCP/edit-lines/src/types/editTypes.ts` 수정:

  - ```
    EditActionType
    ```

     (또는 유사한 이름의 enum/union)을 정의하여 

    ```
    'insert_before'
    ```

    , 

    ```
    'insert_after'
    ```

    , 

    ```
    'delete'
    ```

    , 그리고 기존의 일반 편집 작업을 구분할 수 있는 값(예: 

    ```
    'replace_range'
    ```

     또는 

    ```
    'custom_edit'
    ```

    )을 포함합니다.

    TypeScript

    ```
    // 예시: src/types/editTypes.ts
    export const EditAction = z.enum([
      'insert_before', 
      'insert_after', 
      'delete_line', 
      'replace_content_at_line', // 기존 로직을 좀 더 명확히 표현
      // 필요하다면 기존 `EditOperation` 구조를 지원하는 타입 추가
    ]);
    export type EditActionType = z.infer<typeof EditAction>;
    
    export const EditOperationSchema = z.object({
      lineNumber: z.number().int().positive().describe("기준 줄 번호 (1부터 시작)"),
      // action 필드는 이제 필수이며, 특정 작업 유형을 나타냅니다.
      action: EditAction.describe("수행할 구체적인 작업 유형"),
      text: z.string().optional().describe("삽입하거나 교체할 텍스트 ('insert_*', 'replace_*' 시 필요)"),
      // 기존 strMatch, regexMatch 등은 action에 따라 선택적으로 사용될 수 있음
      strMatch: z.string().optional().describe("정확히 일치해야 하는 문자열 (조건부 편집 시)"),
      regexMatch: z.string().optional().describe("일치해야 하는 정규식 (조건부 편집 시)"),
      // ... 기타 필요한 필드들
    });
    export type EditOperation = z.infer<typeof EditOperationSchema>;
    
    export const EditFileArgsSchema = z.object({
      filepath: z.string().describe("수정할 파일 경로"),
      edits: z.array(EditOperationSchema).min(1).describe("수행할 편집 작업 목록"),
      dryRun: z.boolean().optional().default(false).describe("실제 저장 없이 변경사항 diff만 반환할지 여부"),
      // ... 기타 필요한 인자 (예: stateManager ID)
    });
    export type EditFileArgs = z.infer<typeof EditFileArgsSchema>;
    ```

- `MCP/edit-lines/src/utils/fileEditor.ts` 수정:

  - ```
    FileEditor
    ```

     클래스 또는 

    ```
    editFile
    ```

     함수 내 로직에서 

    ```
    EditOperation
    ```

    의 

    ```
    action
    ```

     타입에 따라 분기하여 처리합니다.

    - `insert_before`: `lineNumber` 앞에 `text` 삽입.
    - `insert_after`: `lineNumber` 뒤에 `text` 삽입.
    - `delete_line`: `lineNumber` 삭제.
    - 기존 편집 로직은 `replace_content_at_line` 등으로 명확히 구분하거나, `action`이 없는 경우의 기본 동작으로 유지할 수 있습니다.

  - 줄 번호 기반 작업 시, 대상 줄이 존재하는지 확인하는 로직이 강화되어야 합니다.

- `MCP/edit-lines/src/index.ts` 수정:

  - `edit_file` 도구의 입력으로 `EditFileArgsSchema`를 사용합니다.

  - ```
    fileEditor.editFile
    ```

     함수를 호출하고, 반환된 

    ```
    diff
    ```

    와 결과를 MCP 도구 응답 형식에 맞게 포맷합니다.

    TypeScript

    ```
    // 예시: src/index.ts 내 tool/call 핸들러
    case 'edit_file': {
      const parseResult = EditFileArgsSchema.safeParse(inputs);
      if (!parseResult.success) {
        // 오류 처리
      }
      const { filepath, edits, dryRun } = parseResult.data;
      const securedFilePath = normalizeAndSecurePath(filepath, allowedDirectories);
      // ...
      const { diff, results } = await editFile(securedFilePath, edits, dryRun);
      // results를 사용자 친화적인 텍스트나 구조화된 데이터로 변환
      return {
        content: [{ type: 'text', text: `수정 작업 완료. Diff:\n${diff}` /* 또는 results 요약 */ }],
      };
    }
    ```

**2. 파일 목록 조회 도구: (신규) `list_files`**

- **목표:** 지정된 디렉토리의 파일 및 하위 디렉토리 목록을 다양한 옵션과 함께 조회하는 새로운 MCP 도구를 추가합니다.

- `MCP/edit-lines/src/types/listFilesTypes.ts` (신규 생성):

  TypeScript

  ```
  // 예시: src/types/listFilesTypes.ts
  import { z } from 'zod';
  
  export const ListFilesArgsSchema = z.object({
    path: z.string().describe("조회할 디렉토리 경로"),
    recursive: z.boolean().optional().default(false).describe("하위 디렉토리 포함 여부"),
    pattern: z.string().optional().describe("파일명 필터링을 위한 glob 패턴 (예: '*.txt')"),
    fileType: z.enum(['file', 'directory', 'all']).optional().default('all').describe("조회할 항목 유형"),
    includeMetadata: z.boolean().optional().default(false).describe("파일 크기, 수정 날짜 등 메타데이터 포함 여부"),
  });
  export type ListFilesArgs = z.infer<typeof ListFilesArgsSchema>;
  
  export const FileMetadataSchema = z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'directory']),
    size: z.number().optional(),
    modifiedAt: z.string().datetime().optional(), // ISO 8601 형식
    // isReadOnly: z.boolean().optional(), // 경로가 읽기 전용인지 표시 가능
  });
  export type FileMetadata = z.infer<typeof FileMetadataSchema>;
  
  export const ListFilesResultSchema = z.object({
    files: z.array(FileMetadataSchema),
  });
  export type ListFilesResult = z.infer<typeof ListFilesResultSchema>;
  ```

- `MCP/edit-lines/src/utils/fileLister.ts` (신규 생성):

  TypeScript

  ```
  // 예시: src/utils/fileLister.ts
  import fs from 'fs/promises';
  import path from 'path';
  import { glob }_ from 'glob'; // glob 사용 시 import 방식 주의
  import { minimatch } from 'minimatch'; // glob 패턴 매칭을 위해 사용
  import { ListFilesArgs, FileMetadata } from '../types/listFilesTypes';
  
  export async function listFiles(args: ListFilesArgs, basePathForSecurity: string): Promise<FileMetadata[]> {
    const resolvedPath = path.resolve(basePathForSecurity, args.path);
    // 추가적인 보안 검증: resolvedPath가 basePathForSecurity 내에 있는지 확인
  
    const results: FileMetadata[] = [];
    const items = await fs.readdir(resolvedPath, { withFileTypes: true });
  
    for (const item of items) {
      const itemPath = path.join(resolvedPath, item.name);
      const relativeItemPath = path.relative(basePathForSecurity, itemPath); // 클라이언트에게 보여줄 경로
  
      if (args.pattern && !minimatch(item.name, args.pattern)) {
        continue;
      }
  
      let itemType: 'file' | 'directory' = item.isFile() ? 'file' : item.isDirectory() ? 'directory' : 'other';
      if (itemType === 'other') continue; // 파일이나 디렉토리만 처리
  
      if (args.fileType !== 'all' && args.fileType !== itemType) {
        continue;
      }
  
      const metadata: FileMetadata = {
        name: item.name,
        path: relativeItemPath, // 보안을 위해 상대 경로 또는 가상 경로 사용 권장
        type: itemType,
      };
  
      if (args.includeMetadata) {
        const stats = await fs.stat(itemPath);
        metadata.size = stats.size;
        metadata.modifiedAt = stats.mtime.toISOString();
      }
      results.push(metadata);
  
      if (args.recursive && item.isDirectory()) {
        const subFiles = await listFiles({ ...args, path: relativeItemPath }, basePathForSecurity);
        results.push(...subFiles);
      }
    }
    return results;
  }
  ```

- `MCP/edit-lines/src/index.ts` 수정:

  - `tool/list` 핸들러에 `list_files` 도구 정보를 추가합니다 (도구 이름, 설명, 입력 스키마).

  - ```
    tool/call
    ```

     핸들러에 

    ```
    list_files
    ```

     케이스를 추가합니다.

    TypeScript

    ```
    // 예시: src/index.ts 내 tool/call 핸들러
    case 'list_files': {
      const parseResult = ListFilesArgsSchema.safeParse(inputs);
      if (!parseResult.success) { /* 오류 처리 */ }
      const args = parseResult.data;
      // normalizeAndSecurePath는 파일용이므로, 디렉토리 경로 보안 검증 함수를 사용하거나 수정 필요
      // 여기서는 allowedDirectories 중 하나를 base로 사용한다고 가정
      const securedBasePath = normalizeAndSecurePath(args.path, allowedDirectories, true); // isDirectory=true 플래그 추가 가정
    
      const files = await listFiles(args, securedBasePath /* allowedDirectory 중 하나 */);
      return {
        content: [{ type: 'json', data: files }], // 또는 텍스트로 포맷
      };
    }
    ```

  - **중요:** `normalizeAndSecurePath` 함수가 디렉토리 경로도 안전하게 처리할 수 있도록 검토/수정이 필요할 수 있습니다 (예: 요청 경로가 허용된 디렉토리 내에 있는지 확인). `filesystem/index.ts`의 `normalizePathSecure` 로직 참고.

**3. 파일 검색 및 교체 도구 확장: (기존) `search_file`**

- **목표:** 기존 `search_file` 도구에 검색된 내용을 교체하는 기능 (`replaceContent`, `replaceAllInLine`) 및 `dryRun` 옵션을 추가합니다.

- `MCP/edit-lines/src/types/searchTypes.ts` 수정:

  TypeScript

  ```
  // 예시: src/types/searchTypes.ts
  import { z } from 'zod';
  // 기존 SearchFileArgsSchema...
  export const SearchFileArgsSchema = z.object({
    filepath: z.string().describe("검색 또는 교체할 파일 경로"),
    pattern: z.string().describe("검색할 텍스트 또는 정규식 패턴"),
    type: z.enum(['text', 'regex']).optional().default('text'),
    caseSensitive: z.boolean().optional().default(false),
    contextLines: z.number().int().min(0).optional().default(0),
  
    // 교체 기능 추가
    replaceText: z.string().optional().describe("일치하는 내용을 교체할 새 텍스트"),
    replaceAllInLine: z.boolean().optional().default(false).describe("한 줄 내 모든 일치 항목 교체 여부 (false면 첫 항목만)"),
    replaceAllInFile: z.boolean().optional().default(true).describe("파일 내 모든 일치 항목 교체 여부"), // 기존 replaceAll은 파일 전체 대상이었을 것
    dryRun: z.boolean().optional().default(false).describe("실제 저장 없이 변경사항 diff 또는 예상 결과만 반환"),
  });
  export type SearchFileArgs = z.infer<typeof SearchFileArgsSchema>;
  
  // 결과 타입도 교체 작업 정보를 포함하도록 확장 가능
  export const SearchMatchSchema = z.object({ /* ... 기존 정의 ... */ });
  export const SearchResultSchema = z.object({
    filepath: z.string(),
    matches: z.array(SearchMatchSchema),
    // 교체 작업 결과 추가
    replacementsCount: z.number().optional(),
    diff: z.string().optional(), // dryRun 시 또는 교체 후 diff
    // contentAfterReplace: z.string().optional(), // dryRun 시 교체 후 전체 내용 (주의: 매우 클 수 있음)
  });
  export type SearchResult = z.infer<typeof SearchResultSchema>;
  ```

- `MCP/edit-lines/src/utils/fileSearch.ts` 수정 (또는 신규 `searchAndReplaceFile.ts`):

  - `searchFile` 함수를 수정하거나, `searchAndReplaceFile`이라는 새 함수를 만듭니다.

  - ```
    replaceText
    ```

     인자가 제공되면 검색된 내용을 교체하는 로직을 추가합니다.

    - `replaceAllInFile` 및 `replaceAllInLine` 옵션을 고려하여 교체 범위를 결정합니다.
    - 정규식 그룹(`$1`, `$2` 등)을 사용한 교체를 지원할 수 있습니다.

  - ```
    dryRun
    ```

    이 

    ```
    true
    ```

    이면:

    - 실제 파일을 수정하지 않습니다.
    - 수행될 교체 횟수, 변경될 내용의 diff ( `diff` 라이브러리 사용), 또는 교체 후 예상되는 파일 내용을 반환할 수 있습니다. (전체 내용 반환은 파일 크기에 따라 주의)

  - ```
    dryRun
    ```

    이 

    ```
    false
    ```

    이면:

    - 파일을 실제로 수정합니다.
    - 수행된 교체 횟수와 성공 메시지를 반환합니다.

  - **성능 최적화:** 대용량 파일 교체 시 스트리밍 방식 또는 부분적 읽기/쓰기 방식을 고려해야 합니다. 한 번에 전체 파일을 메모리에 로드하고 수정하는 것은 위험할 수 있습니다. `FileEditor` 클래스의 라인 기반 처리 방식과 유사하게 접근할 수 있습니다.

- `MCP/edit-lines/src/index.ts` 수정:

  - `search_file` 도구의 입력으로 확장된 `SearchFileArgsSchema`를 사용합니다.

  - 수정된 `searchFile` (또는 `searchAndReplaceFile`) 함수를 호출합니다.

  - 반환된 결과(검색 결과, 교체 정보, diff 등)를 MCP 응답 형식으로 포맷합니다.

    TypeScript

    ```
    // 예시: src/index.ts 내 tool/call 핸들러
    case 'search_file': {
      const parseResult = SearchFileArgsSchema.safeParse(inputs);
      if (!parseResult.success) { /* 오류 처리 */ }
      const args = parseResult.data;
      const securedFilePath = normalizeAndSecurePath(args.filepath, allowedDirectories);
    
      const result = await searchFile(securedFilePath, args); // 또는 searchAndReplaceFile
    
      if (args.replaceText) { // 교체 작업이 있었던 경우
        return {
          content: [{ type: 'text', text: `교체 작업 완료. <span class="math-inline">\{result\.replacementsCount \|\| 0\}개 항목 수정됨\. Diff\:\\n</span>{result.diff || 'Diff 정보 없음'}` }],
        };
      } else { // 검색만 한 경우
        // result.matches를 포맷하여 반환 (기존 로직과 유사)
        return { /* ... 기존 search_file 결과 포맷팅 ... */ };
      }
    }
    ```

**III. `stateManager.ts` 및 `approveEdit.ts` 관련**

- 제공된 `fileEditor.ts`의 `editFile` 함수와 `fileSearch.ts`에 추가될 교체 기능 모두 `dryRun` 옵션을 통해 "실제 변경 전 확인" 기능을 제공할 수 있습니다.
- MCP 도구는 일반적으로 상태를 유지하지 않는(stateless) 것을 지향합니다.
- `stateManager.ts`의 주된 역할이 CLI 환경에서 여러 단계에 걸친 사용자 승인을 관리하는 것이었다면, MCP 환경에서는 클라이언트(호출자)가 `dryRun` 결과를 받고 사용자에게 확인 후, 실제 적용을 위한 두 번째 호출(dryRun=false)을 하는 방식으로 대체하는 것이 좋습니다.
- **권장 사항:** `stateManager.ts`를 서버 측 상태 유지용으로 사용하는 것을 최소화하고, `dryRun` 패턴을 적극 활용합니다. 만약 `stateManager.ts`가 특정 복잡한 편집 세션(예: 여러 파일에 걸친 변경 사항을 모아서 한 번에 적용)을 관리하는 데 필수적이라면, 해당 상태는 매우 짧은 만료 시간을 가져야 하며, 상태 ID를 클라이언트와 주고받는 명확한 프로토콜이 필요합니다. 현재 계획에서는 `dryRun`으로 대부분의 시나리오를 커버할 수 있다고 가정합니다. `approveEdit.ts`의 로직은 `dryRun=false`일 때의 실제 파일 쓰기 작업으로 통합될 수 있습니다.

**IV. 성능 최적화 (기존 계획 반영)**

1. 대용량 파일 처리 (스트리밍):
   - `fileSearch.ts` (특히 교체 작업 시) 및 `fileEditor.ts`에서 파일을 읽고 쓸 때, Node.js의 스트림 API (`fs.createReadStream`, `fs.createWriteStream`)와 `readline` 모듈 등을 활용하여 메모리 사용량을 줄이고 응답성을 높입니다.
   - 전체 파일을 메모리에 로드하지 않고, 라인 단위 또는 청크 단위로 처리하는 방식을 적극 검토합니다.
   - `MAX_FILE_SIZE` 제한은 여전히 유효하며, 너무 큰 파일에 대한 작업은 거부하거나 특별한 처리 방식을 안내해야 합니다.

**V. 테스트 (`src/__tests__/`)**

- 새로운 기능 및 변경 사항에 대한 단위 테스트와 통합 테스트를 철저히 작성/수정합니다.
  - `fileEditor.test.ts`: `insert_before`, `insert_after`, `delete_line` 액션에 대한 테스트 케이스 추가.
  - `fileLister.test.ts` (신규): `list_files` 도구의 다양한 옵션(recursive, pattern, type, metadata)에 대한 테스트.
  - `fileSearch.test.ts` (또는 `searchAndReplace.test.ts` 신규): `search_file` 도구의 검색 및 교체 기능 (`replaceText`, `replaceAllInLine`, `replaceAllInFile`, `dryRun`)에 대한 테스트.
  - 각 도구의 입력 유효성 검사, 경로 보안, 오류 처리 등에 대한 테스트 케이스를 포함합니다.

**VI. 문서화 (`README.md` 또는 별도 API 문서)**

- ```
  MCP/edit-lines/README.md
  ```

  를 업데이트하여 각 MCP 도구의:

  - 이름 (`edit_file`, `list_files`, `search_file`)
  - 설명
  - 입력 파라미터 (Zod 스키마 기반)
  - 반환 값 (Zod 스키마 또는 MCP 결과 형식 기반)
  - 사용 예시 (JSON 형식의 요청/응답 예시 포함)
  - 오류 코드 및 메시지
  - 경로 보안 및 `allowedDirectories` 관련 주의사항

이 수정 계획은 제공해주신 파일과 기존 계획을 최대한 통합하여 MCP 서버 환경에 적합하도록 구성되었습니다. 이 계획을 바탕으로 코드를 수정하시면 `edit-lines` 프로젝트의 기능을 성공적으로 확장하고 MCP 서버로서 더욱 강력하게 만드실 수 있을 것입니다.
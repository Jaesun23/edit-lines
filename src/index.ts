#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, // Tool 타입을 위해 추가
  CallToolResult, // 오류 반환을 위해 추가
  ErrorCode, // 반환 타입을 위해 추가
  JSONRPCError,
  ListToolsRequestSchema, // Tool 타입을 위해 유지
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';

// 수정된 타입 및 신규 타입 import
import { EditFileArgsSchema, EditOperation } from './types/editTypes.js'; // EditOperation은 editFile 함수 시그니처에 필요
import { ListFilesArgsSchema } from './types/listFilesTypes.js'; // 신규
import { SearchError, SearchFileArgsSchema } from './types/searchTypes.js'; // SearchResultSchema 추가

// 유틸리티 함수 import
// import { approveEdit } from './utils/approveEdit.js'; // StateManager와 함께 사용 여부 결정
import { editFile } from './utils/fileEditor.js';
import { listFiles } from './utils/fileLister.js'; // 신규
import { searchAndReplaceFile } from './utils/fileSearch.js'; // searchFile -> searchAndReplaceFile
// import { getLineInfo } from './utils/lineInfo.js'; // 필요시 사용
// import { StateManager } from './utils/stateManager.js'; // 사용 여부 결정

// --- 기존 경로 처리 및 보안 로직 (normalizePath, expandHome, isPathSecure, normalizeAndSecurePath) ---
// 이 부분은 기존 코드 그대로 유지 또는 필요시 디렉토리 처리를 위해 일부 수정
// 예시: normalizeAndSecurePath에 isDirectory 플래그 추가 고려
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    'Usage: ./build/index.js <allowed-directory>[:ro] [additional-directories...]',
  );
  process.exit(1);
}

interface AllowedDirectory {
  path: string;
  readOnly: boolean;
}
const allowedDirectories: AllowedDirectory[] = args.map((arg) => {
  const parts = arg.split(':');
  const p = parts[0];
  const readOnly = parts[1] === 'ro';
  return { path: expandHome(normalizePath(p)), readOnly };
});

function normalizePathInternal(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(filepath.startsWith('~/') ? 2 : 1));
  }
  return filepath;
}

function isPathSecure(
  normalizedFullPath: string,
  allowedDirs: AllowedDirectory[],
): AllowedDirectory | undefined {
  return allowedDirs.find((allowedDir) =>
    normalizedFullPath.startsWith(allowedDir.path + path.sep) || normalizedFullPath === allowedDir.path
  );
}

function normalizeAndSecurePath(
  rawFilepath: string,
  allowedDirs: AllowedDirectory[],
  isDirOperation: boolean = false, // 디렉토리 작업인지 파일 작업인지 구분
): { securedPath: string; directoryInfo: AllowedDirectory } {
  const normalizedFilepath = normalizePathInternal(expandHome(rawFilepath));
  const directoryInfo = isPathSecure(normalizedFilepath, allowedDirs);

  if (!directoryInfo) {
    throw new Error(
      `Access denied: Path is not within any allowed directories: ${rawFilepath}`,
    );
  }
  // For directory operations like list_files, the path itself might be an allowed directory
  // For file operations, it must be a file *within* an allowed directory.
  // This check might need refinement based on exact requirements.

  return { securedPath: normalizedFilepath, directoryInfo };
}
// --- 여기까지 기존 경로 처리 로직 ---


const server = new Server({
  toolHandlerPath: '/tools', // Not directly used with setRequestHandler but good for consistency
});

// const stateManager = new StateManager(); // StateManager 사용 여부에 따라 주석 해제/제거

// 도구 목록 정의
const tools: Tool[] = [
  {
    name: 'edit_file',
    description: '파일의 특정 줄을 편집하거나, 내용을 삽입 또는 삭제합니다.',
    inputSchema: zodToJsonSchema(EditFileArgsSchema) as any,
  },
  {
    name: 'search_file',
    description: '파일 내에서 텍스트나 정규식을 검색하고, 선택적으로 내용을 교체합니다.',
    inputSchema: zodToJsonSchema(SearchFileArgsSchema) as any,
  },
  {
    name: 'list_files', // 신규 도구
    description: '지정된 디렉토리의 파일 및 하위 디렉토리 목록을 조회합니다.',
    inputSchema: zodToJsonSchema(ListFilesArgsSchema) as any,
  },
  // get_line_info, approve_edit 등 기존 도구들은 필요에 따라 유지 또는 제거
];

server.setRequestHandler('tool/list', async (_request) => {
  const parseResult = ListToolsRequestSchema.safeParse(_request);
  if (!parseResult.success) {
    return {
      jsonrpc: '2.0',
      id: _request?.id ?? null,
      error: { code: ErrorCode.InvalidParams, message: 'Invalid tool/list request' },
    };
  }
  return {
    jsonrpc: '2.0',
    id: parseResult.data.id,
    result: { tools },
  };
});

server.setRequestHandler('tool/call', async (_request): Promise<CallToolResult | JSONRPCError> => {
  const parseResult = CallToolRequestSchema.safeParse(_request);
  if (!parseResult.success) {
    return {
      jsonrpc: '2.0',
      id: _request?.id ?? null,
      error: { code: ErrorCode.InvalidParams, message: 'Invalid tool/call request' },
    };
  }
  const { id, toolName, inputs } = parseResult.data;

  try {
    switch (toolName) {
      case 'edit_file': {
        const editArgsParse = EditFileArgsSchema.safeParse(inputs);
        if (!editArgsParse.success) {
          throw new Error(`Invalid arguments for edit_file: ${editArgsParse.error.format()}`);
        }
        const { filepath, edits, dryRun } = editArgsParse.data;
        const { securedPath, directoryInfo } = normalizeAndSecurePath(filepath, allowedDirectories);
        if (directoryInfo.readOnly && !dryRun) {
            throw new Error(`File is in a read-only directory and dryRun is false: ${filepath}`);
        }

        const { diff, results } = await editFile(securedPath, edits as EditOperation[], dryRun); // 타입 단언

        let resultText = dryRun ? 'Dry run complete.\n' : 'File edit complete.\n';
        resultText += `Diff:\n${diff}\n\nResults:\n`;
        results.forEach((res, line) => {
            resultText += `Line ${line}: ${res.status} - ${res.message || ''}\n`;
        });
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: resultText }] } };
      }

      case 'search_file': {
        const searchArgsParse = SearchFileArgsSchema.safeParse(inputs);
        if (!searchArgsParse.success) {
          throw new Error(`Invalid arguments for search_file: ${searchArgsParse.error.format()}`);
        }
        const args = searchArgsParse.data;
        const { securedPath, directoryInfo } = normalizeAndSecurePath(args.filepath, allowedDirectories);

        if (directoryInfo.readOnly && args.replaceText && !args.dryRun) {
            throw new Error(`File is in a read-only directory, replacement requested, and dryRun is false: ${args.filepath}`);
        }

        const searchResult = await searchAndReplaceFile(securedPath, args);

        // SearchResultSchema를 사용하여 결과 포맷팅 (필요시)
        // 여기서는 주요 정보만 텍스트로 반환
        let resultText = `Search/Replace for "${args.pattern}" in "${args.filepath}":\n`;
        resultText += `${searchResult.message}\n`;
        if (searchResult.diff) {
            resultText += `Diff:\n${searchResult.diff}\n`;
        }
        if (!args.replaceText && searchResult.matches.length > 0) {
            resultText += `\nMatches Found (${searchResult.matches.length}):\n`;
            searchResult.matches.slice(0, 10).forEach(match => { // 처음 10개 매치만 표시
                resultText += `  L${match.line}:${match.column} - ${match.content.substring(0, 80)}\n`;
            });
            if (searchResult.matches.length > 10) resultText += "  ...and more.\n";
        }
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: resultText }] } };
      }

      case 'list_files': { // 신규 도구 핸들러
        const listArgsParse = ListFilesArgsSchema.safeParse(inputs);
        if (!listArgsParse.success) {
          throw new Error(`Invalid arguments for list_files: ${listArgsParse.error.format()}`);
        }
        const args = listArgsParse.data;

        // list_files의 args.path는 allowedDirectories 중 하나의 루트를 기준으로 한 상대 경로여야 함.
        // 어떤 allowedDirectory를 기준으로 할지 결정하는 로직 필요.
        // 지금은 첫 번째 allowedDirectory를 기준으로 한다고 단순화.

        if (allowedDirectories.length === 0) {
            throw new Error("No allowed directories configured for list_files.");
        }

        // 요청된 경로를 검증 (isDirOperation=true 사용)
        const { securedPath: baseSecuredPath } = normalizeAndSecurePath(
          args.path || '.',
          allowedDirectories,
          true
        );

        try {
          // 디렉토리 존재 여부 및 타입 검증 - listFiles 내에서도 체크하지만, 여기서 먼저 확인
          const stats = await fs.stat(baseSecuredPath);
          if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${args.path}`);
          }
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            throw new Error(`Directory not found: ${args.path}`);
          }
          throw err;
        }

        // listFiles에는 allowedDirectory로부터 시작되는 baseSecuredPath 전체 경로를 전달합니다.
        // args에는 path를 포함한 기존 인자 그대로 전달합니다.
        const listResult = await listFiles(args, baseSecuredPath);

        // 결과를 JSON으로 반환
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'json',
              data: listResult
            }]
          }
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: ErrorCode.MethodNotFound, message: `Unknown tool: ${toolName}` },
        };
    }
  } catch (error: any) {
    console.error(`Error calling tool ${toolName}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    // SearchError의 경우 code와 details를 포함하여 더 풍부한 오류 정보 제공 가능
    if (error instanceof SearchError) {
        return {
            jsonrpc: '2.0',
            id,
            error: {
                code: ErrorCode.InternalError, // 또는 커스텀 에러 코드
                message: `Search operation failed: ${message}`,
                data: { errorCode: error.code, details: error.details }
            }
        };
    }
    return {
      jsonrpc: '2.0',
      id,
      error: { code: ErrorCode.InternalError, message },
    };
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Edit Lines MCP Server running on stdio');
  console.error('Allowed directories:', allowedDirectories.map(d => `${d.path}${d.readOnly ? ' (ro)' : ''}`).join(', '));
}

runServer().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});

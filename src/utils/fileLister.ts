// src/utils/fileLister.ts
import fs from 'fs/promises';
import { minimatch } from 'minimatch'; // glob 패턴 매칭을 위해 사용
import path from 'path';
import { FileMetadata, ListFilesArgs, ListFilesResult } from '../types/listFilesTypes.js';

// normalizeAndSecurePath 함수는 index.ts에서 가져오거나 유사한 로직을 여기에 구현해야 합니다.
// 이 예제에서는 securedBasePath가 이미 검증되었다고 가정합니다.
export async function listFilesRecursively(
  currentPath: string, // 현재 탐색 중인 절대 경로
  basePathForDisplay: string, // 클라이언트에게 보여줄 경로의 기준이 되는 절대 경로
  args: ListFilesArgs,
): Promise<FileMetadata[]> {
  const results: FileMetadata[] = [];
  let items;
  try {
    items = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error: any) {
    // 권한 문제 등으로 디렉토리 읽기 실패 시 해당 디렉토리는 건너뜀
    console.warn(`Warning: Could not read directory ${currentPath}: ${error.message}`);
    return []; // 빈 배열 반환하여 다른 부분 진행
  }


  for (const item of items) {
    const itemAbsolutePath = path.join(currentPath, item.name);
    // 클라이언트에게 보여줄 경로는 basePathForDisplay 기준으로 생성
    const itemDisplayPath = path.relative(basePathForDisplay, itemAbsolutePath);

    if (args.pattern && !minimatch(item.name, args.pattern, { matchBase: true, dot: true })) {
      // matchBase:true -  '*.txt'가 'dir/file.txt' 대신 'file.txt'에 매치되도록
      // dot:true - .으로 시작하는 파일도 패턴에 매치되도록 (예: '.*')
      if (item.isDirectory() && args.recursive) {
         // 디렉토리가 패턴과 일치하지 않더라도 하위 탐색은 계속 (패턴은 파일명 기준일 수 있으므로)
      } else if (!item.isDirectory()) { // 파일이 패턴과 안 맞으면 스킵
        continue;
      }
    }

    const itemType: 'file' | 'directory' | 'other' = item.isFile()
      ? 'file'
      : item.isDirectory()
      ? 'directory'
      : 'other';

    if (itemType === 'other') continue;

    if (args.fileType !== 'all' && args.fileType !== itemType) {
       if (item.isDirectory() && args.recursive) {
            // 타입이 안 맞아도 하위 탐색은 계속 (예: fileType='file'인데 현재는 directory)
       } else {
        continue;
       }
    }

    // fileType 필터링 이후, 실제 결과 배열에 추가할지 결정
    let shouldAddItem = args.fileType === 'all' || args.fileType === itemType;
    if (args.pattern && item.isDirectory() && !minimatch(item.name, args.pattern, { matchBase: true, dot: true })) {
      // 디렉토리 자체가 패턴과 안 맞으면 추가 안함 (파일은 위에서 이미 필터링)
      shouldAddItem = false;
    }


    if (shouldAddItem) {
        const metadata: FileMetadata = {
            name: item.name,
            path: itemDisplayPath.replace(/\\/g, '/'), // 경로 구분자 통일
            type: itemType,
        };

        if (args.includeMetadata) {
            try {
                const stats = await fs.stat(itemAbsolutePath);
                metadata.size = stats.size;
                metadata.modifiedAt = stats.mtime.toISOString();
            } catch (statError: any) {
                console.warn(`Warning: Could not get stats for ${itemAbsolutePath}: ${statError.message}`);
                // 메타데이터 조회 실패시 해당 정보는 누락
            }
        }
        results.push(metadata);
    }


    if (item.isDirectory() && args.recursive) {
      // 재귀 호출 시 args.path는 변경하지 않고, 현재 경로를 전달
      const subFiles = await listFilesRecursively(itemAbsolutePath, basePathForDisplay, args);
      results.push(...subFiles);
    }
  }
  return results;
}


export async function listFiles(
  args: ListFilesArgs,
  allowedPathRoot: string, // 보안 검증된 절대 경로 (예: allowedDirectories 중 하나)
): Promise<ListFilesResult> {
  // 요청된 path를 allowedPathRoot 기준으로 해석
  const targetAbsolutePath = path.resolve(allowedPathRoot, args.path || '.');

  // 보안: targetAbsolutePath가 allowedPathRoot 내에 있는지 다시 한번 확인하는 것이 좋음
  if (!targetAbsolutePath.startsWith(allowedPathRoot)) {
    throw new Error('Access denied: Path is outside the allowed root directory.');
  }

  try {
    const stats = await fs.stat(targetAbsolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${args.path}`);
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${args.path}`);
    }
    throw err;
  }

  const items = await listFilesRecursively(targetAbsolutePath, allowedPathRoot, args);

  return {
    items,
    basePath: args.path || '.', // 클라이언트가 요청한 상대 경로를 basePath로
  };
}

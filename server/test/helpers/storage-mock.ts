import { type Mock, vi } from 'vitest';
import { imageHead } from './image';

// 이 파일은 src/lib/storage를 import하지 않는다 (vi.mock 팩토리 안에서 불러서 순환 import가 되지 않게).

const readHead = (key: string) => Promise.resolve(imageHead(key));
const readUrl = (key: string | null | undefined) =>
  Promise.resolve(key ? `https://signed.test/${key}` : null);

/**
 * 테스트 파일 맨 위에서
 *   vi.mock('../../src/lib/storage', async () => (await import('../helpers/storage-mock.js')).storageMock());
 * 로 쓴다. 올린 사진은 모두 key 확장자에 맞는 실제 이미지가 있는 것으로 본다.
 */
export function storageMock() {
  return {
    readObjectHead: vi.fn(readHead),
    createUploadUrl: vi.fn(),
    createReadUrl: vi.fn(readUrl),
    deleteObjectQuietly: vi.fn(() => Promise.resolve(true)),
    deletePrefixQuietly: vi.fn(() => Promise.resolve(true)),
  };
}

/** beforeEach에서 기본 동작으로 되돌린다. 인자는 import * as storage from '../../src/lib/storage' */
export function resetStorageMock(storage: { readObjectHead: unknown; createReadUrl: unknown }) {
  (storage.readObjectHead as Mock).mockImplementation(readHead);
  (storage.createReadUrl as Mock).mockImplementation(readUrl);
}

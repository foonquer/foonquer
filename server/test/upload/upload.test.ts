import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { createUploadUrl, deleteObjectQuietly, readObjectHead } from '../../src/lib/storage';
import { assertUploadedImage } from '../../src/modules/upload/uploaded-image';
import { resetDb } from '../helpers/db';
import { bearer, createMember } from '../helpers/fixtures';
import { imageHead } from '../helpers/image';

vi.mock('../../src/lib/storage', () => ({
  readObjectHead: vi.fn(() => Promise.resolve(null)),
  createUploadUrl: vi.fn(),
  deleteObjectQuietly: vi.fn(() => Promise.resolve()),
  createReadUrl: vi.fn(() => Promise.resolve(null)),
}));

const app = createApp();

beforeEach(async () => {
  await resetDb();
  vi.mocked(createUploadUrl).mockImplementation((key, contentType, maxBytes) =>
    Promise.resolve({
      url: `https://storage.googleapis.com/bucket/${key}?X-Goog-Signature=abc`,
      headers: { 'Content-Type': contentType, 'x-goog-content-length-range': `0,${maxBytes}` },
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UPLOAD-01 POST /uploads/signed-url', () => {
  function issue(userId: bigint, body: Record<string, unknown>) {
    return request(app)
      .post('/api/v1/uploads/signed-url')
      .set('Authorization', bearer(userId))
      .send(body);
  }

  it.each([
    ['REVIEW', 'review', 'public'],
    ['RECEIPT', 'receipt', 'private'],
    ['SITE_PHOTO', 'site', 'private'],
    ['INQUIRY', 'inquiry', 'private'],
  ])('%s는 %s 폴더·%s 버킷 key를 준다', async (purpose, folder, bucket) => {
    const me = await createMember();
    const res = await issue(me.id, { purpose, contentType: 'image/jpeg', fileSize: 2_000_000 });
    expect(res.status).toBe(200);
    expect(res.body.data.imageKey).toMatch(new RegExp(`^${folder}/${me.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(res.body.data).toMatchObject({ method: 'PUT', expiresIn: 300 });
    expect(createUploadUrl).toHaveBeenCalledWith(
      res.body.data.imageKey,
      'image/jpeg',
      10 * 1024 * 1024,
      300,
      bucket,
    );
  });

  it('용도·형식·크기가 틀리면 400, 버킷이 없으면 500', async () => {
    const me = await createMember();
    expect(
      (await issue(me.id, { purpose: 'PROFILE', contentType: 'image/png', fileSize: 1 })).body.code,
    ).toBe('INVALID_UPLOAD_PURPOSE');
    expect(
      (await issue(me.id, { purpose: 'REVIEW', contentType: 'image/gif', fileSize: 1 })).body.code,
    ).toBe('UNSUPPORTED_IMAGE_TYPE');
    const big = await issue(me.id, {
      purpose: 'REVIEW',
      contentType: 'image/png',
      fileSize: 10 * 1024 * 1024 + 1,
    });
    expect(big.body.code).toBe('IMAGE_TOO_LARGE');

    vi.mocked(createUploadUrl).mockResolvedValueOnce(null);
    const noBucket = await issue(me.id, {
      purpose: 'RECEIPT',
      contentType: 'image/png',
      fileSize: 1,
    });
    expect(noBucket.status).toBe(500);
    expect(noBucket.body.code).toBe('UPLOAD_URL_FAILED');
  });
});

describe('assertUploadedImage (올린 사진 key 확인)', () => {
  it('내 폴더에 실제 이미지가 있으면 통과, 아니면 에러 코드로 막는다', async () => {
    const me = await createMember();
    const key = `site/${me.id}/${randomUUID()}.png`;
    vi.mocked(readObjectHead).mockImplementation((k) => Promise.resolve(imageHead(k)));
    await expect(assertUploadedImage(me.id, 'SITE_PHOTO', key)).resolves.toBeUndefined();
    expect(readObjectHead).toHaveBeenCalledWith(key, 12, 'private');

    await expect(
      assertUploadedImage(me.id, 'SITE_PHOTO', `site/${me.id + 1n}/${randomUUID()}.png`),
    ).rejects.toMatchObject({
      code: 'IMAGE_KEY_FORBIDDEN',
    });
    await expect(assertUploadedImage(me.id, 'RECEIPT', key)).rejects.toMatchObject({
      code: 'IMAGE_NOT_UPLOADED',
    });

    vi.mocked(readObjectHead).mockResolvedValue(Buffer.from('not an image'));
    await expect(assertUploadedImage(me.id, 'SITE_PHOTO', key)).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE_TYPE',
    });
    expect(deleteObjectQuietly).toHaveBeenCalledWith(key, 'private');

    vi.mocked(readObjectHead).mockResolvedValue(null);
    await expect(assertUploadedImage(me.id, 'SITE_PHOTO', key)).rejects.toMatchObject({
      code: 'IMAGE_NOT_UPLOADED',
    });
  });
});

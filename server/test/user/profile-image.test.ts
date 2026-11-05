import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createUploadUrl, deleteObjectQuietly, objectExists } from '../../src/lib/storage';
import { resetDb } from '../helpers/db';
import { agreeConsents, bearer, createMember } from '../helpers/fixtures';

// 실제 Cloud Storage는 부르지 않는다. 테스트마다 결과를 정한다.
vi.mock('../../src/lib/storage', () => ({
  objectExists: vi.fn(() => Promise.resolve(false)),
  createUploadUrl: vi.fn(),
  deleteObjectQuietly: vi.fn(() => Promise.resolve()),
}));

const app = createApp();

function keyOf(userId: bigint, ext = 'jpg') {
  return `profile/${userId.toString()}/${randomUUID()}.${ext}`;
}

beforeEach(async () => {
  await resetDb();
  vi.mocked(objectExists).mockResolvedValue(false);
  vi.mocked(createUploadUrl).mockImplementation((key, contentType, maxBytes) =>
    Promise.resolve({
      url: `https://storage.googleapis.com/test-bucket/${key}?X-Goog-Signature=abc`,
      headers: { 'Content-Type': contentType, 'x-goog-content-length-range': `0,${maxBytes}` },
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('USER-02 POST /users/me/profile-image/upload-url', () => {
  function issue(userId: bigint, body: Record<string, unknown>) {
    return request(app)
      .post('/api/v1/users/me/profile-image/upload-url')
      .set('Authorization', bearer(userId))
      .send(body);
  }

  it('내 폴더 key와 5분짜리 signed URL을 준다 (DB는 바꾸지 않는다)', async () => {
    const me = await createMember();
    const res = await issue(me.id, { contentType: 'image/png', fileSize: 482113 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('업로드 URL을 발급했어요.');
    const { data } = res.body;
    expect(data.imageKey).toMatch(new RegExp(`^profile/${me.id}/[0-9a-f-]{36}\\.png$`));
    expect(data).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'x-goog-content-length-range': '0,5242880' },
      expiresIn: 300,
    });
    expect(data.uploadUrl).toContain(data.imageKey);
    expect(createUploadUrl).toHaveBeenCalledWith(data.imageKey, 'image/png', 5242880, 300);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).profileImageKey,
    ).toBeNull();
  });

  it('프로필 설정 전(약관 동의 후) 회원도 받을 수 있다', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    await agreeConsents(me.id);
    const res = await issue(me.id, { contentType: 'image/jpeg', fileSize: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.data.imageKey).toMatch(/\.jpg$/);
  });

  it('형식·크기가 틀리면 400', async () => {
    const me = await createMember();
    const heic = await issue(me.id, { contentType: 'image/heic', fileSize: 1000 });
    expect(heic.status).toBe(400);
    expect(heic.body.code).toBe('UNSUPPORTED_IMAGE_TYPE');

    const big = await issue(me.id, { contentType: 'image/jpeg', fileSize: 5 * 1024 * 1024 + 1 });
    expect(big.status).toBe(400);
    expect(big.body.code).toBe('IMAGE_TOO_LARGE');
    expect(createUploadUrl).not.toHaveBeenCalled();
  });

  it('URL을 만들지 못하면(버킷 없음·서명 실패) 500 UPLOAD_URL_FAILED', async () => {
    const me = await createMember();
    vi.mocked(createUploadUrl).mockResolvedValueOnce(null);
    const noBucket = await issue(me.id, { contentType: 'image/jpeg', fileSize: 1000 });
    expect(noBucket.status).toBe(500);
    expect(noBucket.body.code).toBe('UPLOAD_URL_FAILED');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createUploadUrl).mockRejectedValueOnce(new Error('signBlob denied'));
    const failed = await issue(me.id, { contentType: 'image/jpeg', fileSize: 1000 });
    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe('UPLOAD_URL_FAILED');
  });

  it('1분에 10번을 넘으면 429', async () => {
    const me = await createMember();
    for (let i = 0; i < 10; i += 1) {
      expect((await issue(me.id, { contentType: 'image/jpeg', fileSize: 1000 })).status).toBe(200);
    }
    const over = await issue(me.id, { contentType: 'image/jpeg', fileSize: 1000 });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('USER-06 PUT /users/me/profile-image', () => {
  function change(userId: bigint, body: Record<string, unknown>) {
    return request(app)
      .put('/api/v1/users/me/profile-image')
      .set('Authorization', bearer(userId))
      .send(body);
  }

  it('올린 사진으로 바꾸고 이전 파일을 지운다', async () => {
    const oldKey = `profile/1/${randomUUID()}.jpg`;
    const me = await createMember({ profileImageKey: oldKey });
    const key = keyOf(me.id, 'webp');
    vi.mocked(objectExists).mockResolvedValue(true);

    const res = await change(me.id, { imageKey: key });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('프로필 사진을 바꿨어요.');
    expect(res.body.data).toEqual({
      profileImageUrl: `https://images.test/${key}`,
      profileImageSource: 'CUSTOM',
    });
    expect(objectExists).toHaveBeenCalledWith(key);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).profileImageKey).toBe(
      key,
    );
    expect(deleteObjectQuietly).toHaveBeenCalledWith(oldKey);
  });

  it('같은 사진을 다시 보내면 파일을 지우지 않는다', async () => {
    const me = await createMember();
    const key = keyOf(me.id);
    await prisma.member.update({ where: { id: me.id }, data: { profileImageKey: key } });
    vi.mocked(objectExists).mockResolvedValue(true);

    expect((await change(me.id, { imageKey: key })).status).toBe(200);
    expect(deleteObjectQuietly).not.toHaveBeenCalled();
  });

  it('key가 없으면 400 IMAGE_KEY_REQUIRED, 다른 회원 폴더면 403, 형식이 틀리거나 파일이 없으면 400', async () => {
    const me = await createMember();
    const other = await createMember();
    vi.mocked(objectExists).mockResolvedValue(true);

    const missing = await change(me.id, {});
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('IMAGE_KEY_REQUIRED');

    const others = await change(me.id, { imageKey: keyOf(other.id) });
    expect(others.status).toBe(403);
    expect(others.body.code).toBe('IMAGE_KEY_FORBIDDEN');

    const wrong = await change(me.id, { imageKey: `review/${me.id}/a.jpg` });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('PROFILE_IMAGE_NOT_FOUND');

    vi.mocked(objectExists).mockResolvedValue(false);
    const notUploaded = await change(me.id, { imageKey: keyOf(me.id) });
    expect(notUploaded.status).toBe(400);
    expect(notUploaded.body.code).toBe('PROFILE_IMAGE_NOT_FOUND');

    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).profileImageKey,
    ).toBeNull();
  });

  it('프로필 설정 전 회원은 403 PROFILE_REQUIRED', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    await agreeConsents(me.id);
    const res = await change(me.id, { imageKey: keyOf(me.id) });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });
});

describe('USER-07 DELETE /users/me/profile-image', () => {
  function remove(userId: bigint) {
    return request(app)
      .delete('/api/v1/users/me/profile-image')
      .set('Authorization', bearer(userId));
  }

  it('사진을 지우고 먹깨비로 되돌린다. 사진이 없어도 성공', async () => {
    const me = await createMember();
    const key = keyOf(me.id);
    await prisma.member.update({ where: { id: me.id }, data: { profileImageKey: key } });

    const res = await remove(me.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('기본 캐릭터로 바꿨어요.');
    expect(res.body.data).toEqual({ profileImageUrl: null, profileImageSource: 'DEFAULT' });
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).profileImageKey,
    ).toBeNull();
    expect(deleteObjectQuietly).toHaveBeenCalledWith(key);

    vi.mocked(deleteObjectQuietly).mockClear();
    const again = await remove(me.id);
    expect(again.status).toBe(200);
    expect(deleteObjectQuietly).not.toHaveBeenCalled();
  });
});

import { Storage } from '@google-cloud/storage';
import { env } from '../config/env';

let client: Storage | null = null;

function gcs() {
  // Compute Engine에서는 VM 서비스 계정으로 자격 증명을 얻는다 (키 파일을 넣지 않는다).
  // 로컬에서 실제 버킷을 쓰려면 gcloud auth application-default login 후 GCS_BUCKET을 채운다.
  client ??= new Storage();
  return client;
}

/**
 * 어느 버킷인지. public = 프로필·리뷰 사진(GCS_BUCKET, allUsers 읽기),
 * private = 영수증·현장·문의 사진(GCS_PRIVATE_BUCKET, 조회는 signed URL로만)
 */
export type BucketKind = 'public' | 'private';

function bucketName(kind: BucketKind) {
  return kind === 'public' ? env.GCS_BUCKET : env.GCS_PRIVATE_BUCKET;
}

/**
 * 그 key 파일의 앞 bytes바이트를 읽는다. 사진을 직접 올린(signed URL PUT) 뒤 그 key로 저장할 때
 * 파일이 있는지와 실제 형식(매직 바이트)을 확인한다. 파일이 없거나 버킷이 없으면(로컬 등) null, 빈 파일이면 빈 Buffer.
 */
export async function readObjectHead(
  key: string,
  bytes: number,
  kind: BucketKind = 'public',
): Promise<Buffer | null> {
  const bucket = bucketName(kind);
  if (!bucket) return null;
  try {
    const [head] = await gcs()
      .bucket(bucket)
      .file(key)
      .download({ start: 0, end: bytes - 1 });
    return head;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 404) return null;
    if (code === 416) return Buffer.alloc(0); // 빈 파일은 범위를 읽을 수 없다
    throw err;
  }
}

export interface UploadUrl {
  url: string;
  /** 업로드 요청에 그대로 넣어야 하는 헤더 (서명에 들어가 있어서 다르면 Cloud Storage가 거부한다) */
  headers: Record<string, string>;
}

/**
 * 브라우저가 파일을 직접 올릴 signed URL(V4, PUT)을 만든다.
 * 서명은 VM 서비스 계정이 IAM signBlob으로 한다(roles/iam.serviceAccountTokenCreator).
 * 크기는 x-goog-content-length-range 헤더로 서명에 묶어 maxBytes보다 큰 파일을 막는다.
 * 버킷이 없으면(로컬 등) null.
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
  maxBytes: number,
  expiresInSec: number,
  kind: BucketKind = 'public',
): Promise<UploadUrl | null> {
  const bucket = bucketName(kind);
  if (!bucket) return null;
  const lengthRange = `0,${maxBytes}`;
  const [url] = await gcs()
    .bucket(bucket)
    .file(key)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresInSec * 1000,
      contentType,
      extensionHeaders: { 'x-goog-content-length-range': lengthRange },
    });
  return {
    url,
    headers: { 'Content-Type': contentType, 'x-goog-content-length-range': lengthRange },
  };
}

/**
 * 비공개 버킷 사진을 잠깐 볼 수 있는 signed URL(V4, GET). 영수증·현장·문의 사진 조회(VISIT-04, CS-06)에 쓴다.
 * key가 없거나 버킷이 없으면 null. 서명에 실패해도 화면은 그려야 하므로 null을 주고 로그만 남긴다.
 */
export async function createReadUrl(
  key: string | null | undefined,
  expiresInSec = 600,
): Promise<string | null> {
  const bucket = bucketName('private');
  if (!key || !bucket) return null;
  try {
    const [url] = await gcs()
      .bucket(bucket)
      .file(key)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + expiresInSec * 1000 });
    return url;
  } catch (err) {
    console.error(`스토리지 조회 URL 생성 실패: ${key}`, err);
    return null;
  }
}

/**
 * 파일을 지운다. 없는 파일은 지운 것으로 본다. 실패해도 응답은 성공시키므로 로그만 남긴다
 * (DB는 이미 바뀌었고, 남은 파일은 수명 주기 규칙이나 배치로 정리한다).
 */
export async function deleteObjectQuietly(
  key: string | null | undefined,
  kind: BucketKind = 'public',
): Promise<void> {
  const bucket = bucketName(kind);
  if (!key || !bucket) return;
  try {
    await gcs().bucket(bucket).file(key).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error(`스토리지 파일 삭제 실패: ${key}`, err);
  }
}

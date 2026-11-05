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
 * Cloud Storage에 그 key의 파일이 있는지. 사진을 직접 올린(signed URL PUT) 뒤 그 key로 저장할 때 확인한다.
 * GCS_BUCKET이 없으면(로컬 등) 항상 false.
 */
export async function objectExists(key: string): Promise<boolean> {
  if (!env.GCS_BUCKET) return false;
  const [exists] = await gcs().bucket(env.GCS_BUCKET).file(key).exists();
  return exists;
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
 * GCS_BUCKET이 없으면(로컬 등) null.
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
  maxBytes: number,
  expiresInSec: number,
): Promise<UploadUrl | null> {
  if (!env.GCS_BUCKET) return null;
  const lengthRange = `0,${maxBytes}`;
  const [url] = await gcs()
    .bucket(env.GCS_BUCKET)
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
 * 파일을 지운다. 없는 파일은 지운 것으로 본다. 실패해도 응답은 성공시키므로 로그만 남긴다
 * (DB는 이미 바뀌었고, 남은 파일은 수명 주기 규칙이나 배치로 정리한다).
 */
export async function deleteObjectQuietly(key: string | null | undefined): Promise<void> {
  if (!key || !env.GCS_BUCKET) return;
  try {
    await gcs().bucket(env.GCS_BUCKET).file(key).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error(`스토리지 파일 삭제 실패: ${key}`, err);
  }
}

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

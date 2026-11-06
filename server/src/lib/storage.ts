import { HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

let client: S3Client | null = null;

function s3() {
  // EC2에서는 인스턴스 IAM 역할로 자격 증명을 얻는다 (Access Key를 넣지 않는다).
  client ??= new S3Client({ region: env.AWS_REGION });
  return client;
}

/**
 * S3에 그 key의 파일이 있는지. 사진을 직접 올린(presigned PUT) 뒤 그 key로 저장할 때 확인한다.
 * AWS_S3_BUCKET이 없으면(로컬 등) 항상 false.
 */
export async function objectExists(key: string): Promise<boolean> {
  if (!env.AWS_S3_BUCKET) return false;
  try {
    await s3().send(new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err instanceof NotFound) return false;
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

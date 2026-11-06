import { deletePrefixQuietly } from '../../lib/storage';
import { prisma } from '../../lib/prisma';
import { UPLOAD_PURPOSES } from '../upload/upload-purpose';

const PRIVATE_FOLDERS = Object.values(UPLOAD_PURPOSES)
  .filter((p) => p.bucket === 'private')
  .map((p) => p.folder);

/**
 * 탈퇴한 회원의 사진 폴더를 지운다 — 비공개 버킷의 영수증·현장·문의, 공개 버킷의 프로필. 리뷰 사진은 리뷰가 남아서 그대로 둔다.
 * key가 {폴더}/{회원 id}/... 라서 DB에 key가 없는 파일(올리고 저장하지 않은 사진)까지 지운다. 여러 번 불러도 된다.
 * 다 지우면 member.files_purged_at을 채우고, 하나라도 실패하면 비워 둬서 cleanup 작업이 다시 지운다.
 * @returns 다 지웠는지
 */
export async function purgeMemberFiles(userId: bigint, now = new Date()) {
  const id = userId.toString();
  const results = await Promise.all([
    ...PRIVATE_FOLDERS.map((folder) => deletePrefixQuietly(`${folder}/${id}/`, 'private')),
    deletePrefixQuietly(`profile/${id}/`, 'public'),
  ]);
  const purged = !results.includes(false);
  if (purged) await prisma.member.update({ where: { id: userId }, data: { filesPurgedAt: now } });
  return purged;
}

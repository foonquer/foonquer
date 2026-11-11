import { Link } from 'react-router';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import styles from './Ranking.module.css';

type Face = { profileImageUrl: string | null; mukkaebi: { hatCode: string | null } };

/** 순위·PICK 줄의 얼굴: 프로필 사진이 있으면 사진, 없으면 쓴 모자까지 그린 먹깨비 (피그마 구 랭킹) */
export function RankAvatar({
  row,
  size,
  ring,
}: {
  row: Face | undefined;
  size: number;
  ring?: number;
}) {
  return (
    <span className={styles.avatarBox} data-ring={ring} style={{ width: size, height: size }}>
      {row?.profileImageUrl ? (
        <img src={row.profileImageUrl} alt="" />
      ) : (
        <MukkaebiAvatar
          size={size}
          wearing={
            row?.mukkaebi.hatCode ? { HAT: { code: row.mukkaebi.hatCode, name: '' } } : undefined
          }
        />
      )}
    </span>
  );
}

type RankRow = Face & {
  rank: number | null;
  userId: number | null;
  nickname: string | null;
  conquestCount: number;
  tierName: string;
  isMe: boolean;
};

/** 순위 목록 (피그마 241:1176): 순위 · 먹깨비 · 닉네임 + 티어 · 정복 수, 줄을 누르면 프로필. 구 랭킹·구 현황 */
export function RankList({ rows, label }: { rows: RankRow[]; label: string }) {
  return (
    <ol className={styles.rankList} aria-label={label}>
      {rows.map((r) => {
        const body = (
          <>
            <span className={styles.rankNo} data-rank={r.rank}>
              {r.rank}
            </span>
            <RankAvatar row={r} size={34} />
            <span className={styles.rankName}>
              <strong>{r.nickname}</strong>
              {r.isMe && <span className={styles.meChip}>나</span>}
              <span className={styles.rowTier}>{r.tierName}</span>
            </span>
            <span className={styles.rankCount}>{r.conquestCount}곳</span>
          </>
        );
        return (
          <li key={r.rank} data-me={r.isMe}>
            {r.userId !== null ? (
              <Link to={`/users/${r.userId}`} className={styles.rankRow}>
                {body}
              </Link>
            ) : (
              <div className={styles.rankRow}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
